import { EventEmitter } from "node:events";
import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
	AcpPromptResult,
	AcpUpdateEvent,
} from "../../server/acp/acp-types";
import { AcpClient } from "../../server/acp/acp-client";
import type { Project } from "../../server/projects/project-types";
import type { CliType } from "../../server/sessions/session-types";
import type { ChatEntry } from "../../shared/types";
import type { ServerMessage } from "../../shared/types";
import { handleWebSocket, type WebSocketDeps } from "../../server/websocket";

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
		typeof vi.fn<(sessionId: string, cwd: string) => Promise<ChatEntry[]>>
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

function createHarness(): MockHarness {
	const socket = new MockSocket();
	const emitter = new EventEmitter();

	const sessionNew = vi.fn<
		(params: { cwd: string }) => Promise<{ sessionId: string }>
	>(() => Promise.resolve({ sessionId: "acp-session-1" }));
	const sessionLoad = vi.fn<
		(sessionId: string, cwd: string) => Promise<ChatEntry[]>
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
		const updates = messagesOfType(messages, "session:update");
		const chunks = messagesOfType(messages, "session:chunk");
		const completes = messagesOfType(messages, "session:complete");

		expect(updates).toHaveLength(1);
		expect(updates[0].entry.type).toBe("assistant");
		const assistantEntryId = updates[0].entry.entryId;

		expect(chunks).toHaveLength(2);
		expect(chunks.map((chunk) => chunk.content)).toEqual(["Hello", " world"]);
		expect(chunks.every((chunk) => chunk.entryId === assistantEntryId)).toBe(
			true,
		);

		expect(completes).toHaveLength(1);
		expect(completes[0]).toMatchObject({
			type: "session:complete",
			sessionId: "claude-code:session-7",
			entryId: assistantEntryId,
		});
	});

	it("emits session:cancelled when prompt stopReason is cancelled", async () => {
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
		const cancelled = messagesOfType(messages, "session:cancelled");
		const complete = messagesOfType(messages, "session:complete");
		expect(cancelled).toHaveLength(1);
		expect(complete).toHaveLength(0);
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

		const updates = messagesOfType(
			harness.socket.getMessages(),
			"session:update",
		);
		const toolEntries = updates
			.map((update) => update.entry)
			.filter(
				(entry): entry is Extract<ChatEntry, { type: "tool-call" }> =>
					entry.type === "tool-call",
			);
		expect(toolEntries).toHaveLength(2);
		expect(toolEntries[0].name).toBe("Run tests");
		expect(toolEntries[1].name).toBe("Run tests");
		expect(toolEntries[1].entryId).toBe(toolEntries[0].entryId);
		expect(toolEntries[1].status).toBe("complete");
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
			requestId: "open-1",
		});

		harness.socket.emitMessage({
			type: "session:cancel",
			sessionId: "claude-code:cancel-123",
		});
		await flushAsync();

		expect(harness.sessionCancel).toHaveBeenCalledWith("cancel-123");
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
