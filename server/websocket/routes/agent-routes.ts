import type { ClientMessage } from "../../../shared/types";
import {
	sendEnvelope,
	toErrorMessage,
	type WebSocketDeps,
	type WebSocketLike,
} from "../route-context";

export function registerAgentEventForwarding(
	socket: WebSocketLike,
	deps: WebSocketDeps,
): {
	onAgentStatus: (payload: {
		cliType: "claude-code" | "codex";
		status: "starting" | "connected" | "disconnected" | "reconnecting" | "idle";
	}) => void;
	onAgentError: (payload: {
		cliType: "claude-code" | "codex";
		message: string;
	}) => void;
} {
	const onAgentStatus = (payload: {
		cliType: "claude-code" | "codex";
		status: "starting" | "connected" | "disconnected" | "reconnecting" | "idle";
	}) => {
		if (payload.status === "idle") {
			return;
		}
		sendEnvelope(socket, {
			type: "agent:status",
			cliType: payload.cliType,
			status: payload.status,
		});
	};

	const onAgentError = (payload: {
		cliType: "claude-code" | "codex";
		message: string;
	}) => {
		sendEnvelope(socket, {
			type: "error",
			message: payload.message,
		});
	};

	deps.agentManager.emitter.on("agent:status", onAgentStatus);
	deps.agentManager.emitter.on("error", onAgentError);

	return { onAgentStatus, onAgentError };
}

export async function handleAgentReconnectRoute(
	ctx: {
		socket: WebSocketLike;
		deps: WebSocketDeps;
	},
	message: Extract<ClientMessage, { type: "session:reconnect" }>,
): Promise<void> {
	try {
		if (!ctx.deps.agentManager.reconnect) {
			sendEnvelope(ctx.socket, {
				type: "error",
				requestId: message.requestId,
				message: "session:reconnect is unavailable",
			});
			return;
		}
		sendEnvelope(ctx.socket, {
			type: "agent:status",
			cliType: message.cliType,
			status: "reconnecting",
		});
		await ctx.deps.agentManager.reconnect(message.cliType);
	} catch (error) {
		sendEnvelope(ctx.socket, {
			type: "error",
			requestId: message.requestId,
			message: toErrorMessage(error),
		});
	}
}
