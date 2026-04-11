import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { AcpUpdateEvent } from "../../../server/acp/acp-types";
import { AcpClient } from "../../../server/acp/acp-client";
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
					id: "claude-code:session-a",
					projectId: "p1",
					cliType: "claude-code",
					archived: false,
					source: "builder",
					providerSessionId: "session-a",
					title: "New Session",
					lastActiveAt: "2026-02-17T00:00:00.000Z",
					createdAt: "2026-02-17T00:00:00.000Z",
				}),
			updateSyncBlocking: (_id, updater) =>
				updater({
					id: "claude-code:session-a",
					projectId: "p1",
					cliType: "claude-code",
					archived: false,
					source: "builder",
					providerSessionId: "session-a",
					title: "New Session",
					lastActiveAt: "2026-02-17T00:00:00.000Z",
					createdAt: "2026-02-17T00:00:00.000Z",
				}),
			archive: () => ({
				id: "claude-code:session-a",
				projectId: "p1",
				cliType: "claude-code",
				archived: true,
				source: "builder",
				providerSessionId: "session-a",
				title: "New Session",
				lastActiveAt: "2026-02-17T00:00:00.000Z",
				createdAt: "2026-02-17T00:00:00.000Z",
			}),
		} as MockSessionServices["registry"],
		messages: {
			sendMessage: async (sessionId, content, callbacks) => {
				callbacks.onTurn({
					type: "turn_started",
					turnId: `turn-${sessionId}`,
					sessionId,
					modelId: "claude-3-7-sonnet",
					providerId: "claude-code",
				});
				if (content.includes("tool")) {
					callbacks.onUpsert({
						type: "tool_call",
						status: "create",
						turnId: `turn-${sessionId}`,
						sessionId,
						itemId: `call-${sessionId}`,
						sourceTimestamp: "2026-02-17T00:00:00.000Z",
						emittedAt: "2026-02-17T00:00:00.000Z",
						toolName: "read_file",
						toolArguments: {},
						callId: `call-${sessionId}`,
						toolArgumentsText: "",
					});
					callbacks.onUpsert({
						type: "tool_call",
						status: "complete",
						turnId: `turn-${sessionId}`,
						sessionId,
						itemId: `call-${sessionId}`,
						sourceTimestamp: "2026-02-17T00:00:01.000Z",
						emittedAt: "2026-02-17T00:00:01.000Z",
						toolName: "read_file",
						toolArguments: {},
						callId: `call-${sessionId}`,
						toolArgumentsText: "",
						toolOutput: "ok",
					});
				} else {
					callbacks.onUpsert({
						type: "message",
						status: "complete",
						turnId: `turn-${sessionId}`,
						sessionId,
						itemId: `assistant-${sessionId}`,
						sourceTimestamp: "2026-02-17T00:00:00.000Z",
						emittedAt: "2026-02-17T00:00:00.000Z",
						content: `stream-${sessionId}`,
						origin: "agent",
					});
				}
				callbacks.onTurn({
					type: "turn_complete",
					turnId: `turn-${sessionId}`,
					sessionId,
					status: "completed",
				});
				return { stopReason: "end_turn" };
			},
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
	const sessionPrompt = async (
		sessionId: string,
		content: string,
		onEvent: (event: AcpUpdateEvent) => void,
	) => {
		if (content.includes("tool")) {
			onEvent({
				type: "tool_call",
				toolCallId: `call-${sessionId}`,
				title: "read_file",
				status: "in_progress",
				content: [],
			});
			onEvent({
				type: "tool_call_update",
				toolCallId: `call-${sessionId}`,
				status: "completed",
				content: [{ type: "text", text: "ok" }],
			});
		} else {
			onEvent({
				type: "agent_message_chunk",
				content: [{ type: "text", text: `stream-${sessionId}` }],
			});
		}
		return { stopReason: "end_turn" as const };
	};
	const compatibilityClient = Object.create(AcpClient.prototype) as AcpClient;
	Object.assign(compatibilityClient, {
		sessionNew: async () => ({ sessionId: "compat-created-session" }),
		sessionLoad: async () => [],
		sessionPrompt,
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
