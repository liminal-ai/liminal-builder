import type { WebSocket } from "@fastify/websocket";
import type { ClientMessage, ServerMessage } from "../shared/types";

function sendEnvelope(socket: WebSocket, message: ServerMessage): void {
	socket.send(JSON.stringify(message));
}

function isClientMessage(value: unknown): value is ClientMessage {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as { type?: unknown };
	return typeof candidate.type === "string";
}

/**
 * WebSocket connection handler.
 * Routes client messages to project-store, session-manager, agent-manager.
 * Sends server messages back to the connected client.
 */
export function handleWebSocket(socket: WebSocket): void {
	console.log("[ws] Client connected");

	socket.on("message", (raw: Buffer | string) => {
		try {
			const parsed = JSON.parse(
				typeof raw === "string" ? raw : raw.toString("utf-8"),
			) as unknown;
			if (!isClientMessage(parsed)) {
				sendEnvelope(socket, {
					type: "error",
					message: "Invalid message format",
				});
				return;
			}

			const message = parsed;
			console.log("[ws] Received:", message.type);

			// Message routing will be implemented per-story.
			// For now, send an error response for any message.
			const response: ServerMessage = {
				type: "error",
				requestId: message.requestId,
				message: `Handler not implemented: ${message.type}`,
			};
			sendEnvelope(socket, response);
		} catch (err) {
			console.error("[ws] Failed to parse message:", err);
			const response: ServerMessage = {
				type: "error",
				message: "Invalid message format",
			};
			sendEnvelope(socket, response);
		}
	});

	socket.on("close", () => {
		console.log("[ws] Client disconnected");
	});

	socket.on("error", (err: Error) => {
		console.error("[ws] Socket error:", err.message);
	});
}
