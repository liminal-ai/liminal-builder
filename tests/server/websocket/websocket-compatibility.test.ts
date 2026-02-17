import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
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
				throw new Error("not used in compatibility test");
			},
		},
		sessionManager: createSessionManager(),
	};
}

async function send(socket: MockSocket, message: unknown): Promise<void> {
	socket.emitMessage(message);
	await flushAsync();
}

describe("WebSocket compatibility window (Story 6, Red)", () => {
	it("TC-6.4a: compatibility window keeps legacy clients working while upsert-v1 clients receive upsert-family streaming", async () => {
		const deps = createDeps();
		const legacySocket = new MockSocket();
		const upsertSocket = new MockSocket();

		handleWebSocket(legacySocket as never, deps);
		handleWebSocket(upsertSocket as never, deps);

		await send(upsertSocket, {
			type: "session:hello",
			streamProtocol: "upsert-v1",
		});
		await send(upsertSocket, {
			type: "session:send",
			sessionId: "claude-code:upsert-session",
			content: "hello",
		});
		await send(legacySocket, {
			type: "session:send",
			sessionId: "claude-code:legacy-session",
			content: "hello",
		});

		const legacyMessages = legacySocket.getMessages();
		const upsertMessages = upsertSocket.getMessages();

		expect(
			legacyMessages.some((message) => message.type === "session:update"),
		).toBe(true);
		expect(
			upsertMessages.some((message) => message.type === "session:upsert"),
		).toBe(true);
	});

	it("TC-6.4c: a negotiated upsert-v1 connection receives exactly one family with no legacy duplicates", async () => {
		const socket = new MockSocket();
		handleWebSocket(socket as never, createDeps());

		await send(socket, {
			type: "session:hello",
			streamProtocol: "upsert-v1",
		});
		await send(socket, {
			type: "session:send",
			sessionId: "codex:single-family-session",
			content: "hello",
		});

		const messages = socket.getMessages();
		const hasLegacy = messages.some((message) =>
			new Set(["session:update", "session:chunk", "session:complete"]).has(
				message.type,
			),
		);
		const hasUpsertFamily = messages.some((message) =>
			new Set(["session:upsert", "session:turn", "session:history"]).has(
				message.type,
			),
		);

		expect(hasUpsertFamily).toBe(true);
		expect(hasLegacy).toBe(false);
	});

	it("TC-7.4a: active streaming flow does not use direct ACP-to-WebSocket bridge helpers", () => {
		const websocketSource = readFileSync(
			new URL("../../../server/websocket.ts", import.meta.url),
			"utf8",
		);

		expect(websocketSource.includes("createPromptBridgeMessages")).toBe(false);
	});
});
