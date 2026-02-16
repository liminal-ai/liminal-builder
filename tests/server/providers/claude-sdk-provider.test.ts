import { describe, expect, it, vi } from "vitest";
import { ClaudeSdkProvider } from "../../../server/providers/claude/claude-sdk-provider";
import type {
	ClaudeSdkAdapter,
	ClaudeSdkQueryHandle,
	ClaudeSdkQueryRequest,
} from "../../../server/providers/claude/claude-sdk-provider";
import type { ClaudeSdkStreamEvent } from "../../../server/providers/claude/claude-event-normalizer";
import type { StreamEventEnvelope } from "../../../server/streaming";

async function* streamFrom(
	events: ClaudeSdkStreamEvent[],
): AsyncGenerator<ClaudeSdkStreamEvent> {
	for (const event of events) {
		yield event;
	}
}

function createMockSdkBoundary(events: ClaudeSdkStreamEvent[] = []): {
	adapter: ClaudeSdkAdapter;
	query: ReturnType<
		typeof vi.fn<
			(request: ClaudeSdkQueryRequest) => Promise<ClaudeSdkQueryHandle>
		>
	>;
	interrupt: ReturnType<typeof vi.fn<() => Promise<void>>>;
	close: ReturnType<typeof vi.fn<() => Promise<void>>>;
	isAlive: ReturnType<typeof vi.fn<() => boolean>>;
} {
	const interrupt = vi.fn<() => Promise<void>>(() => Promise.resolve());
	const close = vi.fn<() => Promise<void>>(() => Promise.resolve());
	const isAlive = vi.fn<() => boolean>(() => true);
	const query = vi.fn<
		(request: ClaudeSdkQueryRequest) => Promise<ClaudeSdkQueryHandle>
	>(async () => ({
		output: streamFrom(events),
		interrupt,
		close,
		isAlive,
	}));

	return {
		adapter: { query },
		query,
		interrupt,
		close,
		isAlive,
	};
}

function createProvider(boundary: {
	adapter: ClaudeSdkAdapter;
}): ClaudeSdkProvider {
	return new ClaudeSdkProvider({
		sdk: boundary.adapter,
		createSessionId: () => "claude-session-001",
		createTurnId: (() => {
			let ordinal = 0;
			return () => {
				ordinal += 1;
				return `turn-${ordinal}`;
			};
		})(),
	});
}

