import { randomUUID } from "node:crypto";
import { toHistoryUpserts } from "../../streaming/history-compat";
import type { UpsertObject } from "../../streaming/upsert-types";
import {
	createTurnStartedEvent,
	createUpsertBridgeState,
	finalizeBridgeUpserts,
	mapAcpEventToUpsert,
	resolveTurnCompletionStatus,
} from "../legacy-stream-bridge";
import {
	getProjectPath,
	parseSessionRouting,
	sendEnvelope,
	sendError,
	toErrorMessage,
	type InFlightPromptState,
	type WsRouteContext,
} from "../route-context";

class CompatibilityRouteError extends Error {
	readonly reason = "compatibility_only_fallback" as const;
}

async function resolveCompatibilityProjectPath(
	ctx: WsRouteContext,
	canonicalSessionId: string,
	projectId?: string,
): Promise<string> {
	if (projectId) {
		return getProjectPath(ctx.deps.projectStore, projectId);
	}

	const storedProjectId =
		ctx.deps.sessionServices.registry.get(canonicalSessionId)?.projectId;
	if (storedProjectId) {
		return getProjectPath(ctx.deps.projectStore, storedProjectId);
	}

	return ".";
}

function clearInFlightState(
	inFlightPrompts: Map<string, InFlightPromptState>,
	sessionId: string,
): InFlightPromptState | undefined {
	const state = inFlightPrompts.get(sessionId);
	inFlightPrompts.delete(sessionId);
	return state;
}

function maybeUpdateLocalCompatibilityTitle(
	ctx: WsRouteContext,
	sessionId: string,
	content: string,
): string | undefined {
	const session = ctx.deps.sessionServices.registry.get(sessionId);
	if (!session) {
		return undefined;
	}

	const titleUpdated =
		ctx.deps.sessionServices.title.maybeApplyInitialPromptTitle(
			session,
			content,
		);
	ctx.deps.sessionServices.registry.updateSyncBlocking(sessionId, () => ({
		...session,
		lastActiveAt: new Date().toISOString(),
	}));
	return titleUpdated;
}

function finalizeCompatibilityActivity(
	ctx: WsRouteContext,
	sessionId: string,
): void {
	const session = ctx.deps.sessionServices.registry.get(sessionId);
	if (!session) {
		return;
	}
	ctx.deps.sessionServices.registry.updateSyncBlocking(
		sessionId,
		(current) => ({
			...current,
			lastActiveAt: new Date().toISOString(),
		}),
	);
}

function sendCompatibilityTitleUpdate(
	ctx: WsRouteContext,
	sessionId: string,
	titleUpdated: string | undefined,
): void {
	if (!titleUpdated) {
		return;
	}
	sendEnvelope(ctx.socket, {
		type: "session:title-updated",
		sessionId,
		title: titleUpdated,
	});
}

export async function openCompatibilitySession(
	ctx: WsRouteContext,
	params: {
		sessionId: string;
		projectId?: string;
	},
): Promise<UpsertObject[]> {
	const routing = parseSessionRouting(params.sessionId);
	const projectDir = await resolveCompatibilityProjectPath(
		ctx,
		params.sessionId,
		params.projectId,
	);

	try {
		const client = await ctx.deps.agentManager.ensureAgent(routing.cliType);
		const history = await client.sessionLoad(
			routing.acpSessionId,
			projectDir,
			undefined,
		);
		return toHistoryUpserts(history, params.sessionId);
	} catch (error) {
		throw new CompatibilityRouteError(
			error instanceof Error
				? error.message
				: "Compatibility session open failed",
		);
	}
}

export async function sendCompatibilitySession(
	ctx: WsRouteContext,
	message: {
		sessionId: string;
		content: string;
		requestId?: string;
	},
): Promise<void> {
	try {
		const routing = parseSessionRouting(message.sessionId);
		const inFlightState: InFlightPromptState = {
			turnId: randomUUID(),
			cancelRequested: false,
		};
		ctx.inFlightPrompts.set(message.sessionId, inFlightState);
		const turnId = inFlightState.turnId;
		const bridgeState = createUpsertBridgeState(message.sessionId, turnId);
		const titleUpdated = maybeUpdateLocalCompatibilityTitle(
			ctx,
			message.sessionId,
			message.content,
		);

		ctx.streamDelivery.deliverTurn(
			ctx.connectionId,
			message.sessionId,
			createTurnStartedEvent(message.sessionId, turnId),
		);

		const client = await ctx.deps.agentManager.ensureAgent(routing.cliType);
		const promptResult = await client.sessionPrompt(
			routing.acpSessionId,
			message.content,
			(event) => {
				const upsert = mapAcpEventToUpsert(event, bridgeState);
				if (!upsert) {
					return;
				}
				ctx.streamDelivery.deliverUpsert(
					ctx.connectionId,
					message.sessionId,
					upsert,
				);
			},
		);

		sendCompatibilityTitleUpdate(ctx, message.sessionId, titleUpdated);
		finalizeCompatibilityActivity(ctx, message.sessionId);

		for (const finalizedUpsert of finalizeBridgeUpserts(bridgeState)) {
			ctx.streamDelivery.deliverUpsert(
				ctx.connectionId,
				message.sessionId,
				finalizedUpsert,
			);
		}

		const completionStatus = resolveTurnCompletionStatus(
			promptResult.stopReason,
			inFlightState.cancelRequested,
		);
		ctx.inFlightPrompts.delete(message.sessionId);
		if (completionStatus === null) {
			ctx.streamDelivery.deliverTurn(ctx.connectionId, message.sessionId, {
				type: "turn_error",
				turnId,
				sessionId: message.sessionId,
				errorCode: "PROTOCOL_ERROR",
				errorMessage: `Unsupported stop reason: ${promptResult.stopReason}`,
			});
			return;
		}

		ctx.streamDelivery.deliverTurn(ctx.connectionId, message.sessionId, {
			type: "turn_complete",
			turnId,
			sessionId: message.sessionId,
			status: completionStatus,
		});
	} catch (error) {
		const messageText = toErrorMessage(error);
		const inFlightState = clearInFlightState(
			ctx.inFlightPrompts,
			message.sessionId,
		);
		sendEnvelope(ctx.socket, {
			type: "session:error",
			sessionId: message.sessionId,
			message: messageText,
		});
		if (inFlightState) {
			ctx.streamDelivery.deliverTurn(ctx.connectionId, message.sessionId, {
				type: "turn_error",
				turnId: inFlightState.turnId,
				sessionId: message.sessionId,
				errorCode: "PROCESS_CRASH",
				errorMessage: messageText,
			});
		}
		sendError(ctx, message.requestId, messageText);
	}
}

export async function cancelCompatibilitySession(
	ctx: WsRouteContext,
	message: {
		sessionId: string;
		requestId?: string;
	},
): Promise<void> {
	try {
		const routing = parseSessionRouting(message.sessionId);
		const client = await ctx.deps.agentManager.ensureAgent(routing.cliType);
		client.sessionCancel(routing.acpSessionId);
		const inFlightState = ctx.inFlightPrompts.get(message.sessionId);
		if (inFlightState) {
			inFlightState.cancelRequested = true;
		}
	} catch (error) {
		sendError(ctx, message.requestId, toErrorMessage(error));
	}
}
