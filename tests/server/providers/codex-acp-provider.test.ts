import { describe, expect, it, vi } from "vitest";
import {
	CodexAcpProvider,
	type CodexAcpClient,
} from "../../../server/providers/codex/codex-acp-provider";
import type {
	AcpPromptResult,
	AcpUpdateEvent,
} from "../../../server/acp/acp-types";
import type {
	MessageUpsert,
	ToolCallUpsert,
	TurnEvent,
	UpsertObject,
} from "@server/streaming/upsert-types";

type SupportedUpdateType =
	| "agent_message_chunk"
	| "tool_call"
	| "tool_call_update";

type UpdatePayload<TType extends SupportedUpdateType> = Omit<
	Extract<AcpUpdateEvent, { type: TType }>,
	"type"
>;

interface PendingPrompt {
	onEvent?: (event: AcpUpdateEvent) => void;
	resolve: (result: AcpPromptResult) => void;
	reject: (error: Error) => void;
}

async function waitFor(
	predicate: () => boolean,
	description: string,
	timeoutMs = 600,
): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start >= timeoutMs) {
			throw new Error(`Timed out waiting for ${description}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

function isMessageUpsert(upsert: UpsertObject): upsert is MessageUpsert {
	return upsert.type === "message";
}

function isToolCallUpsert(upsert: UpsertObject): upsert is ToolCallUpsert {
	return upsert.type === "tool_call";
}

function createAcpFixture(sessionId = "codex-session-001"): {
	client: CodexAcpClient;
	sessionNew: ReturnType<typeof vi.fn>;
	sessionLoad: ReturnType<typeof vi.fn>;
	sessionPrompt: ReturnType<typeof vi.fn>;
	sessionCancel: ReturnType<typeof vi.fn>;
	onSessionUpdate: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
	emitSessionUpdate: <TType extends SupportedUpdateType>(
		type: TType,
		payload: UpdatePayload<TType>,
		targetSessionId?: string,
	) => void;
	emitTerminal: (
		stopReason?: AcpPromptResult["stopReason"],
		targetSessionId?: string,
	) => void;
	emitInterrupt: (targetSessionId?: string) => void;
	emitPromptFailure: (message: string, targetSessionId?: string) => void;
} {
	const pendingPrompts = new Map<string, PendingPrompt>();
	const sessionSubscribers = new Map<
		string,
		Set<(event: AcpUpdateEvent) => void>
	>();

	const sessionNew = vi.fn(async ({ cwd }: { cwd: string }) => {
		void cwd;
		return { sessionId };
	});
	const sessionLoad = vi.fn(async (_sessionId: string, _cwd: string) => []);
	const sessionPrompt = vi.fn(
		async (
			promptSessionId: string,
			_content: string,
			onEvent?: (event: AcpUpdateEvent) => void,
		) =>
			await new Promise<AcpPromptResult>((resolve, reject) => {
				pendingPrompts.set(promptSessionId, {
					onEvent,
					resolve,
					reject,
				});
			}),
	);
	const sessionCancel = vi.fn((_sessionId: string) => undefined);
	const close = vi.fn(async (_timeoutMs?: number) => undefined);
	const onSessionUpdate = vi.fn(
		(
			targetSessionId: string,
			callback: (event: AcpUpdateEvent) => void,
		): (() => void) => {
			const callbacks = sessionSubscribers.get(targetSessionId) ?? new Set();
			callbacks.add(callback);
			sessionSubscribers.set(targetSessionId, callbacks);
			return () => {
				const current = sessionSubscribers.get(targetSessionId);
				if (!current) {
					return;
				}
				current.delete(callback);
				if (current.size === 0) {
					sessionSubscribers.delete(targetSessionId);
				}
			};
		},
	);

	const client: CodexAcpClient = {
		sessionNew,
		sessionLoad,
		sessionPrompt,
		sessionCancel,
		close,
		onSessionUpdate,
		onError: () => undefined,
	};

	const emitToSubscribers = (
		targetSessionId: string,
		event: AcpUpdateEvent,
	) => {
		for (const callback of sessionSubscribers.get(targetSessionId) ?? []) {
			callback(event);
		}
		const pending = pendingPrompts.get(targetSessionId);
		pending?.onEvent?.(event);
	};

	return {
		client,
		sessionNew,
		sessionLoad,
		sessionPrompt,
		sessionCancel,
		onSessionUpdate,
		close,
		emitSessionUpdate: (type, payload, targetSessionId = sessionId) => {
			const event = { type, ...payload } as AcpUpdateEvent;
			emitToSubscribers(targetSessionId, event);
		},
		emitTerminal: (stopReason = "end_turn", targetSessionId = sessionId) => {
			const pending = pendingPrompts.get(targetSessionId);
			if (!pending) {
				return;
			}
			pendingPrompts.delete(targetSessionId);
			pending.resolve({ stopReason });
		},
		emitInterrupt: (targetSessionId = sessionId) => {
			const pending = pendingPrompts.get(targetSessionId);
			if (!pending) {
				return;
			}
			pendingPrompts.delete(targetSessionId);
			pending.resolve({ stopReason: "cancelled" });
		},
		emitPromptFailure: (message: string, targetSessionId = sessionId) => {
			const pending = pendingPrompts.get(targetSessionId);
			if (!pending) {
				return;
			}
			pendingPrompts.delete(targetSessionId);
			pending.reject(new Error(message));
		},
	};
}

function createProvider(fixture: { client: CodexAcpClient }): CodexAcpProvider {
	let turnOrdinal = 0;
	return new CodexAcpProvider({
		createClient: async () => fixture.client,
		createTurnId: () => {
			turnOrdinal += 1;
			return `turn-${turnOrdinal}`;
		},
		now: () => "2026-02-16T12:00:00.000Z",
	});
}

describe("CodexAcpProvider (Story 5, Red)", () => {
	it("TC-4.1a: createSession preserves ACP session/new behavior", async () => {
		const fixture = createAcpFixture("codex-acp-001");
		const provider = createProvider(fixture);

		const created = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});

		expect(created).toEqual({
			sessionId: "codex-acp-001",
			cliType: "codex",
		});
		expect(fixture.sessionNew).toHaveBeenCalledWith({
			cwd: "/tmp/liminal-builder",
		});
		expect(fixture.onSessionUpdate).toHaveBeenCalledWith(
			"codex-acp-001",
			expect.any(Function),
		);
	});

	it("TC-4.1b: loadSession preserves ACP session/load behavior", async () => {
		const fixture = createAcpFixture("codex-existing-001");
		const provider = createProvider(fixture);

		const loaded = await provider.loadSession("codex-existing-001", {
			viewFilePath: "/tmp/liminal-builder/server/providers/provider-types.ts",
		});

		expect(loaded).toEqual({
			sessionId: "codex-existing-001",
			cliType: "codex",
		});
		expect(fixture.sessionLoad).toHaveBeenCalledWith(
			"codex-existing-001",
			"/tmp/liminal-builder/server/providers",
		);
		expect(fixture.onSessionUpdate).toHaveBeenCalledWith(
			"codex-existing-001",
			expect.any(Function),
		);
	});

	it("TC-4.1c: sendMessage preserves ACP session/prompt behavior with turn-start synchronization semantics", async () => {
		const fixture = createAcpFixture();
		const provider = createProvider(fixture);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});

		let settled = false;
		const sendPromise = provider.sendMessage(session.sessionId, "hello codex");
		void sendPromise.then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			},
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(settled).toBe(false);

		fixture.emitSessionUpdate("agent_message_chunk", {
			content: [{ type: "text", text: "hello" }],
		});
		await expect(sendPromise).resolves.toEqual({ turnId: "turn-1" });

		expect(fixture.sessionPrompt).toHaveBeenCalledWith(
			session.sessionId,
			"hello codex",
		);
		fixture.emitTerminal("end_turn");
	});

	it("TC-4.2a: agent_message_chunk maps to message upsert emissions", async () => {
		const fixture = createAcpFixture();
		const provider = createProvider(fixture);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const upserts: UpsertObject[] = [];
		provider.onUpsert(session.sessionId, (upsert) => upserts.push(upsert));
		provider.onTurn(session.sessionId, () => undefined);

		const send = provider.sendMessage(session.sessionId, "say hi");
		fixture.emitSessionUpdate("agent_message_chunk", {
			content: [{ type: "text", text: "Hello " }],
		});
		await send;
		fixture.emitSessionUpdate("agent_message_chunk", {
			content: [{ type: "text", text: "world" }],
		});
		fixture.emitTerminal("end_turn");
		await waitFor(
			() =>
				upserts.some(
					(upsert) => isMessageUpsert(upsert) && upsert.status === "complete",
				),
			"message complete upsert for TC-4.2a",
		);

		const messageUpserts = upserts.filter(isMessageUpsert);
		expect(messageUpserts.map((upsert) => upsert.status)).toEqual([
			"create",
			"update",
			"complete",
		]);
		expect(messageUpserts.at(-1)?.content).toContain("Hello world");
	});

	it("TC-4.2b: tool_call maps to tool_call create upsert", async () => {
		const fixture = createAcpFixture();
		const provider = createProvider(fixture);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const upserts: UpsertObject[] = [];
		provider.onUpsert(session.sessionId, (upsert) => upserts.push(upsert));
		provider.onTurn(session.sessionId, () => undefined);

		const send = provider.sendMessage(session.sessionId, "use a tool");
		fixture.emitSessionUpdate("tool_call", {
			toolCallId: "call-1",
			title: "read_file",
			status: "in_progress",
			content: [{ type: "text", text: '{"path":"src/main.ts"' }],
		});
		await send;
		fixture.emitTerminal("end_turn");

		const createdToolCall = upserts.find(
			(upsert) =>
				isToolCallUpsert(upsert) &&
				upsert.status === "create" &&
				upsert.callId === "call-1" &&
				upsert.toolName === "read_file",
		);
		expect(createdToolCall).toBeDefined();
	});

	it("TC-4.2c: tool_call_update completion maps to tool_call complete upsert", async () => {
		const fixture = createAcpFixture();
		const provider = createProvider(fixture);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const upserts: UpsertObject[] = [];
		provider.onUpsert(session.sessionId, (upsert) => upserts.push(upsert));
		provider.onTurn(session.sessionId, () => undefined);

		const send = provider.sendMessage(session.sessionId, "finish tool call");
		fixture.emitSessionUpdate("tool_call", {
			toolCallId: "call-2",
			title: "write_file",
			status: "in_progress",
			content: [{ type: "text", text: '{"path":"out.txt"' }],
		});
		await send;
		fixture.emitSessionUpdate("tool_call_update", {
			toolCallId: "call-2",
			status: "completed",
			content: [{ type: "text", text: '{"path":"out.txt","text":"ok"}' }],
		});
		fixture.emitTerminal("end_turn");

		const completedToolCall = upserts.find(
			(upsert) =>
				isToolCallUpsert(upsert) &&
				upsert.status === "complete" &&
				upsert.callId === "call-2" &&
				upsert.toolArguments.path === "out.txt",
		);
		expect(completedToolCall).toBeDefined();
	});

	it("Regression: session/process liveness and callback delivery guard", async () => {
		const fixture = createAcpFixture();
		const provider = createProvider(fixture);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const upserts: UpsertObject[] = [];
		const turns: TurnEvent[] = [];
		provider.onUpsert(session.sessionId, (upsert) => upserts.push(upsert));
		provider.onTurn(session.sessionId, (event) => turns.push(event));

		const send = provider.sendMessage(session.sessionId, "check callbacks");
		fixture.emitSessionUpdate("agent_message_chunk", {
			content: [{ type: "text", text: "callback probe" }],
		});
		await send;
		fixture.emitTerminal("end_turn");
		await waitFor(
			() => turns.some((event) => event.type === "turn_complete"),
			"turn_complete callback",
		);

		expect(provider.isAlive(session.sessionId)).toBe(true);
		expect(turns.some((event) => event.type === "turn_started")).toBe(true);
		expect(upserts.length).toBeGreaterThan(0);
	});

	it("Regression: terminal error-shaping parity guard", async () => {
		const fixture = createAcpFixture();
		const provider = createProvider(fixture);
		const session = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const turns: TurnEvent[] = [];
		provider.onTurn(session.sessionId, (event) => turns.push(event));
		provider.onUpsert(session.sessionId, () => undefined);

		const send = provider.sendMessage(
			session.sessionId,
			"trigger transport error",
		);
		fixture.emitSessionUpdate("agent_message_chunk", {
			content: [{ type: "text", text: "starting turn" }],
		});
		await send;
		fixture.emitPromptFailure("acp transport broke");

		await waitFor(
			() => turns.some((event) => event.type === "turn_error"),
			"turn_error callback",
		);
		const terminal = turns.find((event) => event.type === "turn_error");
		expect(terminal).toMatchObject({
			type: "turn_error",
			errorCode: "PROCESS_CRASH",
		});
		if (!terminal || terminal.type !== "turn_error") {
			throw new Error("Expected terminal turn_error event");
		}
		expect(terminal.errorMessage).toContain("acp transport broke");
	});
});