describe("ClaudeSdkProvider (Story 4, Red)", () => {
	it("TC-3.1a: createSession establishes persistent SDK-backed session state", async () => {
		const boundary = createMockSdkBoundary();
		const provider = createProvider(boundary);

		const created = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const reloaded = await provider.loadSession(created.sessionId);

		expect(boundary.query).toHaveBeenCalledTimes(1);
		const [request] = boundary.query.mock.calls[0];
		expect(request.cwd).toBe("/tmp/liminal-builder");
		expect(created).toEqual({
			sessionId: "claude-session-001",
			cliType: "claude-code",
		});
		expect(reloaded).toEqual(created);
		expect(provider.isAlive(created.sessionId)).toBe(true);
	});

	it("TC-3.1b: loadSession restores existing session context using provider resume mechanics", async () => {
		const boundary = createMockSdkBoundary();
		const provider = createProvider(boundary);
		const sessionId = "claude-session-existing";

		const loaded = await provider.loadSession(sessionId, {
			viewFilePath: "/tmp/liminal-builder/.claude/views/session.md",
		});
		const sendResult = await provider.sendMessage(sessionId, "resume now");

		expect(loaded).toEqual({
			sessionId,
			cliType: "claude-code",
		});
		expect(sendResult.turnId).toBe("turn-1");
		expect(boundary.query).toHaveBeenCalledTimes(1);
		const [request] = boundary.query.mock.calls[0];
		expect(request.resumeSessionId).toBe(sessionId);
	});

	it("TC-3.1c: creation failure returns descriptive typed error and avoids orphaned process state", async () => {
		const boundary = createMockSdkBoundary();
		const provider = createProvider(boundary);
		boundary.query.mockRejectedValueOnce(new Error("spawn failed"));

		await expect(
			provider.createSession({
				projectDir: "/tmp/liminal-builder-missing",
			}),
		).rejects.toMatchObject({
			name: "ProviderError",
			code: "SESSION_CREATE_FAILED",
		});

		expect(provider.isAlive("claude-session-001")).toBe(false);
	});

	it("TC-3.2a: sendMessage delivers content through streaming input generator to active subprocess", async () => {
		const boundary = createMockSdkBoundary();
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		expect(boundary.query).toHaveBeenCalledTimes(1);

		await provider.sendMessage(session.sessionId, "summarize this file");
		expect(boundary.query).toHaveBeenCalledTimes(1);

		const [request] = boundary.query.mock.calls[0];
		const iterator = request.input[Symbol.asyncIterator]();
		await expect(iterator.next()).resolves.toEqual({
			done: false,
			value: "summarize this file",
		});
	});

	it("TC-3.2b: sequential sends are processed in order on the same live session", async () => {
		const boundary = createMockSdkBoundary();
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});

		const first = await provider.sendMessage(
			session.sessionId,
			"first message",
		);
		const second = await provider.sendMessage(
			session.sessionId,
			"second message",
		);

		expect(first.turnId).toBe("turn-1");
		expect(second.turnId).toBe("turn-2");
		expect(boundary.query).toHaveBeenCalledTimes(1);
		const [request] = boundary.query.mock.calls[0];
		const iterator = request.input[Symbol.asyncIterator]();
		await expect(iterator.next()).resolves.toEqual({
			done: false,
			value: "first message",
		});
		await expect(iterator.next()).resolves.toEqual({
			done: false,
			value: "second message",
		});
	});

	it("TC-3.3a: text blocks map to canonical item_start/item_delta/item_done (message)", async () => {
		const boundary = createMockSdkBoundary([
			{
				type: "message_start",
				message: { id: "msg-1", model: "claude-sonnet-4-5-20250929" },
			},
			{
				type: "content_block_start",
				index: 0,
				contentBlock: { type: "text", text: "" },
			},
			{
				type: "content_block_delta",
				index: 0,
				delta: { type: "text_delta", text: "Hello" },
			},
			{ type: "content_block_stop", index: 0 },
			{
				type: "message_delta",
				delta: {
					stopReason: "end_turn",
					usage: { inputTokens: 10, outputTokens: 4 },
				},
			},
			{ type: "message_stop" },
		]);
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const emitted: StreamEventEnvelope[] = [];
		provider.onEvent(session.sessionId, (event) => emitted.push(event));

		await provider.sendMessage(session.sessionId, "say hello");

		expect(emitted.map((event) => event.type)).toEqual([
			"response_start",
			"item_start",
			"item_delta",
			"item_done",
			"response_done",
		]);
	});

	it("TC-3.3b: tool-use blocks map to canonical function_call lifecycle and final arguments are authoritative at item_done(function_call)", async () => {
		const boundary = createMockSdkBoundary([
			{
				type: "message_start",
				message: { id: "msg-2", model: "claude-sonnet-4-5-20250929" },
			},
			{
				type: "content_block_start",
				index: 0,
				contentBlock: {
					type: "tool_use",
					id: "toolu-1",
					name: "read_file",
					input: {},
				},
			},
			{
				type: "content_block_delta",
				index: 0,
				delta: { type: "input_json_delta", partialJson: '{"path":"src/a.ts"}' },
			},
			{ type: "content_block_stop", index: 0 },
			{
				type: "message_delta",
				delta: {
					stopReason: "tool_use",
					usage: { inputTokens: 20, outputTokens: 5 },
				},
			},
			{ type: "message_stop" },
		]);
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const emitted: StreamEventEnvelope[] = [];
		provider.onEvent(session.sessionId, (event) => emitted.push(event));

		await provider.sendMessage(session.sessionId, "run read_file");

		const functionCallStart = emitted.find(
			(event) =>
				event.type === "item_start" &&
				event.payload.type === "item_start" &&
				event.payload.itemType === "function_call",
		);
		const functionCallDone = emitted.find(
			(event) =>
				event.type === "item_done" &&
				event.payload.type === "item_done" &&
				event.payload.finalItem.type === "function_call",
		);
		expect(functionCallStart).toBeDefined();
		expect(functionCallDone).toBeDefined();
	});

	it("TC-3.3c: SDK user tool-result messages map to item_done(function_call_output) with original callId", async () => {
		const boundary = createMockSdkBoundary([
			{
				type: "message_start",
				message: { id: "msg-3", model: "claude-sonnet-4-5-20250929" },
			},
			{
				type: "user_tool_result",
				toolUseId: "toolu-1",
				content: '{"ok":true}',
				isError: false,
			},
			{
				type: "message_delta",
				delta: {
					stopReason: "end_turn",
					usage: { inputTokens: 8, outputTokens: 3 },
				},
			},
			{ type: "message_stop" },
		]);
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const emitted: StreamEventEnvelope[] = [];
		provider.onEvent(session.sessionId, (event) => emitted.push(event));

		await provider.sendMessage(session.sessionId, "tool output arrived");

		const outputDone = emitted.find(
			(event) =>
				event.type === "item_done" &&
				event.payload.type === "item_done" &&
				event.payload.finalItem.type === "function_call_output" &&
				event.payload.finalItem.callId === "toolu-1",
		);
		expect(outputDone).toBeDefined();
	});

	it("TC-3.3d: thinking blocks map to canonical reasoning events", async () => {
		const boundary = createMockSdkBoundary([
			{
				type: "message_start",
				message: { id: "msg-4", model: "claude-sonnet-4-5-20250929" },
			},
			{
				type: "content_block_start",
				index: 0,
				contentBlock: { type: "thinking", thinking: "" },
			},
			{
				type: "content_block_delta",
				index: 0,
				delta: { type: "thinking_delta", thinking: "Plan first." },
			},
			{ type: "content_block_stop", index: 0 },
			{
				type: "message_delta",
				delta: {
					stopReason: "end_turn",
					usage: { inputTokens: 11, outputTokens: 7 },
				},
			},
			{ type: "message_stop" },
		]);
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const emitted: StreamEventEnvelope[] = [];
		provider.onEvent(session.sessionId, (event) => emitted.push(event));

		await provider.sendMessage(session.sessionId, "think this through");

		const reasoningDone = emitted.find(
			(event) =>
				event.type === "item_done" &&
				event.payload.type === "item_done" &&
				event.payload.finalItem.type === "reasoning",
		);
		expect(reasoningDone).toBeDefined();
	});

	it("TC-3.3e: interleaved content blocks get distinct deterministic itemId values", async () => {
		const boundary = createMockSdkBoundary([
			{
				type: "message_start",
				message: { id: "msg-5", model: "claude-sonnet-4-5-20250929" },
			},
			{
				type: "content_block_start",
				index: 0,
				contentBlock: { type: "text", text: "" },
			},
			{
				type: "content_block_start",
				index: 1,
				contentBlock: {
					type: "tool_use",
					id: "toolu-2",
					name: "list_dir",
					input: {},
				},
			},
			{
				type: "content_block_delta",
				index: 0,
				delta: { type: "text_delta", text: "interleaved " },
			},
			{
				type: "content_block_delta",
				index: 1,
				delta: { type: "input_json_delta", partialJson: '{"path":"."}' },
			},
			{ type: "content_block_stop", index: 0 },
			{ type: "content_block_stop", index: 1 },
			{
				type: "message_delta",
				delta: {
					stopReason: "tool_use",
					usage: { inputTokens: 18, outputTokens: 9 },
				},
			},
			{ type: "message_stop" },
		]);
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const emitted: StreamEventEnvelope[] = [];
		provider.onEvent(session.sessionId, (event) => emitted.push(event));

		await provider.sendMessage(session.sessionId, "mix text and tool");

		const itemStartIds: string[] = [];
		for (const event of emitted) {
			if (event.type === "item_start" && event.payload.type === "item_start") {
				itemStartIds.push(event.payload.itemId);
			}
		}
		expect(new Set(itemStartIds).size).toBe(itemStartIds.length);
		expect(itemStartIds).toEqual(["turn-1:1:0", "turn-1:1:1"]);
	});

	it("TC-3.3f: response lifecycle emits response_start and terminal metadata, with structured error details for error terminal states", async () => {
		const boundary = createMockSdkBoundary([
			{
				type: "message_start",
				message: { id: "msg-6", model: "claude-sonnet-4-5-20250929" },
			},
			{
				type: "message_delta",
				delta: {
					stopReason: "error",
					usage: { inputTokens: 4, outputTokens: 0 },
				},
			},
			{ type: "message_stop" },
		]);
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const emitted: StreamEventEnvelope[] = [];
		provider.onEvent(session.sessionId, (event) => emitted.push(event));

		await provider.sendMessage(session.sessionId, "trigger error");

		expect(emitted[0]?.type).toBe("response_start");
		const responseError = emitted.find(
			(event) => event.type === "response_error",
		);
		const responseDoneError = emitted.find(
			(event) =>
				event.type === "response_done" &&
				event.payload.type === "response_done" &&
				event.payload.status === "error",
		);
		expect(responseError ?? responseDoneError).toBeDefined();
	});

	it("TC-3.4a: cancelTurn triggers SDK interrupt and turn cancellation semantics", async () => {
		const boundary = createMockSdkBoundary();
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});

		await provider.sendMessage(session.sessionId, "long running task");
		await provider.cancelTurn(session.sessionId);

		expect(boundary.interrupt).toHaveBeenCalledTimes(1);
	});

	it("TC-3.4b: killSession terminates subprocess and marks session dead", async () => {
		const boundary = createMockSdkBoundary();
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});

		await provider.killSession(session.sessionId);

		expect(boundary.close).toHaveBeenCalledTimes(1);
		expect(provider.isAlive(session.sessionId)).toBe(false);
	});

	it("TC-3.4c: isAlive reflects process state before and after kill", async () => {
		const boundary = createMockSdkBoundary();
		const provider = createProvider(boundary);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});

		expect(provider.isAlive(session.sessionId)).toBe(true);
		await provider.killSession(session.sessionId);
		expect(provider.isAlive(session.sessionId)).toBe(false);
	});
});
