import type { WebSocket } from "@fastify/websocket";
import type { ClientMessage, ServerMessage } from "../shared/types";
import type { ProjectStore } from "./projects/project-store";

export interface WebSocketDeps {
	projectStore: ProjectStore;
}

function sendEnvelope(socket: WebSocket, message: ServerMessage): void {
	socket.send(JSON.stringify(message));
}

function isClientMessage(value: unknown): value is ClientMessage {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	if (typeof candidate.type !== "string") {
		return false;
	}

	switch (candidate.type) {
		case "project:add":
			return typeof candidate.path === "string";
		case "project:remove":
			return typeof candidate.projectId === "string";
		case "project:list":
			return true;
		case "session:open":
		case "session:cancel":
		case "session:archive":
			return typeof candidate.sessionId === "string";
		case "session:create":
			return (
				typeof candidate.projectId === "string" &&
				(candidate.cliType === "claude-code" || candidate.cliType === "codex")
			);
		case "session:send":
			return (
				typeof candidate.sessionId === "string" &&
				typeof candidate.content === "string"
			);
		case "session:reconnect":
			return (
				candidate.cliType === "claude-code" || candidate.cliType === "codex"
			);
		case "session:list":
			return typeof candidate.projectId === "string";
		default:
			return false;
	}
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Internal error";
}

/**
 * WebSocket connection handler.
 * Routes client messages to project-store, session-manager, agent-manager.
 * Sends server messages back to the connected client.
 */
export function handleWebSocket(socket: WebSocket, deps: WebSocketDeps): void {
	console.log("[ws] Client connected");

	socket.on("message", (raw: Buffer | string) => {
		void handleIncomingMessage(socket, raw, deps);
	});

	socket.on("close", () => {
		console.log("[ws] Client disconnected");
	});

	socket.on("error", (err: Error) => {
		console.error("[ws] Socket error:", err.message);
	});
}

async function handleIncomingMessage(
	socket: WebSocket,
	raw: Buffer | string,
	deps: WebSocketDeps,
): Promise<void> {
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
		await routeMessage(socket, message, deps);
	} catch (error) {
		console.error("[ws] Failed to handle message:", error);
		sendEnvelope(socket, {
			type: "error",
			message: toErrorMessage(error),
		});
	}
}

async function routeMessage(
	socket: WebSocket,
	message: ClientMessage,
	deps: WebSocketDeps,
): Promise<void> {
	switch (message.type) {
		case "project:add": {
			try {
				const project = await deps.projectStore.addProject(message.path);
				sendEnvelope(socket, {
					type: "project:added",
					project,
					requestId: message.requestId,
				});
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "project:remove": {
			try {
				await deps.projectStore.removeProject(message.projectId);
				sendEnvelope(socket, {
					type: "project:removed",
					projectId: message.projectId,
					requestId: message.requestId,
				});
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "project:list": {
			try {
				const projects = await deps.projectStore.listProjects();
				sendEnvelope(socket, {
					type: "project:list",
					projects,
				});
			} catch (error) {
				sendEnvelope(socket, {
					type: "error",
					requestId: message.requestId,
					message: toErrorMessage(error),
				});
			}
			break;
		}

		case "session:open":
		case "session:create":
		case "session:send":
		case "session:cancel":
		case "session:archive":
		case "session:reconnect":
		case "session:list": {
			sendEnvelope(socket, {
				type: "error",
				requestId: message.requestId,
				message: `Handler not implemented: ${message.type}`,
			});
			break;
		}
	}
}
