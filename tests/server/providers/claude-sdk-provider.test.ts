import { describe, expect, it, vi } from "vitest";
import { ClaudeSdkProvider } from "../../../server/providers/claude/claude-sdk-provider";
import type {
	ClaudeSdkAdapter,
	ClaudeSdkQueryHandle,
	ClaudeSdkQueryRequest,
	ClaudeSdkStreamEvent,
} from "../../../server/providers/claude/claude-sdk-provider";
import type {
	MessageUpsert,
	ThinkingUpsert,
	ToolCallUpsert,
	TurnEvent,
	UpsertObject,
} from "@server/streaming/upsert-types";

async function* streamFromRequest(
	request: ClaudeSdkQueryRequest,
	events: ClaudeSdkStreamEvent[],
): AsyncGenerator<ClaudeSdkStreamEvent> {
	if (events.length === 0) {
		return;
	}

	const inputIterator = request.input[Symbol.asyncIterator]();
	const firstInput = await inputIterator.next();
	if (firstInput.done) {
		return;
	}

	for (const event of events) {
		yield event;
	}
}

async function waitFor(
	predicate: () => boolean,
	description: string,
	timeoutMs = 500,
): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start >= timeoutMs) {
			throw new Error(`Timed out waiting for ${description}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
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
	>(async (request) => ({
		output: streamFromRequest(request, events),
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
		now: () => "2026-02-15T10:00:00.000Z",
	});
}

function isMessageUpsert(upsert: UpsertObject): upsert is MessageUpsert {
	return upsert.type === "message";
}

function isToolCallUpsert(upsert: UpsertObject): upsert is ToolCallUpsert {
	return upsert.type === "tool_call";
}

function isThinkingUpsert(upsert: UpsertObject): upsert is ThinkingUpsert {
	return upsert.type === "thinking";
}

function isCompleteMessageUpsert(
	upsert: UpsertObject,
): upsert is MessageUpsert {
	return isMessageUpsert(upsert) && upsert.status === "complete";
}

function isCompleteThinkingUpsert(
	upsert: UpsertObject,
): upsert is ThinkingUpsert {
	return isThinkingUpsert(upsert) && upsert.status === "complete";
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

	it("TC-3.3a: text blocks emit message upserts bracketed by turn lifecycle events", async () => {
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

		const upserts: UpsertObject[] = [];
		const turns: TurnEvent[] = [];
		const emissionOrder: Array<{
			kind: "turn" | "upsert";
			type?: TurnEvent["type"];
		}> = [];
		provider.onUpsert(session.sessionId, (upsert) => {
			upserts.push(upsert);
			emissionOrder.push({ kind: "upsert" });
		});
		provider.onTurn(session.sessionId, (event) => {
			turns.push(event);
			emissionOrder.push({ kind: "turn", type: event.type });
		});

		const sendResult = await provider.sendMessage(
			session.sessionId,
			"say hello",
		);
		expect(sendResult.turnId).toBe("turn-1");
		await waitFor(
			() => turns.some((event) => event.type === "turn_complete"),
			"turn_complete for TC-3.3a",
		);
		await waitFor(
			() =>
				upserts.some(
					(upsert) =>
						isMessageUpsert(upsert) &&
						upsert.status === "create" &&
						upsert.origin === "agent" &&
						upsert.itemId === "turn-1:1:0",
				),
			"message create upsert for TC-3.3a",
		);

		expect(turns[0]).toMatchObject({
			type: "turn_started",
			turnId: "turn-1",
			sessionId: session.sessionId,
			modelId: "claude-sonnet-4-5-20250929",
		});

		const createMessage = upserts.find(
			(upsert) =>
				isMessageUpsert(upsert) &&
				upsert.status === "create" &&
				upsert.origin === "agent" &&
				upsert.itemId === "turn-1:1:0",
		);
		expect(createMessage).toBeDefined();

		const completeMessages = upserts.filter(isCompleteMessageUpsert);
		expect(completeMessages.at(-1)?.content).toContain("Hello");

		expect(turns.at(-1)).toMatchObject({
			type: "turn_complete",
			turnId: "turn-1",
			sessionId: session.sessionId,
			status: "completed",
			usage: { inputTokens: 10, outputTokens: 4 },
		});
		expect(emissionOrder[0]).toEqual({ kind: "turn", type: "turn_started" });
		expect(emissionOrder.at(-1)).toEqual({
			kind: "turn",
			type: "turn_complete",
		});
		expect(emissionOrder.some((entry) => entry.kind === "upsert")).toBe(true);
	});

	it("TC-3.3b: tool-use blocks emit tool call upserts with finalized arguments", async () => {
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
		const upserts: UpsertObject[] = [];
		provider.onUpsert(session.sessionId, (upsert) => upserts.push(upsert));
		provider.onTurn(session.sessionId, () => undefined);

		const sendResult = await provider.sendMessage(
			session.sessionId,
			"run read_file",
		);
		expect(sendResult.turnId).toBe("turn-1");
		await waitFor(
			() =>
				upserts.some(
					(upsert) =>
						isToolCallUpsert(upsert) &&
						upsert.status === "complete" &&
						upsert.callId === "toolu-1",
				),
			"tool call complete upsert for TC-3.3b",
		);

		const createdCall = upserts.find(
			(upsert) =>
				isToolCallUpsert(upsert) &&
				upsert.status === "create" &&
				upsert.toolName === "read_file" &&
				upsert.callId === "toolu-1" &&
				upsert.itemId === "turn-1:1:0",
		);
		expect(createdCall).toBeDefined();

		const completedCall = upserts.find(
			(upsert) =>
				isToolCallUpsert(upsert) &&
				upsert.status === "complete" &&
				upsert.callId === "toolu-1" &&
				upsert.toolArguments.path === "src/a.ts",
		);
		expect(completedCall).toBeDefined();
	});

	it("TC-3.3c: user tool-result messages emit complete tool output upserts", async () => {
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
		const upserts: UpsertObject[] = [];
		provider.onUpsert(session.sessionId, (upsert) => upserts.push(upsert));
		provider.onTurn(session.sessionId, () => undefined);

		const sendResult = await provider.sendMessage(
			session.sessionId,
			"tool output arrived",
		);
		expect(sendResult.turnId).toBe("turn-1");
		await waitFor(
			() =>
				upserts.some(
					(upsert) =>
						isToolCallUpsert(upsert) &&
						upsert.status === "complete" &&
						upsert.callId === "toolu-1" &&
						upsert.toolOutput === '{"ok":true}' &&
						upsert.toolOutputIsError === false,
				),
			"tool result upsert for TC-3.3c",
		);

		const toolOutput = upserts.find(
			(upsert) =>
				isToolCallUpsert(upsert) &&
				upsert.status === "complete" &&
				upsert.callId === "toolu-1" &&
				upsert.toolOutput === '{"ok":true}' &&
				upsert.toolOutputIsError === false,
		);
		expect(toolOutput).toBeDefined();
	});

	it("TC-3.3d: thinking blocks emit thinking upserts", async () => {
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
		const upserts: UpsertObject[] = [];
		provider.onUpsert(session.sessionId, (upsert) => upserts.push(upsert));
		provider.onTurn(session.sessionId, () => undefined);

		const sendResult = await provider.sendMessage(
			session.sessionId,
			"think this through",
		);
		expect(sendResult.turnId).toBe("turn-1");
		await waitFor(
			() =>
				upserts.some(
					(upsert) => isThinkingUpsert(upsert) && upsert.status === "complete",
				),
			"thinking complete upsert for TC-3.3d",
		);

		const createdThinking = upserts.find(
			(upsert) =>
				isThinkingUpsert(upsert) &&
				upsert.status === "create" &&
				upsert.providerId === "claude-code",
		);
		expect(createdThinking).toBeDefined();

		const completedThinking = upserts.filter(isCompleteThinkingUpsert);
		const lastCompletedThinking = completedThinking.at(-1);
		expect(lastCompletedThinking).toBeDefined();
		if (!lastCompletedThinking) {
			throw new Error("Expected a complete thinking upsert");
		}
		expect(lastCompletedThinking.content).toContain("Plan first.");
		expect(lastCompletedThinking.providerId).toBe("claude-code");
	});

	it("TC-3.3e: interleaved content blocks use distinct deterministic itemIds", async () => {
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
		const upserts: UpsertObject[] = [];
		provider.onUpsert(session.sessionId, (upsert) => upserts.push(upsert));
		provider.onTurn(session.sessionId, () => undefined);

		const sendResult = await provider.sendMessage(
			session.sessionId,
			"mix text and tool",
		);
		expect(sendResult.turnId).toBe("turn-1");
		await waitFor(() => upserts.length >= 4, "interleaved upserts for TC-3.3e");

		const itemIds = new Set(upserts.map((upsert) => upsert.itemId));
		expect(itemIds.size).toBeGreaterThanOrEqual(2);
		expect(itemIds).toEqual(new Set(["turn-1:1:0", "turn-1:1:1"]));

		const textItemIds = new Set(
			upserts
				.filter((upsert) => isMessageUpsert(upsert))
				.map((upsert) => upsert.itemId),
		);
		const toolItemIds = new Set(
			upserts
				.filter((upsert) => isToolCallUpsert(upsert))
				.map((upsert) => upsert.itemId),
		);

		const hasDistinctTextAndToolIds = [...textItemIds].some(
			(textItemId) => !toolItemIds.has(textItemId),
		);
		expect(hasDistinctTextAndToolIds).toBe(true);
	});

	it("TC-3.3f: response lifecycle uses turn_error terminal for error stop reasons", async () => {
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
		const upserts: UpsertObject[] = [];
		const turns: TurnEvent[] = [];
		const emissionOrder: Array<{
			kind: "turn" | "upsert";
			type?: TurnEvent["type"];
		}> = [];
		provider.onUpsert(session.sessionId, (upsert) => {
			upserts.push(upsert);
			emissionOrder.push({ kind: "upsert" });
		});
		provider.onTurn(session.sessionId, (event) => {
			turns.push(event);
			emissionOrder.push({ kind: "turn", type: event.type });
		});

		const sendResult = await provider.sendMessage(
			session.sessionId,
			"trigger error",
		);
		expect(sendResult.turnId).toBe("turn-1");
		await waitFor(
			() => turns.some((event) => event.type === "turn_error"),
			"turn_error terminal for TC-3.3f",
		);

		expect(turns[0]?.type).toBe("turn_started");
		expect(turns[0]?.turnId).toBe("turn-1");
		const errorTurn = turns.find((event) => event.type === "turn_error");
		expect(errorTurn).toBeDefined();
		if (!errorTurn || errorTurn.type !== "turn_error") {
			throw new Error("Expected turn_error terminal event");
		}
		expect(errorTurn.turnId).toBe("turn-1");
		expect(errorTurn.sessionId).toBe(session.sessionId);
		expect(errorTurn.errorCode.length).toBeGreaterThan(0);
		expect(errorTurn.errorMessage.length).toBeGreaterThan(0);
		expect(turns.some((event) => event.type === "turn_complete")).toBe(false);
		expect(emissionOrder[0]).toEqual({ kind: "turn", type: "turn_started" });
		const firstUpsertIndex = emissionOrder.findIndex(
			(entry) => entry.kind === "upsert",
		);
		expect(firstUpsertIndex === -1 || firstUpsertIndex > 0).toBe(true);
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
