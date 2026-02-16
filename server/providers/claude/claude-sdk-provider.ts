import { NotImplementedError } from "../../errors";
import type { StreamEventEnvelope } from "../../streaming/stream-event-schema";
import type {
	CliProvider,
	CreateSessionOptions,
	LoadSessionOptions,
	ProviderSession,
	SendMessageResult,
} from "../provider-types";
import type {
	ClaudeEventNormalizer,
	ClaudeSdkStreamEvent,
} from "./claude-event-normalizer";

export interface ClaudeSdkQueryRequest {
	cwd: string;
	input: AsyncIterable<string>;
	resumeSessionId?: string;
	options?: Record<string, unknown>;
}

export interface ClaudeSdkQueryHandle {
	output: AsyncIterable<ClaudeSdkStreamEvent>;
	interrupt(): Promise<void>;
	close(): Promise<void>;
	isAlive(): boolean;
}

export interface ClaudeSdkAdapter {
	query(request: ClaudeSdkQueryRequest): Promise<ClaudeSdkQueryHandle>;
}

export interface ClaudeSdkProviderDeps {
	sdk: ClaudeSdkAdapter;
	createNormalizer?: () => ClaudeEventNormalizer;
	createSessionId?: () => string;
	createTurnId?: () => string;
}

interface ClaudeProviderSessionState {
	sessionId: string;
	projectDir: string;
	alive: boolean;
	normalizer: ClaudeEventNormalizer;
	activeHandle?: ClaudeSdkQueryHandle;
}

export class ClaudeSdkProvider implements CliProvider {
	readonly cliType = "claude-code" as const;

	private readonly sessions = new Map<string, ClaudeProviderSessionState>();
	private readonly listeners = new Map<
		string,
		Array<(event: StreamEventEnvelope) => void>
	>();
	private readonly deps: ClaudeSdkProviderDeps;

	constructor(deps: ClaudeSdkProviderDeps) {
		this.deps = deps;
	}

	async createSession(
		_options: CreateSessionOptions,
	): Promise<ProviderSession> {
		void this.sessions;
		void this.deps;
		throw new NotImplementedError("ClaudeSdkProvider.createSession");
	}

	async loadSession(
		_sessionId: string,
		_options?: LoadSessionOptions,
	): Promise<ProviderSession> {
		throw new NotImplementedError("ClaudeSdkProvider.loadSession");
	}

	async sendMessage(
		_sessionId: string,
		_message: string,
	): Promise<SendMessageResult> {
		throw new NotImplementedError("ClaudeSdkProvider.sendMessage");
	}

	async cancelTurn(_sessionId: string): Promise<void> {
		throw new NotImplementedError("ClaudeSdkProvider.cancelTurn");
	}

	async killSession(_sessionId: string): Promise<void> {
		throw new NotImplementedError("ClaudeSdkProvider.killSession");
	}

	isAlive(sessionId: string): boolean {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return false;
		}
		if (!session.activeHandle) {
			return session.alive;
		}
		return session.activeHandle.isAlive();
	}

	onEvent(
		sessionId: string,
		callback: (event: StreamEventEnvelope) => void,
	): void {
		const callbacks = this.listeners.get(sessionId) ?? [];
		callbacks.push(callback);
		this.listeners.set(sessionId, callbacks);
	}
}
