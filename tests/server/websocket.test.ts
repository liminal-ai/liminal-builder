import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentManager } from "../../server/acp/agent-manager";
import type {
	AcpPromptResult,
	AcpUpdateEvent,
} from "../../server/acp/acp-types";
import { AcpClient } from "../../server/acp/acp-client";
import { ProjectStore } from "../../server/projects/project-store";
import type { Project } from "../../server/projects/project-types";
import { SessionManager } from "../../server/sessions/session-manager";
import type { SessionMeta } from "../../server/sessions/session-types";
import type { CliType } from "../../server/sessions/session-types";
import { JsonStore } from "../../server/store/json-store";
import type { UpsertObject } from "../../server/streaming/upsert-types";
import type { ChatEntry } from "../../shared/types";
import type { ServerMessage } from "../../shared/types";
import { handleWebSocket, type WebSocketDeps } from "../../server/websocket";
import {
	MOCK_CREATE_RESULT,
	MOCK_INIT_RESULT,
	MOCK_PROMPT_RESULT,
	makeRpcError,
	makeRpcResponse,
} from "../fixtures/acp-messages";

type MessageListener = (payload: Buffer | string) => void;
type CloseListener = () => void;
type ErrorListener = (error: Error) => void;

type MockHarness = {
	socket: MockSocket;
	emitter: EventEmitter;
	ensureAgent: ReturnType<
		typeof vi.fn<(cliType: CliType) => Promise<AcpClient>>
	>;
	sessionNew: ReturnType<
		typeof vi.fn<(params: { cwd: string }) => Promise<{ sessionId: string }>>
	>;
	sessionLoad: ReturnType<
		typeof vi.fn<
			(
				sessionId: string,
				cwd: string,
				onReplayEntry?: (entry: ChatEntry) => void,
			) => Promise<ChatEntry[]>
		>
	>;
	sessionPrompt: ReturnType<
		typeof vi.fn<
			(
				sessionId: string,
				content: string,
				onEvent: (event: AcpUpdateEvent) => void,
			) => Promise<AcpPromptResult>
		>
	>;
	sessionCancel: ReturnType<typeof vi.fn<(sessionId: string) => void>>;
	listProjects: ReturnType<typeof vi.fn<() => Promise<Project[]>>>;
};

class MockSocket {
	private messageListeners: MessageListener[] = [];
	private closeListeners: CloseListener[] = [];
	private errorListeners: ErrorListener[] = [];
	private sentPayloads: string[] = [];

	send(payload: string): void {
		this.sentPayloads.push(payload);
	}

	on(
		event: "message" | "close" | "error",
		listener: MessageListener | CloseListener | ErrorListener,
	): void {
		if (event === "message") {
			this.messageListeners.push(listener as MessageListener);
			return;
		}
		if (event === "close") {
			this.closeListeners.push(listener as CloseListener);
			return;
		}
		if (event === "error") {
			this.errorListeners.push(listener as ErrorListener);
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

function messagesOfType<TType extends ServerMessage["type"]>(
	messages: ServerMessage[],
	type: TType,
): Extract<ServerMessage, { type: TType }>[] {
	return messages.filter(
		(message): message is Extract<ServerMessage, { type: TType }> =>
			message.type === type,
	);
}

async function flushAsync(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function parseWsMessage(data: unknown): Record<string, unknown> {
	const text = typeof data === "string" ? data : String(data);
	const parsed = JSON.parse(text) as unknown;
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Expected object websocket payload");
	}
	return parsed as Record<string, unknown>;
}

function createTestWSClient(port: number): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
		ws.onopen = () => resolve(ws);
		ws.onerror = () => {
			reject(new Error("WebSocket connection failed"));
		};
	});
}

