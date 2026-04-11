import { randomUUID } from "node:crypto";
import type { ClientMessage } from "../../../shared/types";
import type { CanonicalStreamCallbacks } from "../../sessions/session-types";
import {
	cancelCompatibilitySession,
	openCompatibilitySession,
	sendCompatibilitySession,
} from "./compat-session-routes";
import {
	getDerivedTitle,
	logRouteFailure,
	parseSessionRouting,
	sendEnvelope,
	sendError,
	sendSessionError,
	toErrorMessage,
	type InFlightPromptState,
	type WsRouteContext,
} from "../route-context";

function clearInFlightState(
	inFlightPrompts: Map<string, InFlightPromptState>,
	sessionId: string,
): InFlightPromptState | undefined {
	const state = inFlightPrompts.get(sessionId);
	inFlightPrompts.delete(sessionId);
	return state;
}

function shouldUseCompatibilityRoute(
	ctx: WsRouteContext,
	sessionId: string,
): boolean {
	const routing = parseSessionRouting(sessionId);
	return !ctx.deps.sessionServices.runtime.supports(routing.cliType);
}

export async function handleSessionRoute(
	ctx: WsRouteContext,
	message: Extract<
		ClientMessage,
		{
			type:
				| "session:create"
				| "session:open"
				| "session:send"
				| "session:cancel"
				| "session:archive"
				| "session:list";
		}
	>,
): Promise<void> {
	switch (message.type) {
		case "session:create": {
			try {
				const created = await ctx.deps.sessionServices.create.createSession(
					message.projectId,
					message.cliType,
				);
				sendEnvelope(ctx.socket, {
					type: "session:created",
					sessionId: created.id,
					projectId: message.projectId,
					requestId: message.requestId,
				});
			} catch (error) {
				sendError(ctx, message.requestId, toErrorMessage(error));
			}
			return;
		}

		case "session:open": {
			try {
				const entries = shouldUseCompatibilityRoute(ctx, message.sessionId)
					? await openCompatibilitySession(ctx, {
							sessionId: message.sessionId,
							projectId: message.projectId,
						})
					: (
							await ctx.deps.sessionServices.open.openSession(
								message.sessionId,
								message.projectId,
							)
						).history;
				ctx.streamDelivery.deliverHistory(
					ctx.connectionId,
					message.sessionId,
					entries,
				);
			} catch (error) {
				const messageText = toErrorMessage(error);
				const reason =
					error instanceof Error &&
					"reason" in error &&
					typeof (error as { reason?: unknown }).reason === "string"
						? (error as { reason: string }).reason
						: "open_failed";
				logRouteFailure({
					route: "session:open",
					sessionId: message.sessionId,
					projectId: message.projectId,
					reason,
					error,
				});
				sendSessionError(
					ctx,
					message.sessionId,
					messageText,
					message.requestId,
				);
			}
			return;
		}

		case "session:send": {
			if (shouldUseCompatibilityRoute(ctx, message.sessionId)) {
				await sendCompatibilitySession(ctx, message);
				return;
			}

			try {
				const inFlightState: InFlightPromptState = {
					turnId: randomUUID(),
					cancelRequested: false,
				};
				ctx.inFlightPrompts.set(message.sessionId, inFlightState);

				const callbacks: CanonicalStreamCallbacks = {
					onUpsert: (upsert) => {
						ctx.streamDelivery.deliverUpsert(
							ctx.connectionId,
							message.sessionId,
							upsert,
						);
					},
					onTurn: (event) => {
						inFlightState.turnId = event.turnId;
						if (
							event.type === "turn_complete" &&
							inFlightState.cancelRequested &&
							event.status === "completed"
						) {
							ctx.streamDelivery.deliverTurn(
								ctx.connectionId,
								message.sessionId,
								{
									...event,
									status: "cancelled",
								},
							);
						} else {
							ctx.streamDelivery.deliverTurn(
								ctx.connectionId,
								message.sessionId,
								event,
							);
						}
						if (event.type === "turn_complete" || event.type === "turn_error") {
							ctx.inFlightPrompts.delete(message.sessionId);
						}
					},
				};

				const promptResult =
					await ctx.deps.sessionServices.messages.sendMessage(
						message.sessionId,
						message.content,
						callbacks,
					);
				const derivedTitle = getDerivedTitle(promptResult);
				if (derivedTitle) {
					sendEnvelope(ctx.socket, {
						type: "session:title-updated",
						sessionId: message.sessionId,
						title: derivedTitle,
					});
				}
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
			return;
		}

		case "session:cancel": {
			if (shouldUseCompatibilityRoute(ctx, message.sessionId)) {
				await cancelCompatibilitySession(ctx, message);
				return;
			}

			try {
				await ctx.deps.sessionServices.messages.cancelTurn(message.sessionId);
				const inFlightState = ctx.inFlightPrompts.get(message.sessionId);
				if (inFlightState) {
					inFlightState.cancelRequested = true;
				}
			} catch (error) {
				sendError(ctx, message.requestId, toErrorMessage(error));
			}
			return;
		}

		case "session:archive": {
			try {
				ctx.deps.sessionServices.registry.archive(message.sessionId);
				sendEnvelope(ctx.socket, {
					type: "session:archived",
					sessionId: message.sessionId,
					requestId: message.requestId,
				});
			} catch (error) {
				sendError(ctx, message.requestId, toErrorMessage(error));
			}
			return;
		}

		case "session:list": {
			try {
				const sessions = await ctx.deps.sessionServices.listing.listSessions(
					message.projectId,
				);
				sendEnvelope(ctx.socket, {
					type: "session:list",
					projectId: message.projectId,
					sessions,
				});
			} catch (error) {
				sendError(ctx, message.requestId, toErrorMessage(error));
			}
		}
	}
}
