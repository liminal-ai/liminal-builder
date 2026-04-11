import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { WebSocketDeps } from "../../../server/websocket";
import { handleWebSocket } from "../../../server/websocket";
import type { ServerMessage } from "../../../shared/types";

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
					id: "claude-code:test-session",
					projectId: "p1",
					cliType: "claude-code",
					archived: false,
					source: "builder",
					providerSessionId: "test-session",
					title: "New Session",
					lastActiveAt: "2026-02-17T00:00:00.000Z",
					createdAt: "2026-02-17T00:00:00.000Z",
				}),
			updateSyncBlocking: (_id, updater) =>
				updater({
					id: "claude-code:test-session",
					projectId: "p1",
					cliType: "claude-code",
					archived: false,
					source: "builder",
					providerSessionId: "test-session",
					title: "New Session",
					lastActiveAt: "2026-02-17T00:00:00.000Z",
					createdAt: "2026-02-17T00:00:00.000Z",
				}),
			archive: () => ({
				id: "claude-code:test-session",
				projectId: "p1",
				cliType: "claude-code",
				archived: true,
				source: "builder",
				providerSessionId: "test-session",
				title: "New Session",
				lastActiveAt: "2026-02-17T00:00:00.000Z",
				createdAt: "2026-02-17T00:00:00.000Z",
			}),
		} as MockSessionServices["registry"],
		messages: {
			sendMessage: async (_sessionId, _content, callbacks) => {
				callbacks.onTurn({
					type: "turn_started",
					turnId: "turn-1",
					sessionId: "claude-code:test-session",
					modelId: "claude-3-7-sonnet",
					providerId: "claude-code",
				});
				callbacks.onUpsert({
					type: "message",
					status: "complete",
					turnId: "turn-1",
					sessionId: "claude-code:test-session",
					itemId: "assistant-1",
					sourceTimestamp: "2026-02-17T00:00:00.000Z",
					emittedAt: "2026-02-17T00:00:00.000Z",
					content: "hello from provider",
					origin: "agent",
				});
				callbacks.onTurn({
					type: "turn_complete",
					turnId: "turn-1",
					sessionId: "claude-code:test-session",
					status: "completed",
				});
				return { stopReason: "end_turn" };
			},
			cancelTurn: async () => {},
		} as MockSessionServices["messages"],
		runtime: {
			supports: () => false,
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
		sessionServices: createSessionServices(),
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
