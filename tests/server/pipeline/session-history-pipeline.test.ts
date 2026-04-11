import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { AcpClient } from "../../../server/acp/acp-client";
import type { ChatEntry, ServerMessage } from "../../../shared/types";
import type { WebSocketDeps } from "../../../server/websocket";
import { handleWebSocket } from "../../../server/websocket";

type MessageListener = (payload: Buffer | string) => void;
type MockSessionServices = WebSocketDeps["sessionServices"];

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

function createSessionServices(): MockSessionServices {
	return {
		create: {
			createSession: async () => ({
				id: "claude-code:created-session",
				projectId: "p1",
				cliType: "claude-code",
				archived: false,
				source: "builder",
				providerSessionId: "created-session",
				title: "New Session",
				lastActiveAt: "2026-02-17T00:00:00.000Z",
				createdAt: "2026-02-17T00:00:00.000Z",
			}),
		} as MockSessionServices["create"],
		listing: {
			listSessions: async () => [],
		} as MockSessionServices["listing"],
		open: {
			openSession: async () => ({
				sessionId: "claude-code:created-session",
				projectId: "p1",
				cliType: "claude-code",
				source: "builder",
				availability: "available",
				providerSessionId: "created-session",
				history: [],
			}),
		} as MockSessionServices["open"],
		registry: {
			listAll: () => [],
			listByProject: () => [],
			get: () => undefined,
			create: async (meta) => meta,
			adopt: async (meta) => meta,
			update: async (_id, updater) =>
				updater({
					id: "claude-code:history-a",
					projectId: "p1",
					cliType: "claude-code",
					archived: false,
					source: "builder",
					providerSessionId: "history-a",
					title: "New Session",
					lastActiveAt: "2026-02-17T00:00:00.000Z",
					createdAt: "2026-02-17T00:00:00.000Z",
				}),
			updateSyncBlocking: (_id, updater) =>
				updater({
					id: "claude-code:history-a",
					projectId: "p1",
					cliType: "claude-code",
					archived: false,
					source: "builder",
					providerSessionId: "history-a",
					title: "New Session",
					lastActiveAt: "2026-02-17T00:00:00.000Z",
					createdAt: "2026-02-17T00:00:00.000Z",
				}),
			archive: () => ({
				id: "claude-code:history-a",
				projectId: "p1",
				cliType: "claude-code",
				archived: true,
				source: "builder",
				providerSessionId: "history-a",
				title: "New Session",
				lastActiveAt: "2026-02-17T00:00:00.000Z",
				createdAt: "2026-02-17T00:00:00.000Z",
			}),
		} as MockSessionServices["registry"],
		messages: {
			sendMessage: async () => ({ stopReason: "end_turn" }),
			cancelTurn: async () => {},
		} as MockSessionServices["messages"],
		runtime: {
			supports: (cliType) => cliType === "claude-code",
			createSession: async () => ({
				sessionId: "created-session",
				cliType: "claude-code",
			}),
			loadSession: async () => {},
			sendMessage: async () => ({ stopReason: "end_turn" }),
			cancelTurn: async () => {},
		} as MockSessionServices["runtime"],
		title: {
			reloadOverrides: () => {},
			applyTitle: (_sessionId, fallbackTitle) => fallbackTitle,
			deriveTitle: (content) => content,
			maybeApplyInitialPromptTitle: () => undefined,
			setManualTitle: () => {},
		} as MockSessionServices["title"],
	};
}

function createDeps(): WebSocketDeps {
	const emitter = new EventEmitter();
	const compatibilityClient = Object.create(AcpClient.prototype) as AcpClient;
	Object.assign(compatibilityClient, {
		sessionNew: async () => ({ sessionId: "compat-created-session" }),
		sessionLoad: async (sessionId: string) => createLegacyHistory(sessionId),
		sessionPrompt: async () => ({ stopReason: "end_turn" as const }),
		sessionCancel: () => undefined,
	});

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
			ensureAgent: async () => compatibilityClient,
		},
		sessionServices: createSessionServices(),
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