function sendAndReceive(
	ws: WebSocket,
	message: Record<string, unknown>,
	expectedType: string,
	timeoutMs = 5000,
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			reject(new Error(`Timeout waiting for ${expectedType}`));
		}, timeoutMs);
		const handler = (event: MessageEvent) => {
			const data = parseWsMessage(event.data);
			if (data.type === expectedType) {
				clearTimeout(timer);
				ws.removeEventListener("message", handler);
				resolve(data);
				return;
			}
			if (expectedType === "error" && data.type === "session:created") {
				clearTimeout(timer);
				ws.removeEventListener("message", handler);
				reject(new Error("Received session:created while waiting for error"));
				return;
			}
			if (data.type === "error" && expectedType !== "error") {
				clearTimeout(timer);
				ws.removeEventListener("message", handler);
				const messageText =
					typeof data.message === "string"
						? data.message
						: "Unexpected error response";
				reject(new Error(messageText));
			}
		};
		ws.addEventListener("message", handler);
		ws.send(JSON.stringify(message));
	});
}

function sendAndCollect(
	ws: WebSocket,
	message: Record<string, unknown>,
	untilType: string,
	timeoutMs = 10000,
): Promise<Record<string, unknown>[]> {
	return new Promise((resolve, reject) => {
		const collected: Record<string, unknown>[] = [];
		const timer = setTimeout(() => {
			ws.removeEventListener("message", handler);
			reject(new Error(`Timeout waiting for ${untilType}`));
		}, timeoutMs);
		const handler = (event: MessageEvent) => {
			const data = parseWsMessage(event.data);
			collected.push(data);
			if (data.type === untilType) {
				clearTimeout(timer);
				ws.removeEventListener("message", handler);
				resolve(collected);
			}
		};
		ws.addEventListener("message", handler);
		ws.send(JSON.stringify(message));
	});
}

function makeProjectDir(rootDir: string, name: string): string {
	const dir = join(rootDir, name);
	mkdirSync(dir, { recursive: true });
	return dir;
}

type MockAcpProcess = {
	stdin: PassThrough;
	stdout: PassThrough;
	stderr: PassThrough;
	exited: Promise<number>;
	kill: (signal?: number | NodeJS.Signals) => void;
};

function createMockAcpProcess(
	opts: { failCreate?: boolean } = {},
): MockAcpProcess {
	const stdin = new PassThrough();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	let resolveExited: (code: number) => void = () => {};
	const exited = new Promise<number>((resolve) => {
		resolveExited = resolve;
	});

	stdin.on("data", (chunk: Buffer | string) => {
		const lines = chunk
			.toString()
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		for (const line of lines) {
			const req = JSON.parse(line) as {
				id?: number;
				method?: string;
				params?: { sessionId?: string };
			};

			if (req.method === "initialize" && typeof req.id === "number") {
				stdout.write(JSON.stringify(makeRpcResponse(req.id, MOCK_INIT_RESULT)));
				stdout.write("\n");
				continue;
			}

			if (req.method === "session/new" && typeof req.id === "number") {
				if (opts.failCreate) {
					stdout.write(
						JSON.stringify(
							makeRpcError(req.id, -32001, "Mock session/create failure"),
						),
					);
					stdout.write("\n");
				} else {
					stdout.write(
						JSON.stringify(makeRpcResponse(req.id, MOCK_CREATE_RESULT)),
					);
					stdout.write("\n");
				}
				continue;
			}

			if (req.method === "session/prompt" && typeof req.id === "number") {
				stdout.write(
					JSON.stringify({
						jsonrpc: "2.0",
						method: "session/update",
						params: {
							sessionId: req.params?.sessionId ?? "acp-session-xyz",
							update: {
								type: "agent_message_chunk",
								content: [
									{ type: "text", text: "Mock streamed response chunk" },
								],
							},
						},
					}),
				);
				stdout.write("\n");
				stdout.write(
					JSON.stringify(makeRpcResponse(req.id, MOCK_PROMPT_RESULT)),
				);
				stdout.write("\n");
				continue;
			}

			if (req.method === "session/load" && typeof req.id === "number") {
				stdout.write(JSON.stringify(makeRpcResponse(req.id, { loaded: true })));
				stdout.write("\n");
			}
		}
	});

	return {
		stdin,
		stdout,
		stderr,
		exited,
		kill: () => {
			resolveExited(0);
		},
	};
}

