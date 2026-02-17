import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { ChatEntry, ServerMessage } from "../../../shared/types";
import type { WebSocketDeps } from "../../../server/websocket";
import { handleWebSocket } from "../../../server/websocket";

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
	) {
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

function createLegacyHistory(sessionId: string): ChatEntry[] {
	return [
		{
			entryId: `${sessionId}-assistant-1`,
			type: "assistant",
			content: `history-${sessionId}`,
			timestamp: "2026-02-17T00:00:00.000Z",
		},
	];
}

function createSessionManager(): MockSessionManager {
	return {
		listSessions: async () => [],
		createSession: async () => "claude-code:created-session",
		openSession: async (sessionId) => createLegacyHistory(sessionId),
		archiveSession: () => {},
		sendMessage: async () => ({ stopReason: "end_turn" }),
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
				throw new Error("not used in history pipeline tests");
			},
		},
		sessionManager: createSessionManager(),
	};
}

async function send(socket: MockSocket, message: unknown): Promise<void> {
	socket.emitMessage(message);
	await flushAsync();
}

function getHistoryMessage(
	messages: ServerMessage[],
): ServerMessage | undefined {
	return messages.find((message) => message.type === "session:history");
}

describe("Session history pipeline migration (Story 6, Red)", () => {
	it("TC-7.3a: Claude session load renders history via upsert pipeline", async () => {
		const socket = new MockSocket();
		handleWebSocket(socket as never, createDeps());

		await send(socket, { type: "session:hello", streamProtocol: "upsert-v1" });
		await send(socket, {
			type: "session:open",
			sessionId: "claude-code:history-a",
		});

		const historyMessage = getHistoryMessage(socket.getMessages());
		expect(historyMessage).toBeDefined();
		if (!historyMessage || historyMessage.type !== "session:history") {
			return;
		}

		expect(
			historyMessage.entries.every(
				(entry) => typeof (entry as { itemId?: unknown }).itemId === "string",
			),
		).toBe(true);
	});

	it("TC-7.3b: Codex session load renders history via upsert pipeline", async () => {
		const socket = new MockSocket();
		handleWebSocket(socket as never, createDeps());

		await send(socket, { type: "session:hello", streamProtocol: "upsert-v1" });
		await send(socket, {
			type: "session:open",
			sessionId: "codex:history-b",
		});

		const historyMessage = getHistoryMessage(socket.getMessages());
		expect(historyMessage).toBeDefined();
		if (!historyMessage || historyMessage.type !== "session:history") {
			return;
		}

		expect(
			historyMessage.entries.every(
				(entry) => typeof (entry as { itemId?: unknown }).itemId === "string",
			),
		).toBe(true);
	});
});
