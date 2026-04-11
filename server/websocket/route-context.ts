import type { EventEmitter } from "node:events";
import type { ClientMessage, ServerMessage } from "../../shared/types";
import type { StreamDelivery } from "../../shared/stream-contracts";
import type { AcpPromptResult } from "../acp/acp-types";
import type { AcpClient } from "../acp/acp-client";
import type { ProjectStore } from "../projects/project-store";
import type { BuilderSessionServices } from "../sessions/session-services";
import type { CliType, SessionPromptResult } from "../sessions/session-types";

export type WebSocketLike = {
	send: (payload: string) => void;
	on: {
		(event: "message", listener: (raw: Buffer | string) => void): void;
		(event: "close", listener: () => void): void;
		(event: "error", listener: (error: Error) => void): void;
	};
};

export type ProjectStoreLike = Pick<
	ProjectStore,
	"addProject" | "removeProject" | "listProjects"
>;

export interface WebSocketDeps {
	projectStore: ProjectStoreLike;
	agentManager: {
		emitter: Pick<EventEmitter, "on" | "off">;
		ensureAgent: (cliType: CliType) => Promise<AcpClient>;
		reconnect?: (cliType: CliType) => Promise<void>;
	};
	sessionServices: Pick<
		BuilderSessionServices,
		| "create"
		| "listing"
		| "open"
		| "registry"
		| "messages"
		| "runtime"
		| "title"
	>;
}

export type SessionRouting = {
	cliType: CliType;
	acpSessionId: string;
};

export type InFlightPromptState = {
	turnId: string;
	cancelRequested: boolean;
};

export interface WsRouteContext {
	socket: WebSocketLike;
	deps: WebSocketDeps;
	connectionId: string;
	streamDelivery: StreamDelivery;
	inFlightPrompts: Map<string, InFlightPromptState>;
}

export function sendEnvelope(
	socket: WebSocketLike,
	message: ServerMessage,
): void {
	socket.send(JSON.stringify(message));
}

function isCliType(value: string): value is CliType {
	return value === "claude-code" || value === "codex";
}

export function parseSessionRouting(sessionId: string): SessionRouting {
	const colonIndex = sessionId.indexOf(":");
	if (colonIndex > 0) {
		const maybeCliType = sessionId.substring(0, colonIndex);
		if (isCliType(maybeCliType)) {
			return {
				cliType: maybeCliType,
				acpSessionId: sessionId.substring(colonIndex + 1),
			};
		}
	}

	return {
		cliType: "claude-code",
		acpSessionId: sessionId,
	};
}

export function toCanonicalSessionId(
	cliType: CliType,
	sessionId: string,
): string {
	const parsed = parseSessionRouting(sessionId);
	if (parsed.cliType === cliType && sessionId.includes(":")) {
		return sessionId;
	}
	return `${cliType}:${parsed.acpSessionId}`;
}

export function getDerivedTitle(
	result: SessionPromptResult | AcpPromptResult,
): string | undefined {
	if ("titleUpdated" in result) {
		return result.titleUpdated;
	}
	return undefined;
}

export function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Internal error";
}

export function extractRequestId(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}

	const requestId = (value as Record<string, unknown>).requestId;
	return typeof requestId === "string" ? requestId : undefined;
}

export async function getProjectPath(
	projectStore: ProjectStoreLike,
	projectId: string,
): Promise<string> {
	const projects = await projectStore.listProjects();
	const project = projects.find((candidate) => candidate.id === projectId);
	if (!project) {
		throw new Error("Project not found");
	}
	return project.path;
}

export function sendError(
	ctx: WsRouteContext,
	requestId: string | undefined,
	message: string,
): void {
	sendEnvelope(ctx.socket, {
		type: "error",
		requestId,
		message,
	});
}

export function sendSessionError(
	ctx: WsRouteContext,
	sessionId: string,
	message: string,
	requestId?: string,
): void {
	sendEnvelope(ctx.socket, {
		type: "session:error",
		sessionId,
		message,
	});
	sendError(ctx, requestId, message);
}

export function logRouteFailure(params: {
	route: ClientMessage["type"];
	sessionId?: string;
	projectId?: string;
	reason: string;
	error?: unknown;
}): void {
	const details = {
		route: params.route,
		sessionId: params.sessionId ?? null,
		projectId: params.projectId ?? null,
		reason: params.reason,
		error:
			params.error instanceof Error
				? params.error.message
				: (params.error ?? null),
	};
	console.error("[ws] Route failure", details);
}