function createHarness(): MockHarness {
	const socket = new MockSocket();
	const emitter = new EventEmitter();

	const sessionNew = vi.fn<
		(params: { cwd: string }) => Promise<{ sessionId: string }>
	>(() => Promise.resolve({ sessionId: "acp-session-1" }));
	const sessionLoad = vi.fn<
		(
			sessionId: string,
			cwd: string,
			onReplayEntry?: (entry: ChatEntry) => void,
		) => Promise<ChatEntry[]>
	>(() => Promise.resolve([]));
	const sessionPrompt = vi.fn<
		(
			sessionId: string,
			content: string,
			onEvent: (event: AcpUpdateEvent) => void,
		) => Promise<AcpPromptResult>
	>(() => Promise.resolve({ stopReason: "end_turn" }));
	const sessionCancel = vi.fn<(sessionId: string) => void>(() => {});

	const acpClient = Object.create(AcpClient.prototype) as AcpClient;
	acpClient.sessionNew = sessionNew;
	acpClient.sessionLoad = sessionLoad;
	acpClient.sessionPrompt = sessionPrompt;
	acpClient.sessionCancel = sessionCancel;

	const ensureAgent = vi.fn<(cliType: CliType) => Promise<AcpClient>>(() =>
		Promise.resolve(acpClient),
	);

	const listProjects = vi.fn<() => Promise<Project[]>>(() =>
		Promise.resolve([
			{
				id: "project-1",
				path: "/tmp/project-1",
				name: "project-1",
				addedAt: "2026-01-01T00:00:00.000Z",
			},
		]),
	);

	const projectStore: WebSocketDeps["projectStore"] = {
		addProject: vi.fn(),
		removeProject: vi.fn(),
		listProjects,
	};

	const agentManager: WebSocketDeps["agentManager"] = {
		emitter,
		ensureAgent,
	};

	handleWebSocket(socket, {
		projectStore,
		agentManager,
	});

	return {
		socket,
		emitter,
		ensureAgent,
		sessionNew,
		sessionLoad,
		sessionPrompt,
		sessionCancel,
		listProjects,
	};
}

