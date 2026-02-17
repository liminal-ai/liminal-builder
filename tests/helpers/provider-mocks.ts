import { vi } from "vitest";
import type {
	CliProvider,
	CreateSessionOptions,
	LoadSessionOptions,
	ProviderSession,
	SendMessageResult,
} from "@server/providers";
import type { CliType } from "@server/sessions/session-types";
import type { TurnEvent, UpsertObject } from "@server/streaming";

/**
 * Creates a fully typed mock CliProvider with vi.fn() stubs.
 * Typed as CliProvider so compile-time checks catch mock shape drift.
 */
export function createMockProvider(
	cliType: CliType = "claude-code",
): CliProvider & {
	createSession: ReturnType<
		typeof vi.fn<(options: CreateSessionOptions) => Promise<ProviderSession>>
	>;
	loadSession: ReturnType<
		typeof vi.fn<
			(
				sessionId: string,
				options?: LoadSessionOptions,
			) => Promise<ProviderSession>
		>
	>;
	sendMessage: ReturnType<
		typeof vi.fn<
			(sessionId: string, message: string) => Promise<SendMessageResult>
		>
	>;
	cancelTurn: ReturnType<typeof vi.fn<(sessionId: string) => Promise<void>>>;
	killSession: ReturnType<typeof vi.fn<(sessionId: string) => Promise<void>>>;
	isAlive: ReturnType<typeof vi.fn<(sessionId: string) => boolean>>;
	onUpsert: ReturnType<
		typeof vi.fn<
			(sessionId: string, callback: (upsert: UpsertObject) => void) => void
		>
	>;
	onTurn: ReturnType<
		typeof vi.fn<
			(sessionId: string, callback: (event: TurnEvent) => void) => void
		>
	>;
} {
	return {
		cliType,
		createSession: vi.fn<
			(options: CreateSessionOptions) => Promise<ProviderSession>
		>(() =>
			Promise.resolve({
				sessionId: `${cliType}:mock-session-001`,
				cliType,
			}),
		),
		loadSession: vi.fn<
			(
				sessionId: string,
				options?: LoadSessionOptions,
			) => Promise<ProviderSession>
		>(() =>
			Promise.resolve({
				sessionId: `${cliType}:mock-session-001`,
				cliType,
			}),
		),
		sendMessage: vi.fn<
			(sessionId: string, message: string) => Promise<SendMessageResult>
		>(() => Promise.resolve({ turnId: "mock-turn-001" })),
		cancelTurn: vi.fn<(sessionId: string) => Promise<void>>(() =>
			Promise.resolve(),
		),
		killSession: vi.fn<(sessionId: string) => Promise<void>>(() =>
			Promise.resolve(),
		),
		isAlive: vi.fn<(sessionId: string) => boolean>(() => true),
		onUpsert:
			vi.fn<
				(sessionId: string, callback: (upsert: UpsertObject) => void) => void
			>(),
		onTurn:
			vi.fn<
				(sessionId: string, callback: (event: TurnEvent) => void) => void
			>(),
	};
}
