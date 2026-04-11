import { randomUUID } from "node:crypto";
import { createStreamDelivery } from "./websocket/stream-delivery";
import { dispatchMessage } from "./websocket/dispatch";
import { isClientMessage } from "./websocket/message-validation";
import { registerAgentEventForwarding } from "./websocket/routes/agent-routes";
import {
	extractRequestId,
	sendEnvelope,
	toErrorMessage,
	type WebSocketDeps,
	type WebSocketLike,
	type WsRouteContext,
} from "./websocket/route-context";

export type { WebSocketDeps, WebSocketLike } from "./websocket/route-context";

export function handleWebSocket(
	socket: WebSocketLike,
	deps: WebSocketDeps,
): void {
	console.log("[ws] Client connected");
	const connectionId = randomUUID();
	const inFlightPrompts = new Map<
		string,
		import("./websocket/route-context").InFlightPromptState
	>();
	const streamDelivery = createStreamDelivery({
		send(targetConnectionId, message) {
			if (targetConnectionId !== connectionId) {
				return;
			}
			sendEnvelope(socket, message);
		},
	});

	const ctx: WsRouteContext = {
		socket,
		deps,
		connectionId,
		streamDelivery,
		inFlightPrompts,
	};
	const { onAgentStatus, onAgentError } = registerAgentEventForwarding(
		socket,
		deps,
	);

	socket.on("message", (raw: Buffer | string) => {
		void handleIncomingMessage(raw, ctx);
	});

	socket.on("close", () => {
		inFlightPrompts.clear();
		deps.agentManager.emitter.off("agent:status", onAgentStatus);
		deps.agentManager.emitter.off("error", onAgentError);
		console.log("[ws] Client disconnected");
	});

	socket.on("error", (err: Error) => {
		console.error("[ws] Socket error:", err.message);
	});
}

async function handleIncomingMessage(
	raw: Buffer | string,
	ctx: WsRouteContext,
): Promise<void> {
	try {
		const parsed = JSON.parse(
			typeof raw === "string" ? raw : raw.toString("utf-8"),
		) as unknown;
		const requestId = extractRequestId(parsed);

		if (!isClientMessage(parsed)) {
			sendEnvelope(ctx.socket, {
				type: "error",
				requestId,
				message: "Invalid message format",
			});
			return;
		}

		const message = parsed;
		console.log("[ws] Received:", message.type);
		await dispatchMessage(ctx, message);
	} catch (error) {
		console.error("[ws] Failed to handle message:", error);
		sendEnvelope(ctx.socket, {
			type: "error",
			message: toErrorMessage(error),
		});
	}
}
