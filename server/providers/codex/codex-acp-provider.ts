import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import type { AcpPromptResult, AcpUpdateEvent } from "../../acp/acp-types";
import type { AcpClient } from "../../acp/acp-client";
import type { TurnEvent, UpsertObject } from "../../streaming/upsert-types";
import { ProviderError } from "../provider-errors";
import type {
	CliProvider,
	CreateSessionOptions,
	LoadSessionOptions,
	ProviderSession,
	SendMessageResult,
} from "../provider-types";

export type CodexAcpClient = Pick<
	AcpClient,
	| "sessionNew"
	| "sessionLoad"
	| "sessionPrompt"
	| "sessionCancel"
	| "close"
	| "onSessionUpdate"
	| "onError"
>;

export interface CodexAcpProviderDeps {
	createClient: (
		projectDir: string,
	) => Promise<CodexAcpClient> | CodexAcpClient;
	createTurnId?: () => string;
	now?: () => string;
}

interface PendingTurn {
	turnId: string;
	startedPromise: Promise<void>;
	resolveStarted: () => void;
	rejectStarted: (error: ProviderError) => void;
	startedSettled: boolean;
}

interface CodexSessionState {
	sessionId: string;
	projectDir: string;
	client: CodexAcpClient;
	alive: boolean;
	pendingTurns: PendingTurn[];
	activeTurnId?: string;
	unsubscribeUpdates?: () => void;
}

export class CodexAcpProvider implements CliProvider {
	readonly cliType = "codex" as const;

	private readonly sessions = new Map<string, CodexSessionState>();
	private readonly upsertListeners = new Map<
		string,
		Array<(upsert: UpsertObject) => void>
	>();
	private readonly turnListeners = new Map<
		string,
		Array<(event: TurnEvent) => void>
	>();
	private readonly clientErrorHandlersBound = new WeakSet<CodexAcpClient>();
	private readonly deps: CodexAcpProviderDeps;

	constructor(deps: CodexAcpProviderDeps) {
		this.deps = deps;
	}

	async createSession(options: CreateSessionOptions): Promise<ProviderSession> {
		let client: CodexAcpClient;
		try {
			client = await this.deps.createClient(options.projectDir);
		} catch (error) {
			throw new ProviderError(
				"SESSION_CREATE_FAILED",
				"Failed to create Codex ACP client",
				error,
			);
		}

		let created: { sessionId: string };
		try {
			created = await client.sessionNew({ cwd: options.projectDir });
		} catch (error) {
			throw new ProviderError(
				"SESSION_CREATE_FAILED",
				"Failed to create Codex ACP session",
				error,
			);
		}

		const session = this.buildSessionState({
			sessionId: created.sessionId,
			projectDir: options.projectDir,
			client,
		});
		this.sessions.set(session.sessionId, session);
		this.bindOutputConsumer(session);

		return {
			sessionId: session.sessionId,
			cliType: this.cliType,
		};
	}

	async loadSession(
		sessionId: string,
		options?: LoadSessionOptions,
	): Promise<ProviderSession> {
		const existing = this.sessions.get(sessionId);
		if (existing) {
			return {
				sessionId: existing.sessionId,
				cliType: this.cliType,
			};
		}

		const projectDir = options?.viewFilePath
			? dirname(options.viewFilePath)
			: process.cwd();

		let client: CodexAcpClient;
		try {
			client = await this.deps.createClient(projectDir);
		} catch (error) {
			throw new ProviderError(
				"SESSION_CREATE_FAILED",
				`Failed to create Codex ACP client for load ${sessionId}`,
				error,
			);
		}

		try {
			await client.sessionLoad(sessionId, projectDir);
		} catch (error) {
			throw new ProviderError(
				"SESSION_CREATE_FAILED",
				`Failed to load Codex ACP session ${sessionId}`,
				error,
			);
		}

		const session = this.buildSessionState({
			sessionId,
			projectDir,
			client,
		});
		this.sessions.set(session.sessionId, session);
		this.bindOutputConsumer(session);

		return {
			sessionId: session.sessionId,
			cliType: this.cliType,
		};
	}

	async sendMessage(
		sessionId: string,
		message: string,
	): Promise<SendMessageResult> {
		const session = this.requireSession(sessionId);
		if (!session.alive) {
			throw new ProviderError(
				"PROCESS_CRASH",
				`Codex session ${sessionId} is not alive`,
			);
		}

		const pendingTurn = this.createPendingTurn(this.createTurnId());
		session.pendingTurns.push(pendingTurn);
		void this.runPrompt(session, pendingTurn, message);

		try {
			await pendingTurn.startedPromise;
		} catch (error) {
			if (error instanceof ProviderError) {
				throw error;
			}
			throw new ProviderError(
				"PROCESS_CRASH",
				`Failed waiting for Codex turn start in session ${sessionId}`,
				error,
			);
		}

		return { turnId: pendingTurn.turnId };
	}

