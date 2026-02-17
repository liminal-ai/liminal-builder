import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { AcpUpdateEvent } from "../../../server/acp/acp-types";
import type { WebSocketDeps } from "../../../server/websocket";
import { handleWebSocket } from "../../../server/websocket";
import type { ServerMessage } from "../../../shared/types";

type MessageListener = (payload: Buffer | string) => void;
type MockSessionManager = NonNullable<WebSocketDeps["sessionManager"]>;

class MockSocket {
	private messageListeners: MessageListener[] = [];
	private sentPayloads: string[] = [];

	send(payload: string): void {
		this.sentPayloads.push(payload);
	}

	on(
		event: "message" | "close" | "error",
		listener: (...args: unknown[]) => void,
	): void {
		if (event === "message") {
			this.messageListeners.push(listener as MessageListener);
		}
	}

	emitMessage(message: unknown): void {
		const payload =
			typeof message === "string" ? message : JSON.stringify(message);
		for (const listener of this.messageListeners) {
			listener(payload);
		}
	}

	getMessages(): ServerMessage[] {
		return this.sentPayloads.map(
			(payload) => JSON.parse(payload) as ServerMessage,
		);
	}
}

function flushAsync(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function createSessionManager(): MockSessionManager {
	return {
		listSessions: () => [],
		createSession: async () => "claude-code:created-session",
		openSession: async () => [],
		archiveSession: () => {},
		sendMessage: async (_sessionId, _content, onEvent) => {
			onEvent({
				type: "agent_message_chunk",
				content: [{ type: "text", text: "hello from provider" }],
			} as AcpUpdateEvent);
			return { stopReason: "end_turn" };
		},
	};
}

function createDeps(): WebSocketDeps {
	const emitter = new EventEmitter();
	return {
		projectStore: {
			addProject: async () => ({
				id: "p1",
				path: ".",
				name: "p1",
				addedAt: "2026-02-17T00:00:00.000Z",
			}),
			removeProject: async () => {},
			listProjects: async () => [
				{
					id: "p1",
					path: ".",
					name: "p1",
					addedAt: "2026-02-17T00:00:00.000Z",
				},
			],
		},
		agentManager: {
			emitter,
			ensureAgent: async () => {
				throw new Error("not used in delivery test");
			},
		},
		sessionManager: createSessionManager(),
	};
}

async function send(socket: MockSocket, message: unknown): Promise<void> {
	socket.emitMessage(message);
	await flushAsync();
}

describe("WebSocket delivery cleanup (Story 6, Red)", () => {
	it("TC-7.4a: legacy message emission paths are removed from active streaming flow", async () => {
		const socket = new MockSocket();
		handleWebSocket(socket as never, createDeps());

		await send(socket, {
			type: "session:send",
			sessionId: "claude-code:test-session",
			content: "hello",
		});

		const messages = socket.getMessages();
		const legacyTypes = new Set([
			"session:update",
			"session:chunk",
			"session:complete",
			"session:cancelled",
		]);
		const hasLegacy = messages.some((message) => legacyTypes.has(message.type));
		const hasUpsert = messages.some(
			(message) =>
				message.type === "session:upsert" || message.type === "session:turn",
		);

		expect(hasLegacy).toBe(false);
		expect(hasUpsert).toBe(true);
	});
});