describe("handleWebSocket", () => {
	let harness: MockHarness;

	beforeEach(() => {
		harness = createHarness();
	});

	it("bridges session:send streaming updates and completion", async () => {
		harness.sessionPrompt.mockImplementation(
			async (_sessionId, _content, onEvent) => {
				onEvent({
					type: "agent_message_chunk",
					content: [{ type: "text", text: "Hello" }],
				});
				onEvent({
					type: "agent_message_chunk",
					content: [{ type: "text", text: " world" }],
				});
				return { stopReason: "end_turn" };
			},
		);

		harness.socket.emitMessage({
			type: "session:send",
			sessionId: "claude-code:session-7",
			content: "hi",
			requestId: "req-1",
		});
		await flushAsync();

		expect(harness.ensureAgent).toHaveBeenCalledWith("claude-code");
		expect(harness.sessionPrompt).toHaveBeenCalledWith(
			"session-7",
			"hi",
			expect.any(Function),
		);

		const messages = harness.socket.getMessages();
		const upserts = messagesOfType(messages, "session:upsert");
		const turns = messagesOfType(messages, "session:turn");
		const messageUpserts = upserts
			.map((upsert) => upsert.payload)
			.filter(
				(payload): payload is Extract<UpsertObject, { type: "message" }> =>
					payload.type === "message",
			);

		expect(messageUpserts).toHaveLength(3);
		expect(messageUpserts.map((payload) => payload.status)).toEqual([
			"create",
			"update",
			"complete",
		]);
		expect(messageUpserts[2]?.content).toBe("Hello world");
		expect(new Set(messageUpserts.map((payload) => payload.itemId)).size).toBe(
			1,
		);
		expect(turns).toHaveLength(2);
		expect(turns[0]?.payload).toMatchObject({
			type: "turn_started",
			sessionId: "claude-code:session-7",
		});
		expect(turns[1]?.payload).toMatchObject({
			type: "turn_complete",
			sessionId: "claude-code:session-7",
			status: "completed",
		});
	});

	it("ignores unknown streaming update shapes without crashing session:send", async () => {
		harness.sessionPrompt.mockImplementation(
			async (_sessionId, _content, onEvent) => {
				onEvent({
					type: "available_commands_update",
					availableCommands: [],
				});
				return { stopReason: "end_turn" };
			},
		);

		harness.socket.emitMessage({
			type: "session:send",
			sessionId: "claude-code:session-unknown-update",
			content: "hi",
			requestId: "req-unknown",
		});
		await flushAsync();

		const messages = harness.socket.getMessages();
		expect(messagesOfType(messages, "error")).toHaveLength(0);
		expect(messagesOfType(messages, "session:upsert")).toHaveLength(0);
		expect(messagesOfType(messages, "session:turn")).toHaveLength(2);
	});

	it("emits turn_complete(cancelled) when prompt stopReason is cancelled", async () => {
		harness.sessionPrompt.mockImplementation(
			async (_sessionId, _content, onEvent) => {
				onEvent({
					type: "agent_message_chunk",
					content: [{ type: "text", text: "partial" }],
				});
				return { stopReason: "cancelled" };
			},
		);

		harness.socket.emitMessage({
			type: "session:send",
			sessionId: "claude-code:cancel-me",
			content: "cancel this",
		});
		await flushAsync();

		const messages = harness.socket.getMessages();
		const turns = messagesOfType(messages, "session:turn");
		expect(turns).toHaveLength(2);
		expect(turns[1]?.payload).toMatchObject({
			type: "turn_complete",
			status: "cancelled",
		});
	});

	it("preserves tool-call title across tool_call updates", async () => {
		harness.sessionPrompt.mockImplementation(
			async (_sessionId, _content, onEvent) => {
				onEvent({
					type: "tool_call",
					toolCallId: "tool-1",
					title: "Run tests",
					status: "in_progress",
				});
				onEvent({
					type: "tool_call_update",
					toolCallId: "tool-1",
					status: "completed",
					content: [{ type: "text", text: "done" }],
				});
				return { stopReason: "end_turn" };
			},
		);

		harness.socket.emitMessage({
			type: "session:send",
			sessionId: "claude-code:tool-title",
			content: "trigger tool",
		});
		await flushAsync();

		const upserts = messagesOfType(
			harness.socket.getMessages(),
			"session:upsert",
		)
			.map((update) => update.payload)
			.filter(
				(payload): payload is Extract<UpsertObject, { type: "tool_call" }> =>
					payload.type === "tool_call",
			);
		expect(upserts).toHaveLength(2);
		expect(upserts[0]?.toolName).toBe("Run tests");
		expect(upserts[1]?.toolName).toBe("Run tests");
		expect(upserts[1]?.itemId).toBe(upserts[0]?.itemId);
		expect(upserts[1]?.status).toBe("complete");
	});

	it("uses requested cliType + project cwd for session:create and returns canonical sessionId", async () => {
		harness.sessionNew.mockResolvedValue({ sessionId: "raw-acp-id" });

		harness.socket.emitMessage({
			type: "session:create",
			projectId: "project-1",
			cliType: "claude-code",
			requestId: "create-1",
		});
		await flushAsync();

		expect(harness.ensureAgent).toHaveBeenCalledWith("claude-code");
		expect(harness.sessionNew).toHaveBeenCalledWith({ cwd: "/tmp/project-1" });

		const created = messagesOfType(
			harness.socket.getMessages(),
			"session:created",
		);
		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({
			type: "session:created",
			projectId: "project-1",
			sessionId: "claude-code:raw-acp-id",
			requestId: "create-1",
		});
	});

	it("returns request-correlated error when session:create cliType is unsupported", async () => {
		harness.ensureAgent.mockRejectedValue(
			new Error("CLI type not yet supported in Story 2b: codex"),
		);

		harness.socket.emitMessage({
			type: "session:create",
			projectId: "project-1",
			cliType: "codex",
			requestId: "create-unsupported",
		});
		await flushAsync();

		const errors = messagesOfType(harness.socket.getMessages(), "error");
		expect(errors).toHaveLength(1);
		expect(errors[0].requestId).toBe("create-unsupported");
		expect(errors[0].message).toContain("not yet supported");
	});

	it("uses session:create project cwd when opening that canonical session", async () => {
		harness.sessionNew.mockResolvedValue({ sessionId: "raw-acp-id" });

		harness.socket.emitMessage({
			type: "session:create",
			projectId: "project-1",
			cliType: "claude-code",
			requestId: "create-2",
		});
		await flushAsync();

		const created = messagesOfType(
			harness.socket.getMessages(),
			"session:created",
		);
		expect(created).toHaveLength(1);
		expect(created[0].sessionId).toBe("claude-code:raw-acp-id");

		harness.socket.emitMessage({
			type: "session:open",
			sessionId: created[0].sessionId,
			requestId: "open-2",
		});
		await flushAsync();

		expect(harness.sessionLoad).toHaveBeenCalledWith(
			"raw-acp-id",
			"/tmp/project-1",
		);
	});

	it("session:open sends a single session:history response without replay updates", async () => {
		harness.sessionLoad.mockResolvedValue([
			{
				entryId: "entry-1",
				type: "assistant",
				content: "Loaded once",
				timestamp: "2026-02-15T00:00:00.000Z",
			},
		]);

		harness.socket.emitMessage({
			type: "session:open",
			sessionId: "claude-code:history-once",
			requestId: "open-once-1",
		});
		await flushAsync();

		const messages = harness.socket.getMessages();
		expect(messagesOfType(messages, "session:upsert")).toHaveLength(0);

		const histories = messagesOfType(messages, "session:history");
		expect(histories).toHaveLength(1);
		expect(histories[0]).toMatchObject({
			type: "session:history",
			sessionId: "claude-code:history-once",
		});
		expect(histories[0].entries).toEqual([
			expect.objectContaining({
				type: "message",
				status: "complete",
				itemId: "entry-1",
				content: "Loaded once",
				origin: "agent",
				sourceTimestamp: "2026-02-15T00:00:00.000Z",
			}),
		]);
	});

	it("parses canonical session IDs for session:open and session:cancel", async () => {
		harness.socket.emitMessage({
			type: "session:open",
			sessionId: "claude-code:open-123",
			requestId: "open-1",
		});
		await flushAsync();

		expect(harness.ensureAgent).toHaveBeenCalledWith("claude-code");
		expect(harness.sessionLoad).toHaveBeenCalledWith("open-123", ".");
		const histories = messagesOfType(
			harness.socket.getMessages(),
			"session:history",
		);
		expect(histories).toHaveLength(1);
		expect(histories[0]).toMatchObject({
			type: "session:history",
			sessionId: "claude-code:open-123",
		});

		harness.socket.emitMessage({
			type: "session:cancel",
			sessionId: "claude-code:cancel-123",
		});
		await flushAsync();

		expect(harness.sessionCancel).toHaveBeenCalledWith("cancel-123");
	});

	it("emits session:error when session:open fails", async () => {
		harness.sessionLoad.mockRejectedValue(new Error("Session not found"));

		harness.socket.emitMessage({
			type: "session:open",
			sessionId: "claude-code:missing-session",
			requestId: "open-error-1",
		});
		await flushAsync();

		const messages = harness.socket.getMessages();
		const sessionErrors = messagesOfType(messages, "session:error");
		const errors = messagesOfType(messages, "error");

		expect(sessionErrors).toHaveLength(1);
		expect(sessionErrors[0]).toMatchObject({
			type: "session:error",
			sessionId: "claude-code:missing-session",
			message: "Session not found",
		});
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({
			type: "error",
			requestId: "open-error-1",
			message: "Session not found",
		});
	});

	it("forwards non-idle agent status events over websocket", async () => {
		harness.emitter.emit("agent:status", {
			cliType: "claude-code",
			status: "connected",
		});
		await flushAsync();

		const statuses = messagesOfType(
			harness.socket.getMessages(),
			"agent:status",
		);
		expect(statuses).toHaveLength(1);
		expect(statuses[0]).toEqual({
			type: "agent:status",
			cliType: "claude-code",
			status: "connected",
		});
	});

	it("does not forward idle agent status events", async () => {
		harness.emitter.emit("agent:status", {
			cliType: "claude-code",
			status: "idle",
		});
		await flushAsync();

		const statuses = messagesOfType(
			harness.socket.getMessages(),
			"agent:status",
		);
		expect(statuses).toHaveLength(0);
	});

	it("forwards agent manager errors over websocket", async () => {
		harness.emitter.emit("error", {
			cliType: "claude-code",
			message: "agent crashed",
		});
		await flushAsync();

		const errors = messagesOfType(harness.socket.getMessages(), "error");
		expect(errors).toHaveLength(1);
		expect(errors[0]).toEqual({
			type: "error",
			message: "agent crashed",
		});
	});
});

