import type { CliType } from "@server/sessions/session-types";
import type { StreamEventEnvelope } from "@server/streaming/stream-event-schema";

// Re-export CliType for provider-layer consumers (source of truth: session-types)
export type { CliType } from "@server/sessions/session-types";

export interface CreateSessionOptions {
	projectDir: string;
	providerOptions?: Record<string, unknown>;
}

export interface LoadSessionOptions {
	viewFilePath?: string;
}

export interface ProviderSession {
	sessionId: string;
	cliType: CliType;
}

export interface SendMessageResult {
	/** Canonical turn identifier; all stream events for this turn must use this value */
	turnId: string;
}

export interface CliProvider {
	readonly cliType: CliType;
	createSession(options: CreateSessionOptions): Promise<ProviderSession>;
	loadSession(
		sessionId: string,
		options?: LoadSessionOptions,
	): Promise<ProviderSession>;
	sendMessage(sessionId: string, message: string): Promise<SendMessageResult>;
	cancelTurn(sessionId: string): Promise<void>;
	killSession(sessionId: string): Promise<void>;
	isAlive(sessionId: string): boolean;
	onEvent(
		sessionId: string,
		callback: (event: StreamEventEnvelope) => void,
	): void;
}

export interface ProviderRegistry {
	register(provider: CliProvider): void;
	resolve(cliType: CliType): CliProvider;
}
