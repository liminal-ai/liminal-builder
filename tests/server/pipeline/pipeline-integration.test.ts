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

function createSessionManager(): MockSessionManager {
	return {
		listSessions: () => [],
		createSession: async () => "claude-code:created-session",
		openSession: async () => [],
		archiveSession: () => {},
		sendMessage: async (sessionId, content, onEvent) => {
			if (content.includes("tool")) {
				onEvent({
					type: "tool_call",
					toolCallId: `call-${sessionId}`,
					title: "read_file",
					status: "running",
					content: [],
				} as AcpUpdateEvent);
				onEvent({
					type: "tool_call_update",
					toolCallId: `call-${sessionId}`,
					title: "read_file",
					status: "completed",
					content: [{ type: "text", text: "ok" }],
				} as AcpUpdateEvent);
			} else {
				onEvent({
					type: "agent_message_chunk",
					content: [{ type: "text", text: `stream-${sessionId}` }],
				} as AcpUpdateEvent);
			}
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
				throw new Error("not used in pipeline integration tests");
			},
		},
		sessionManager: createSessionManager(),
	};
}

async function send(socket: MockSocket, message: unknown): Promise<void> {
	socket.emitMessage(message);
	await flushAsync();
}

describe("Provider callback pipeline integration (Story 6, Red)", () => {
	it("TC-7.1a: Claude text streaming reaches browser as message upserts", async () => {
		const socket = new MockSocket();
		handleWebSocket(socket as never, createDeps());

		await send(socket, { type: "session:hello", streamProtocol: "upsert-v1" });
		await send(socket, {
			type: "session:send",
			sessionId: "claude-code:session-a",
			content: "stream text",
		});

		const upserts = socket
			.getMessages()
			.filter((message) => message.type === "session:upsert");

		expect(upserts.length).toBeGreaterThan(0);
	});

	it("TC-7.1b: Codex text streaming reaches browser as message upserts", async () => {
		const socket = new MockSocket();
		handleWebSocket(socket as never, createDeps());

		await send(socket, { type: "session:hello", streamProtocol: "upsert-v1" });
		await send(socket, {
			type: "session:send",
			sessionId: "codex:session-b",
			content: "stream text",
		});

		const upserts = socket
			.getMessages()
			.filter((message) => message.type === "session:upsert");

		expect(upserts.length).toBeGreaterThan(0);
	});

	it("TC-7.1c: tool-call create/complete upserts arrive for both providers", async () => {
		const socket = new MockSocket();
		handleWebSocket(socket as never, createDeps());

		await send(socket, { type: "session:hello", streamProtocol: "upsert-v1" });
		await send(socket, {
			type: "session:send",
			sessionId: "claude-code:session-tool",
			content: "run tool",
		});
		await send(socket, {
			type: "session:send",
			sessionId: "codex:session-tool",
			content: "run tool",
		});

		const toolUpserts = socket
			.getMessages()
			.filter((message) => message.type === "session:upsert")
			.filter((message) => message.payload.type === "tool_call");

		expect(toolUpserts.length).toBeGreaterThanOrEqual(4);
	});
});