	async cancelTurn(sessionId: string): Promise<void> {
		const session = this.requireSession(sessionId);
		try {
			session.client.sessionCancel(session.sessionId);
		} catch (error) {
			throw new ProviderError(
				"INTERRUPT_FAILED",
				`Failed to cancel Codex turn for session ${sessionId}`,
				error,
			);
		}
	}

	async killSession(sessionId: string): Promise<void> {
		const session = this.requireSession(sessionId);
		session.alive = false;
		session.unsubscribeUpdates?.();
		this.upsertListeners.delete(sessionId);
		this.turnListeners.delete(sessionId);
		this.rejectAllPendingTurns(
			session,
			new ProviderError(
				"PROCESS_CRASH",
				`Codex session ${sessionId} killed before turn start`,
			),
		);
		this.sessions.delete(sessionId);
		if (this.hasLiveSessionsForClient(session.client)) {
			return;
		}

		try {
			await session.client.close(2500);
		} catch {
			// Best-effort shutdown.
		}
	}

	isAlive(sessionId: string): boolean {
		return this.sessions.get(sessionId)?.alive ?? false;
	}

	onUpsert(sessionId: string, callback: (upsert: UpsertObject) => void): void {
		const callbacks = this.upsertListeners.get(sessionId) ?? [];
		callbacks.push(callback);
		this.upsertListeners.set(sessionId, callbacks);
	}

	onTurn(sessionId: string, callback: (event: TurnEvent) => void): void {
		const callbacks = this.turnListeners.get(sessionId) ?? [];
		callbacks.push(callback);
		this.turnListeners.set(sessionId, callbacks);
	}

	private buildSessionState(args: {
		sessionId: string;
		projectDir: string;
		client: CodexAcpClient;
	}): CodexSessionState {
		return {
			sessionId: args.sessionId,
			projectDir: args.projectDir,
			client: args.client,
			alive: true,
			pendingTurns: [],
		};
	}

	private bindOutputConsumer(session: CodexSessionState): void {
		session.unsubscribeUpdates = session.client.onSessionUpdate(
			session.sessionId,
			(event) => {
				this.handleSessionUpdate(session, event);
			},
		);
		this.bindClientErrorHandler(session.client);
	}

	private bindClientErrorHandler(client: CodexAcpClient): void {
		if (this.clientErrorHandlersBound.has(client)) {
			return;
		}
		this.clientErrorHandlersBound.add(client);
		client.onError((error) => {
			for (const session of this.sessions.values()) {
				if (session.client !== client) {
					continue;
				}
				this.handleSessionError(session, error);
			}
		});
	}

	private handleSessionUpdate(
		session: CodexSessionState,
		event: AcpUpdateEvent,
	): void {
		const activePending = session.pendingTurns[0];
		if (activePending && !activePending.startedSettled) {
			activePending.startedSettled = true;
			activePending.resolveStarted();
			session.activeTurnId = activePending.turnId;
			this.emitTurn(session.sessionId, {
				type: "turn_started",
				turnId: activePending.turnId,
				sessionId: session.sessionId,
				modelId: "codex",
				providerId: this.cliType,
			});
		}

		switch (event.type) {
			case "agent_message_chunk":
			case "tool_call":
			case "tool_call_update":
				// Story 5 red skeleton intentionally defers direct-output translation.
				return;
			default:
				return;
		}
	}

	private async runPrompt(
		session: CodexSessionState,
		pendingTurn: PendingTurn,
		message: string,
	): Promise<void> {
		try {
			const result = await session.client.sessionPrompt(
				session.sessionId,
				message,
			);
			this.handlePromptResult(session, pendingTurn, result);
		} catch (error) {
			const errorMessage = this.withCauseMessage(
				`Codex prompt failed for session ${session.sessionId}`,
				error,
			);
			const promptError = new ProviderError(
				"PROCESS_CRASH",
				errorMessage,
				error,
			);
			this.rejectPendingTurn(pendingTurn, promptError);
			this.emitTurn(session.sessionId, {
				type: "turn_error",
				turnId: pendingTurn.turnId,
				sessionId: session.sessionId,
				errorCode: promptError.code,
				errorMessage: promptError.message,
			});
		} finally {
			this.removePendingTurn(session, pendingTurn);
			if (session.activeTurnId === pendingTurn.turnId) {
				session.activeTurnId = undefined;
			}
		}
	}

