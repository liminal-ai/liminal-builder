import { describe, expect, it } from "vitest";
import { InMemoryProviderRegistry } from "../../../server/providers/provider-registry";
import type {
	CliProvider,
	CreateSessionOptions,
	LoadSessionOptions,
	SendMessageResult,
} from "../../../server/providers/provider-types";
import type { StreamEventEnvelope } from "../../../server/streaming";

function createProviderDouble(cliType: "claude-code" | "codex"): CliProvider {
	return {
		cliType,
		createSession: async (_options: CreateSessionOptions) => ({
			sessionId: `${cliType}:session-1`,
			cliType,
		}),
		loadSession: async (_sessionId: string, _options?: LoadSessionOptions) => ({
			sessionId: `${cliType}:session-1`,
			cliType,
		}),
		sendMessage: async (
			_sessionId: string,
			_message: string,
		): Promise<SendMessageResult> => ({ turnId: `${cliType}:turn-1` }),
		cancelTurn: async (_sessionId: string) => undefined,
		killSession: async (_sessionId: string) => undefined,
		isAlive: (_sessionId: string) => true,
		onEvent: (
			_sessionId: string,
			_callback: (event: StreamEventEnvelope) => void,
		) => undefined,
	};
}

describe("ProviderRegistry (Story 3, Red)", () => {
	it("TC-2.2a: registry resolves claude-code", () => {
		const registry = new InMemoryProviderRegistry();
		const claudeProvider = createProviderDouble("claude-code");

		registry.register(claudeProvider);
		const resolved = registry.resolve("claude-code");

		expect(resolved).toBe(claudeProvider);
	});

	it("TC-2.2b: registry returns unsupported-cli error for unknown type", () => {
		const registry = new InMemoryProviderRegistry();

		try {
			registry.resolve("unknown-cli" as "claude-code" | "codex");
			throw new Error("Expected resolve to throw");
		} catch (error) {
			expect(error).toMatchObject({
				code: "UNSUPPORTED_CLI_TYPE",
			});
		}
	});
});
