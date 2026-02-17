import { describe, expect, it, vi } from "vitest";
import type {
	CliProvider,
	CreateSessionOptions,
	LoadSessionOptions,
	ProviderSession,
	SendMessageResult,
} from "../../../server/providers/provider-types";
import {
	ClaudeSdkProvider,
	type ClaudeSdkAdapter,
	type ClaudeSdkQueryHandle,
	type ClaudeSdkQueryRequest,
} from "../../../server/providers/claude/claude-sdk-provider";
import {
	CodexAcpProvider,
	type CodexAcpClient,
} from "../../../server/providers/codex/codex-acp-provider";
import type {
	MessageUpsert,
	TurnEvent,
	UpsertObject,
} from "@server/streaming/upsert-types";
import type { AcpUpdateEvent } from "../../../server/acp/acp-types";

function createProviderDouble(): {
	provider: CliProvider;
	emitUpsert: (upsert: UpsertObject) => void;
	emitTurn: (event: TurnEvent) => void;
} {
	const upsertCallbacks = new Map<
		string,
		Array<(upsert: UpsertObject) => void>
	>();
	const turnCallbacks = new Map<string, Array<(event: TurnEvent) => void>>();

	const providerSession: ProviderSession = {
		sessionId: "provider-session-001",
		cliType: "claude-code",
	};

	const provider: CliProvider = {
		cliType: "claude-code",
		createSession: async (_options: CreateSessionOptions) => providerSession,
		loadSession: async (_sessionId: string, _options?: LoadSessionOptions) =>
			providerSession,
		sendMessage: async (
			_sessionId: string,
			_message: string,
		): Promise<SendMessageResult> => ({ turnId: "provider-turn-001" }),
		cancelTurn: async (_sessionId: string) => undefined,
		killSession: async (_sessionId: string) => undefined,
		isAlive: (_sessionId: string) => true,
		onUpsert: (sessionId: string, callback: (upsert: UpsertObject) => void) => {
			const listeners = upsertCallbacks.get(sessionId) ?? [];
			listeners.push(callback);
			upsertCallbacks.set(sessionId, listeners);
		},
		onTurn: (sessionId: string, callback: (event: TurnEvent) => void) => {
			const listeners = turnCallbacks.get(sessionId) ?? [];
			listeners.push(callback);
			turnCallbacks.set(sessionId, listeners);
		},
	};

	return {
		provider,
		emitUpsert: (upsert: UpsertObject) => {
			for (const callback of upsertCallbacks.get(upsert.sessionId) ?? []) {
				callback(upsert);
			}
		},
		emitTurn: (event: TurnEvent) => {
			for (const callback of turnCallbacks.get(event.sessionId) ?? []) {
				callback(event);
			}
		},
	};
}

