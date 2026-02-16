import { describe, expect, it } from "vitest";
import type {
	CliProvider,
	CreateSessionOptions,
	LoadSessionOptions,
	ProviderSession,
	SendMessageResult,
} from "../../../server/providers/provider-types";
import type { StreamEventEnvelope } from "../../../server/streaming";
import { RESPONSE_START_FIXTURE } from "../../fixtures/stream-events";

function createProviderDouble(): {
	provider: CliProvider;
	emit: (event: StreamEventEnvelope) => void;
} {
	const callbacks = new Map<
		string,
		Array<(event: StreamEventEnvelope) => void>
	>();

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
		onEvent: (
			sessionId: string,
			callback: (event: StreamEventEnvelope) => void,
		) => {
			const listeners = callbacks.get(sessionId) ?? [];
			listeners.push(callback);
			callbacks.set(sessionId, listeners);
		},
	};

	return {
		provider,
		emit: (event: StreamEventEnvelope) => {
			for (const callback of callbacks.get(event.sessionId) ?? []) {
				callback(event);
			}
		},
	};
}

describe("Provider interface contracts (Story 1, Red)", () => {
	it("TC-2.1a: CliProvider shape includes createSession/loadSession/sendMessage/cancelTurn/killSession/isAlive/onEvent", async () => {
		const { provider, emit } = createProviderDouble();

		expect(provider.cliType).toBe("claude-code");
		expect(typeof provider.createSession).toBe("function");
		expect(typeof provider.loadSession).toBe("function");
		expect(typeof provider.sendMessage).toBe("function");
		expect(typeof provider.cancelTurn).toBe("function");
		expect(typeof provider.killSession).toBe("function");
		expect(typeof provider.isAlive).toBe("function");
		expect(typeof provider.onEvent).toBe("function");

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

		let delivered = 0;
		provider.onEvent(RESPONSE_START_FIXTURE.sessionId, () => {
			delivered += 1;
		});
		emit(RESPONSE_START_FIXTURE);
		expect(delivered).toBe(1);
	});

	it.todo(
		"TC-2.1b: Claude provider conformance placeholder (TC-2.1b activates in Story 4 when Claude provider exists)",
	);

	it.todo(
		"TC-2.1c: Codex provider conformance placeholder (TC-2.1c activates in Story 5 when Codex provider exists)",
	);
});