	private handlePromptResult(
		session: CodexSessionState,
		pendingTurn: PendingTurn,
		result: AcpPromptResult,
	): void {
		if (!pendingTurn.startedSettled) {
			const protocolError = new ProviderError(
				"PROTOCOL_ERROR",
				`Prompt completed before turn start in session ${session.sessionId}`,
			);
			this.rejectPendingTurn(pendingTurn, protocolError);
			this.emitTurn(session.sessionId, {
				type: "turn_error",
				turnId: pendingTurn.turnId,
				sessionId: session.sessionId,
				errorCode: protocolError.code,
				errorMessage: protocolError.message,
			});
			return;
		}

		if (result.stopReason === "cancelled") {
			this.emitTurn(session.sessionId, {
				type: "turn_complete",
				turnId: pendingTurn.turnId,
				sessionId: session.sessionId,
				status: "cancelled",
			});
			return;
		}

		if (
			result.stopReason === "end_turn" ||
			result.stopReason === "max_tokens" ||
			result.stopReason === "max_turn_requests"
		) {
			this.emitTurn(session.sessionId, {
				type: "turn_complete",
				turnId: pendingTurn.turnId,
				sessionId: session.sessionId,
				status: "completed",
			});
			return;
		}

		this.emitTurn(session.sessionId, {
			type: "turn_error",
			turnId: pendingTurn.turnId,
			sessionId: session.sessionId,
			errorCode: "PROTOCOL_ERROR",
			errorMessage: `Unsupported stop reason: ${result.stopReason}`,
		});
	}

	private handleSessionError(session: CodexSessionState, error: Error): void {
		if (!session.alive) {
			return;
		}
		session.alive = false;
		session.unsubscribeUpdates?.();
		const errorMessage = this.withCauseMessage(
			`Codex ACP stream crashed for session ${session.sessionId}`,
			error,
		);
		const crashError = new ProviderError("PROCESS_CRASH", errorMessage, error);
		this.rejectAllPendingTurns(session, crashError);
		if (session.activeTurnId) {
			this.emitTurn(session.sessionId, {
				type: "turn_error",
				turnId: session.activeTurnId,
				sessionId: session.sessionId,
				errorCode: crashError.code,
				errorMessage: crashError.message,
			});
			session.activeTurnId = undefined;
		}
	}

	private rejectAllPendingTurns(
		session: CodexSessionState,
		error: ProviderError,
	): void {
		for (const pending of session.pendingTurns) {
			this.rejectPendingTurn(pending, error);
		}
		session.pendingTurns = [];
	}

	private createPendingTurn(turnId: string): PendingTurn {
		let resolveStarted: (() => void) | undefined;
		let rejectStarted: ((error: ProviderError) => void) | undefined;
		const startedPromise = new Promise<void>((resolve, reject) => {
			resolveStarted = resolve;
			rejectStarted = (error: ProviderError) => reject(error);
		});

		if (!resolveStarted || !rejectStarted) {
			throw new ProviderError(
				"PROCESS_CRASH",
				"Failed to initialize pending turn state",
			);
		}

		return {
			turnId,
			startedPromise,
			resolveStarted,
			rejectStarted,
			startedSettled: false,
		};
	}

	private rejectPendingTurn(
		pendingTurn: PendingTurn,
		error: ProviderError,
	): void {
		if (pendingTurn.startedSettled) {
			return;
		}
		pendingTurn.startedSettled = true;
		pendingTurn.rejectStarted(error);
	}

	private removePendingTurn(
		session: CodexSessionState,
		pendingTurn: PendingTurn,
	): void {
		session.pendingTurns = session.pendingTurns.filter(
			(candidate) => candidate !== pendingTurn,
		);
	}

	private hasLiveSessionsForClient(client: CodexAcpClient): boolean {
		for (const session of this.sessions.values()) {
			if (session.client === client && session.alive) {
				return true;
			}
		}
		return false;
	}

	private withCauseMessage(message: string, cause: unknown): string {
		if (!(cause instanceof Error)) {
			return message;
		}
		if (!cause.message || cause.message.trim().length === 0) {
			return message;
		}
		return `${message}: ${cause.message}`;
	}

	private requireSession(sessionId: string): CodexSessionState {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new ProviderError(
				"SESSION_NOT_FOUND",
				`Codex session ${sessionId} not found`,
			);
		}
		return session;
	}

	private emitTurn(sessionId: string, event: TurnEvent): void {
		for (const callback of this.turnListeners.get(sessionId) ?? []) {
			callback(event);
		}
	}

	private createTurnId(): string {
		return this.deps.createTurnId?.() ?? randomUUID();
	}
}