describe("Provider interface contracts (Story 1, Red)", () => {
	it("TC-2.1a: CliProvider shape includes createSession/loadSession/sendMessage/cancelTurn/killSession/isAlive/onUpsert/onTurn", async () => {
		const { provider, emitUpsert, emitTurn } = createProviderDouble();

		expect(provider.cliType).toBe("claude-code");
		expect(typeof provider.createSession).toBe("function");
		expect(typeof provider.loadSession).toBe("function");
		expect(typeof provider.sendMessage).toBe("function");
		expect(typeof provider.cancelTurn).toBe("function");
		expect(typeof provider.killSession).toBe("function");
		expect(typeof provider.isAlive).toBe("function");
		expect(typeof provider.onUpsert).toBe("function");
		expect(typeof provider.onTurn).toBe("function");

		const created = await provider.createSession({
			projectDir: "/tmp/liminal-builder",
		});
		const loadedWithoutOptions = await provider.loadSession(created.sessionId);
		const loadedWithOptions = await provider.loadSession(created.sessionId, {
			viewFilePath: "/tmp/liminal-builder/server/index.ts",
		});
		const sendResult = await provider.sendMessage(created.sessionId, "hello");

		expect(created.sessionId).toBe("provider-session-001");
		expect(loadedWithoutOptions.sessionId).toBe("provider-session-001");
		expect(loadedWithOptions.sessionId).toBe("provider-session-001");
		expect(sendResult.turnId).toBe("provider-turn-001");
		expect(provider.isAlive(created.sessionId)).toBe(true);
		await expect(
			provider.cancelTurn(created.sessionId),
		).resolves.toBeUndefined();
		await expect(
			provider.killSession(created.sessionId),
		).resolves.toBeUndefined();

		let deliveredUpserts = 0;
		let deliveredTurns = 0;
		provider.onUpsert(created.sessionId, () => {
			deliveredUpserts += 1;
		});
		provider.onTurn(created.sessionId, () => {
			deliveredTurns += 1;
		});

		const messageUpsert: MessageUpsert = {
			type: "message",
			turnId: "provider-turn-001",
			sessionId: created.sessionId,
			itemId: "provider-turn-001:1:0",
			sourceTimestamp: "2026-02-15T10:00:00.000Z",
			emittedAt: "2026-02-15T10:00:00.000Z",
			status: "create",
			content: "hello",
			origin: "agent",
		};
		emitUpsert(messageUpsert);
		emitTurn({
			type: "turn_started",
			turnId: "provider-turn-001",
			sessionId: created.sessionId,
			modelId: "claude-sonnet-4-5-20250929",
			providerId: "claude-code",
		});
		expect(deliveredUpserts).toBe(1);
		expect(deliveredTurns).toBe(1);
	});

	it("TC-2.1b: Claude provider satisfies CliProvider surface with no type errors", () => {
		async function* emptyStream(): AsyncGenerator<never> {}

		const query = vi.fn<
			(request: ClaudeSdkQueryRequest) => Promise<ClaudeSdkQueryHandle>
		>(async () => ({
			output: emptyStream(),
			interrupt: async () => undefined,
			close: async () => undefined,
			isAlive: () => true,
		}));

		const sdk: ClaudeSdkAdapter = { query };
		const provider: CliProvider = new ClaudeSdkProvider({
			sdk,
			createSessionId: () => "claude-session-001",
			createTurnId: () => "claude-turn-001",
			now: () => "2026-02-15T10:00:00.000Z",
		});

		expect(provider.cliType).toBe("claude-code");
		expect(typeof provider.createSession).toBe("function");
		expect(typeof provider.loadSession).toBe("function");
		expect(typeof provider.sendMessage).toBe("function");
		expect(typeof provider.cancelTurn).toBe("function");
		expect(typeof provider.killSession).toBe("function");
		expect(typeof provider.isAlive).toBe("function");
		expect(typeof provider.onUpsert).toBe("function");
		expect(typeof provider.onTurn).toBe("function");
	});

	it("TC-2.1c: Codex provider satisfies CliProvider surface with no type errors", () => {
		const client: CodexAcpClient = {
			sessionNew: async (_params: { cwd: string }) => ({
				sessionId: "codex-session-001",
			}),
			sessionLoad: async (_sessionId: string, _cwd: string) => [],
			sessionPrompt: async (
				_sessionId: string,
				_content: string,
				_onEvent?: (event: AcpUpdateEvent) => void,
			) => ({ stopReason: "end_turn" }),
			sessionCancel: (_sessionId: string) => undefined,
			close: async (_timeoutMs?: number) => undefined,
			onSessionUpdate:
				(_sessionId: string, _callback: (event: AcpUpdateEvent) => void) =>
				() =>
					undefined,
			onError: (_handler: (error: Error) => void) => undefined,
		};
		const provider: CliProvider = new CodexAcpProvider({
			createClient: async () => client,
			createTurnId: () => "codex-turn-001",
			now: () => "2026-02-16T12:00:00.000Z",
		});

		expect(provider.cliType).toBe("codex");
		expect(typeof provider.createSession).toBe("function");
		expect(typeof provider.loadSession).toBe("function");
		expect(typeof provider.sendMessage).toBe("function");
		expect(typeof provider.cancelTurn).toBe("function");
		expect(typeof provider.killSession).toBe("function");
		expect(typeof provider.isAlive).toBe("function");
		expect(typeof provider.onUpsert).toBe("function");
		expect(typeof provider.onTurn).toBe("function");
	});
});