describe("WebSocket Integration: Round-Trip Message Flow", () => {
	let server: FastifyInstance;
	let port: number;
	let ws: WebSocket;
	let tempRoot: string;
	let dataRoot: string;
	let shouldFailCreate = false;

	beforeEach(async () => {
		dataRoot = mkdtempSync(join(tmpdir(), "liminal-story6-data-"));
		const projectsStore = new JsonStore<Project[]>(
			{
				filePath: join(dataRoot, "projects.json"),
				writeDebounceMs: 0,
			},
			[],
		);
		const sessionsStore = new JsonStore<SessionMeta[]>(
			{
				filePath: join(dataRoot, "sessions.json"),
				writeDebounceMs: 0,
			},
			[],
		);
		const projectStore = new ProjectStore(projectsStore);
		const emitter = new EventEmitter();
		const agentManager = new AgentManager(emitter, {
			spawn: () => createMockAcpProcess({ failCreate: shouldFailCreate }),
		});
		const sessionManager = new SessionManager(
			sessionsStore,
			agentManager,
			projectStore,
		);

		server = Fastify();
		await server.register(fastifyWebsocket);
		server.get("/ws", { websocket: true }, (socket) => {
			handleWebSocket(socket, { projectStore, sessionManager, agentManager });
		});
		await server.listen({ port: 0, host: "127.0.0.1" });
		const address = server.server.address();
		if (!address || typeof address === "string") {
			throw new Error("Failed to resolve test server port");
		}
		port = address.port;
		tempRoot = mkdtempSync(join(tmpdir(), "liminal-ws-"));
		ws = await createTestWSClient(port);
	});

	afterEach(async () => {
		shouldFailCreate = false;
		if (
			ws &&
			(ws.readyState === WebSocket.OPEN ||
				ws.readyState === WebSocket.CONNECTING)
		) {
			ws.close();
		}
		await server.close();
		rmSync(tempRoot, { recursive: true, force: true });
		rmSync(dataRoot, { recursive: true, force: true });
	});

	it("project:add round-trip - sends project:add, receives project:added", async () => {
		const projectPath = makeProjectDir(tempRoot, "project-add");
		const messages = await sendAndCollect(
			ws,
			{ type: "project:add", path: projectPath, requestId: "req-1" },
			"project:added",
		);
		const response = messages[messages.length - 1];
		expect(response.type).toBe("project:added");
		expect(response.project).toBeDefined();
		expect((response.project as { path: string }).path).toBe(projectPath);
		expect((response.project as { name: string }).name).toBe("project-add");
		expect(typeof (response.project as { id: string }).id).toBe("string");
	});

	it("session:create round-trip - sends session:create, receives session:created", async () => {
		const projectPath = makeProjectDir(tempRoot, "project-create");
		const addResp = await sendAndReceive(
			ws,
			{ type: "project:add", path: projectPath, requestId: "req-2" },
			"project:added",
		);
		const projectId = (addResp.project as { id: string }).id;

		const response = await sendAndReceive(
			ws,
			{
				type: "session:create",
				projectId,
				cliType: "codex",
				requestId: "req-3",
			},
			"session:created",
		);
		expect(response.type).toBe("session:created");
		expect(typeof response.sessionId).toBe("string");
		expect((response.sessionId as string).startsWith("codex:")).toBe(true);
	});

	it("session:reconnect round-trip - sends reconnect, receives agent status", async () => {
		const projectPath = makeProjectDir(tempRoot, "project-stream");
		const addResp = await sendAndReceive(
			ws,
			{ type: "project:add", path: projectPath, requestId: "req-4" },
			"project:added",
		);
		const projectId = (addResp.project as { id: string }).id;
		await sendAndReceive(
			ws,
			{
				type: "session:create",
				projectId,
				cliType: "claude-code",
				requestId: "req-5",
			},
			"session:created",
		);
		const response = await sendAndReceive(
			ws,
			{
				type: "session:reconnect",
				cliType: "claude-code",
				requestId: "req-5r",
			},
			"agent:status",
		);
		expect(response.type).toBe("agent:status");
		expect(response.cliType).toBe("claude-code");
	});

	it("TC-3.7b: cancel round-trip - sends cancel during streaming, receives turn_complete(cancelled)", async () => {
		const projectPath = makeProjectDir(tempRoot, "project-cancel");
		const addResp = await sendAndReceive(
			ws,
			{ type: "project:add", path: projectPath, requestId: "req-6" },
			"project:added",
		);
		const projectId = (addResp.project as { id: string }).id;
		const createResp = await sendAndReceive(
			ws,
			{
				type: "session:create",
				projectId,
				cliType: "claude-code",
				requestId: "req-7",
			},
			"session:created",
		);
		const sessionId = createResp.sessionId as string;

		const response = await new Promise<Record<string, unknown>>(
			(resolve, reject) => {
				const timer = setTimeout(() => {
					ws.removeEventListener("message", handler);
					reject(new Error("Timeout waiting for cancellation outcome"));
				}, 5000);

				const handler = (event: MessageEvent) => {
					const data = parseWsMessage(event.data);
					if (
						data.type === "session:turn" &&
						typeof data.payload === "object" &&
						data.payload !== null &&
						(data.payload as { type?: unknown }).type === "turn_complete" &&
						(data.payload as { status?: unknown }).status === "cancelled"
					) {
						clearTimeout(timer);
						ws.removeEventListener("message", handler);
						resolve(data);
						return;
					}
					if (
						data.type === "session:turn" &&
						typeof data.payload === "object" &&
						data.payload !== null &&
						(data.payload as { type?: unknown }).type === "turn_complete" &&
						(data.payload as { status?: unknown }).status === "completed"
					) {
						clearTimeout(timer);
						ws.removeEventListener("message", handler);
						reject(
							new Error(
								"Received completed turn before cancellation confirmation",
							),
						);
					}
				};

				ws.addEventListener("message", handler);
				ws.send(
					JSON.stringify({ type: "session:send", sessionId, content: "Hello" }),
				);
				setTimeout(() => {
					ws.send(JSON.stringify({ type: "session:cancel", sessionId }));
				}, 50);
			},
		);

		expect(response.type).toBe("session:turn");
		expect(
			(response.payload as { type?: unknown; status?: unknown }).type,
		).toBe("turn_complete");
		expect(
			(response.payload as { type?: unknown; status?: unknown }).status,
		).toBe("cancelled");
	});

	it("project:remove WebSocket round-trip - sends project:remove, receives project:removed", async () => {
		const projectPath = makeProjectDir(tempRoot, "project-remove");
		const addResp = await sendAndReceive(
			ws,
			{ type: "project:add", path: projectPath, requestId: "req-8" },
			"project:added",
		);
		const projectId = (addResp.project as { id: string }).id;
		await sendAndReceive(
			ws,
			{
				type: "session:create",
				projectId,
				cliType: "claude-code",
				requestId: "req-8-create",
			},
			"session:created",
		);

		const messages = await sendAndCollect(
			ws,
			{ type: "project:remove", projectId, requestId: "req-9" },
			"project:removed",
		);
		const response = messages[messages.length - 1];
		expect(response.type).toBe("project:removed");
		expect(response.projectId).toBe(projectId);
	});

	it("TC-2.2f: session creation failure sends error", async () => {
		shouldFailCreate = true;
		const projectPath = makeProjectDir(tempRoot, "project-fail");
		const addResp = await sendAndReceive(
			ws,
			{ type: "project:add", path: projectPath, requestId: "req-10a" },
			"project:added",
		);
		const projectId = (addResp.project as { id: string }).id;

		const response = await sendAndReceive(
			ws,
			{
				type: "session:create",
				projectId,
				cliType: "claude-code",
				requestId: "req-10b",
			},
			"error",
		);
		expect(response.type).toBe("error");
		expect(typeof response.message).toBe("string");
	});
});
