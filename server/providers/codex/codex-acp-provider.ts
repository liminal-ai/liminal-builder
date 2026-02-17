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
	activeTurnTerminal: boolean;
	activeMessage?: {
		itemId: string;
		content: string;
		sourceTimestamp: string;
	};
	toolCallsByCallId: Map<
		string,
		{
			itemId: string;
			callId: string;
			toolName: string;
			toolArguments: Record<string, unknown>;
		}
	>;
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
			activeTurnTerminal: false,
			toolCallsByCallId: new Map(),
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
			session.activeTurnTerminal = false;
			this.emitTurn(session.sessionId, {
				type: "turn_started",
				turnId: activePending.turnId,
				sessionId: session.sessionId,
				modelId: "codex",
				providerId: this.cliType,
			});
		}
		if (session.activeTurnTerminal) {
			return;
		}

		switch (event.type) {
			case "agent_message_chunk": {
				this.handleAgentMessageChunk(session, event);
				return;
			}
			case "tool_call": {
				this.handleToolCall(session, event);
				return;
			}
			case "tool_call_update": {
				this.handleToolCallUpdate(session, event);
				return;
			}
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
			this.emitActiveTurnError(
				session,
				pendingTurn.turnId,
				promptError.code,
				promptError.message,
			);
		} finally {
			this.removePendingTurn(session, pendingTurn);
			if (session.activeTurnId === pendingTurn.turnId) {
				this.resetTurnState(session);
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
			this.emitActiveTurnError(
				session,
				pendingTurn.turnId,
				protocolError.code,
				protocolError.message,
			);
			return;
		}

		if (this.isTurnTerminal(session, pendingTurn.turnId)) {
			return;
		}

		if (result.stopReason === "cancelled") {
			this.emitActiveTurnComplete(session, pendingTurn.turnId, "cancelled");
			return;
		}

		if (
			result.stopReason === "end_turn" ||
			result.stopReason === "max_tokens" ||
			result.stopReason === "max_turn_requests"
		) {
			this.emitActiveTurnComplete(session, pendingTurn.turnId, "completed");
			return;
		}

		this.emitActiveTurnError(
			session,
			pendingTurn.turnId,
			"PROTOCOL_ERROR",
			`Unsupported stop reason: ${result.stopReason}`,
		);
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
			this.emitActiveTurnError(
				session,
				session.activeTurnId,
				crashError.code,
				crashError.message,
			);
		}
		this.resetTurnState(session);
	}

	private handleAgentMessageChunk(
		session: CodexSessionState,
		event: AcpUpdateEvent,
	): void {
		const turnId = session.activeTurnId;
		if (!turnId) {
			return;
		}

		const eventRecord = event as Record<string, unknown>;
		const textChunk = this.extractTextContent(eventRecord.content);
		if (textChunk.length === 0) {
			return;
		}

		const sourceTimestamp = this.now();
		if (!session.activeMessage) {
			const itemId = `${turnId}:1:0`;
			session.activeMessage = {
				itemId,
				content: textChunk,
				sourceTimestamp,
			};
			this.emitUpsert(session.sessionId, {
				type: "message",
				status: "create",
				turnId,
				sessionId: session.sessionId,
				itemId,
				sourceTimestamp,
				emittedAt: this.now(),
				content: session.activeMessage.content,
				origin: "agent",
			});
			return;
		}

		session.activeMessage.content += textChunk;
		session.activeMessage.sourceTimestamp = sourceTimestamp;
		this.emitUpsert(session.sessionId, {
			type: "message",
			status: "update",
			turnId,
			sessionId: session.sessionId,
			itemId: session.activeMessage.itemId,
			sourceTimestamp,
			emittedAt: this.now(),
			content: session.activeMessage.content,
			origin: "agent",
		});
	}

	private handleToolCall(
		session: CodexSessionState,
		event: AcpUpdateEvent,
	): void {
		const turnId = session.activeTurnId;
		if (!turnId) {
			return;
		}

		const callId = this.extractToolCallId(event);
		if (!callId) {
			this.emitActiveTurnError(
				session,
				turnId,
				"INVALID_STREAM_EVENT",
				"tool_call missing callId",
			);
			return;
		}

		const eventRecord = event as Record<string, unknown>;
		const sourceTimestamp = this.now();
		const existing = session.toolCallsByCallId.get(callId);
		const toolArguments = this.parseToolArguments(eventRecord.content);
		const upsert = {
			turnId,
			sessionId: session.sessionId,
			itemId: existing?.itemId ?? `${turnId}:1:tool:${callId}`,
			sourceTimestamp,
			emittedAt: this.now(),
			toolName:
				this.extractToolName(event) ?? existing?.toolName ?? "unknown_tool",
			toolArguments:
				Object.keys(toolArguments).length > 0
					? toolArguments
					: (existing?.toolArguments ?? {}),
			callId,
		};
		session.toolCallsByCallId.set(callId, {
			itemId: upsert.itemId,
			callId,
			toolName: upsert.toolName,
			toolArguments: upsert.toolArguments,
		});
		this.emitUpsert(session.sessionId, {
			type: "tool_call",
			status: "create",
			...upsert,
		});
	}

	private handleToolCallUpdate(
		session: CodexSessionState,
		event: AcpUpdateEvent,
	): void {
		const turnId = session.activeTurnId;
		if (!turnId) {
			return;
		}

		const eventRecord = event as Record<string, unknown>;
		const status = this.mapToolCallUpdateStatus(eventRecord.status);
		if (!status) {
			return;
		}

		const callId = this.extractToolCallId(event);
		if (!callId) {
			this.emitActiveTurnError(
				session,
				turnId,
				"INVALID_STREAM_EVENT",
				"tool_call_update missing callId",
			);
			return;
		}

		const sourceTimestamp = this.now();
		const existing = session.toolCallsByCallId.get(callId);
		const content = this.extractTextContent(eventRecord.content);
		const toolArguments = existing?.toolArguments ?? {};
		const upsert = {
			turnId,
			sessionId: session.sessionId,
			itemId: existing?.itemId ?? `${turnId}:1:tool:${callId}`,
			sourceTimestamp,
			emittedAt: this.now(),
			toolName:
				existing?.toolName ?? this.extractToolName(event) ?? "unknown_tool",
			toolArguments,
			callId,
		};

		this.emitUpsert(session.sessionId, {
			type: "tool_call",
			status,
			...upsert,
			...(content.length > 0 ? { toolOutput: content } : {}),
			...(status === "error" ? { toolOutputIsError: true } : {}),
			...(status === "error"
				? {
						errorCode: "PROCESS_CRASH",
						errorMessage:
							content.length > 0
								? content
								: `Codex tool call ${callId} reported failure`,
					}
				: {}),
		});
		session.toolCallsByCallId.delete(callId);
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

	private emitUpsert(sessionId: string, upsert: UpsertObject): void {
		for (const callback of this.upsertListeners.get(sessionId) ?? []) {
			callback(upsert);
		}
	}

	private isTurnTerminal(session: CodexSessionState, turnId: string): boolean {
		return session.activeTurnId === turnId && session.activeTurnTerminal;
	}

	private emitActiveTurnComplete(
		session: CodexSessionState,
		turnId: string,
		status: "completed" | "cancelled",
	): void {
		if (this.isTurnTerminal(session, turnId)) {
			return;
		}
		this.emitTerminalMessage(session, turnId, "complete");
		this.emitTurn(session.sessionId, {
			type: "turn_complete",
			turnId,
			sessionId: session.sessionId,
			status,
		});
		if (session.activeTurnId === turnId) {
			session.activeTurnTerminal = true;
		}
	}

	private emitActiveTurnError(
		session: CodexSessionState,
		turnId: string,
		errorCode: string,
		errorMessage: string,
	): void {
		if (this.isTurnTerminal(session, turnId)) {
			return;
		}
		this.emitTerminalMessage(session, turnId, "error", errorCode, errorMessage);
		this.emitTurn(session.sessionId, {
			type: "turn_error",
			turnId,
			sessionId: session.sessionId,
			errorCode,
			errorMessage,
		});
		if (session.activeTurnId === turnId) {
			session.activeTurnTerminal = true;
		}
	}

	private emitTerminalMessage(
		session: CodexSessionState,
		turnId: string,
		status: "complete" | "error",
		errorCode?: string,
		errorMessage?: string,
	): void {
		const activeMessage = session.activeMessage;
		if (!activeMessage) {
			return;
		}

		this.emitUpsert(session.sessionId, {
			type: "message",
			status,
			turnId,
			sessionId: session.sessionId,
			itemId: activeMessage.itemId,
			sourceTimestamp: this.now(),
			emittedAt: this.now(),
			content: activeMessage.content,
			origin: "agent",
			...(status === "error" ? { errorCode, errorMessage } : {}),
		});
		session.activeMessage = undefined;
	}

	private extractTextContent(content: unknown): string {
		if (!Array.isArray(content)) {
			return "";
		}

		return content
			.filter(
				(candidate): candidate is { type: "text"; text: string } =>
					typeof candidate === "object" &&
					candidate !== null &&
					(candidate as { type?: unknown }).type === "text" &&
					typeof (candidate as { text?: unknown }).text === "string",
			)
			.map((candidate) => candidate.text)
			.join("");
	}

	private parseToolArguments(content: unknown): Record<string, unknown> {
		const raw = this.extractTextContent(content);
		if (raw.trim().length === 0) {
			return {};
		}

		try {
			const parsed: unknown = JSON.parse(raw);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
			return {};
		} catch {
			return {};
		}
	}

	private extractToolCallId(event: AcpUpdateEvent): string | undefined {
		const candidate = event as Record<string, unknown>;
		if (typeof candidate.toolCallId === "string") {
			return candidate.toolCallId;
		}
		if (typeof candidate.callId === "string") {
			return candidate.callId;
		}
		if (typeof candidate.tool_call_id === "string") {
			return candidate.tool_call_id;
		}
		return undefined;
	}

	private extractToolName(event: AcpUpdateEvent): string | undefined {
		const candidate = event as Record<string, unknown>;
		if (typeof candidate.title === "string" && candidate.title.length > 0) {
			return candidate.title;
		}
		if (
			typeof candidate.toolName === "string" &&
			candidate.toolName.length > 0
		) {
			return candidate.toolName;
		}
		return undefined;
	}

	private mapToolCallUpdateStatus(
		status: unknown,
	): "complete" | "error" | null {
		if (status === "completed" || status === "complete") {
			return "complete";
		}
		if (status === "failed" || status === "error") {
			return "error";
		}
		return null;
	}

	private resetTurnState(session: CodexSessionState): void {
		session.activeTurnId = undefined;
		session.activeTurnTerminal = false;
		session.activeMessage = undefined;
		session.toolCallsByCallId.clear();
	}

	private now(): string {
		return this.deps.now?.() ?? new Date().toISOString();
	}

	private createTurnId(): string {
		return this.deps.createTurnId?.() ?? randomUUID();
	}
}
