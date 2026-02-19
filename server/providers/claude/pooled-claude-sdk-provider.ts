import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { ProviderError } from "../provider-errors";
import type { UpsertObject, TurnEvent } from "../../streaming/upsert-types";
import type {
	CliProvider,
	CreateSessionOptions,
	LoadSessionOptions,
	ProviderSession,
	SendMessageResult,
} from "../provider-types";

export interface ClaudeMessageStartEvent {
	type: "message_start";
	message: {
		id: string;
		model: string;
	};
}

export interface ClaudeMessageDeltaEvent {
	type: "message_delta";
	delta: {
		stopReason?: string;
		usage?: {
			inputTokens: number;
			outputTokens: number;
			cacheReadInputTokens?: number;
			cacheCreationInputTokens?: number;
		};
	};
}

export interface ClaudeMessageStopEvent {
	type: "message_stop";
}

export interface ClaudeContentBlockStartEvent {
	type: "content_block_start";
	index: number;
	contentBlock:
		| {
				type: "text";
				text: string;
		  }
		| {
				type: "thinking";
				thinking: string;
		  }
		| {
				type: "tool_use";
				id: string;
				name: string;
				input: Record<string, unknown>;
		  };
}

export interface ClaudeContentBlockDeltaEvent {
	type: "content_block_delta";
	index: number;
	delta:
		| {
				type: "text_delta";
				text: string;
		  }
		| {
				type: "thinking_delta";
				thinking: string;
		  }
		| {
				type: "input_json_delta";
				partialJson: string;
		  };
}

export interface ClaudeContentBlockStopEvent {
	type: "content_block_stop";
	index: number;
}

export interface ClaudeUserToolResultEvent {
	type: "user_tool_result";
	toolUseId: string;
	content: string;
	isError: boolean;
}

export type ClaudeSdkStreamEvent =
	| ClaudeMessageStartEvent
	| ClaudeMessageDeltaEvent
	| ClaudeMessageStopEvent
	| ClaudeContentBlockStartEvent
	| ClaudeContentBlockDeltaEvent
	| ClaudeContentBlockStopEvent
	| ClaudeUserToolResultEvent;

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
	createSessionId?: () => string;
	createTurnId?: () => string;
	now?: () => string;
}

interface InputQueueHandle {
	input: AsyncIterable<string>;
	push: (message: string) => void;
	close: () => void;
}

interface PendingTurn {
	turnId: string;
	sessionId: string;
	startedPromise: Promise<void>;
	resolveStarted: () => void;
	rejectStarted: (error: ProviderError) => void;
	startedSettled: boolean;
	completionPromise: Promise<void>;
	resolveCompletion: () => void;
	rejectCompletion: (error: ProviderError) => void;
	completionSettled: boolean;
}

interface BufferedTextBlockState {
	kind: "message" | "thinking";
	itemId: string;
	content: string;
	sourceTimestamp: string;
	emittedTokenCount: number;
	batchIndex: number;
	hasEmittedCreate: boolean;
}

interface ToolUseBlockState {
	kind: "tool";
	itemId: string;
	callId: string;
	toolName: string;
	toolArguments: Record<string, unknown>;
	argumentBuffer: string;
	sourceTimestamp: string;
}

type BlockState = BufferedTextBlockState | ToolUseBlockState;

interface ToolInvocationState {
	itemId: string;
	toolName: string;
	toolArguments: Record<string, unknown>;
	callId: string;
}

interface TurnRuntimeState {
	currentTurnId?: string;
	currentModelId?: string;
	messageOrdinal: number;
	blockStates: Map<number, BlockState>;
	isTurnTerminal: boolean;
	stopReason?: string;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		cacheReadInputTokens?: number;
		cacheCreationInputTokens?: number;
	};
}

interface ClaudeProviderSessionState {
	sessionId: string;
	projectDir: string;
	alive: boolean;
	slotIndex: number;
	pendingTurnIds: PendingTurn[];
	activeTurnById: Map<string, PendingTurn>;
	toolByCallId: Map<string, ToolInvocationState>;
	runtime: TurnRuntimeState;
}

interface PoolSlot {
	index: number;
	handle?: ClaudeSdkQueryHandle;
	inputQueue?: InputQueueHandle;
	boundSessionId: string | null;
	lastActiveAt: number;
	projectDir: string;
	alive: boolean;
	outputClosed: boolean;
	outputConsumer?: Promise<void>;
}

export interface PoolConfig {
	poolSize: number;
	warmOnInit: boolean;
	defaultProjectDir: string;
}

const DEFAULT_BATCH_GRADIENT: readonly number[] = [10, 20, 40, 80, 120];
const DEFAULT_POOL_SIZE = 3;

export class PooledClaudeSdkProvider implements CliProvider {
	readonly cliType = "claude-code" as const;

	private readonly sessions = new Map<string, ClaudeProviderSessionState>();
	private readonly sessionBindings = new Map<string, number>();
	private readonly pool: PoolSlot[];
	private readonly upsertListeners = new Map<
		string,
		Array<(upsert: UpsertObject) => void>
	>();
	private readonly turnListeners = new Map<
		string,
		Array<(event: TurnEvent) => void>
	>();
	private readonly deps: ClaudeSdkProviderDeps;
	private readonly poolConfig: PoolConfig;
	private replenishPoolPromise?: Promise<void>;

	constructor(deps: ClaudeSdkProviderDeps, config?: Partial<PoolConfig>) {
		this.deps = deps;
		this.poolConfig = {
			poolSize: config?.poolSize ?? DEFAULT_POOL_SIZE,
			warmOnInit: config?.warmOnInit ?? true,
			defaultProjectDir: config?.defaultProjectDir ?? process.cwd(),
		};
		this.pool = Array.from(
			{ length: this.poolConfig.poolSize },
			(_, index) => ({
				index,
				boundSessionId: null,
				lastActiveAt: Date.now(),
				projectDir: this.poolConfig.defaultProjectDir,
				alive: false,
				outputClosed: true,
			}),
		);

		if (this.poolConfig.warmOnInit) {
			void this.replenishPool();
		}
	}

	async createSession(options: CreateSessionOptions): Promise<ProviderSession> {
		const sessionId = this.createSessionId();
		const slot = await this.acquireSlot(options.projectDir);

		if (
			!slot.handle ||
			!slot.alive ||
			!slot.handle.isAlive() ||
			slot.projectDir !== options.projectDir
		) {
			await this.replaceSlotHandle(slot.index, {
				cwd: options.projectDir,
				options: options.providerOptions,
			});
		}
		this.bindSession(slot.index, sessionId, options.projectDir);

		if (this.poolConfig.warmOnInit) {
			void this.replenishPool();
		}

		return {
			sessionId,
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

		const cwd = options?.viewFilePath
			? dirname(options.viewFilePath)
			: process.cwd();
		const queryOptions = options?.viewFilePath
			? { viewFilePath: options.viewFilePath }
			: undefined;

		const slot = await this.acquireSlot(cwd);
		await this.replaceSlotHandle(slot.index, {
			cwd,
			resumeSessionId: sessionId,
			options: queryOptions,
		});
		this.bindSession(slot.index, sessionId, cwd);

		return {
			sessionId,
			cliType: this.cliType,
		};
	}

	async sendMessage(
		sessionId: string,
		message: string,
	): Promise<SendMessageResult> {
		const session = this.requireSession(sessionId);
		const slot = this.requireSlot(sessionId);
		const inputQueue = slot.inputQueue;
		const handle = slot.handle;
		if (!inputQueue || !handle) {
			throw new ProviderError(
				"PROCESS_CRASH",
				`Session ${sessionId} is not alive; cannot send message`,
			);
		}
		const turnId = this.createTurnId();
		const pendingTurn = this.createPendingTurn(turnId, sessionId);
		session.pendingTurnIds.push(pendingTurn);
		inputQueue.push(message);
		slot.lastActiveAt = Date.now();
		this.ensureOutputConsumer(slot.index);
		if (slot.outputClosed || !slot.handle) {
			const isHandleAlive = slot.handle?.isAlive() ?? false;
			if (!isHandleAlive) {
				this.rejectTurnStarted(
					pendingTurn,
					new ProviderError(
						"PROCESS_CRASH",
						`Session ${sessionId} is not alive; cannot send message`,
					),
				);
				this.rejectTurnCompletion(
					pendingTurn,
					new ProviderError(
						"PROCESS_CRASH",
						`Session ${sessionId} is not alive; cannot send message`,
					),
				);
				session.pendingTurnIds = session.pendingTurnIds.filter(
					(candidate) => candidate !== pendingTurn,
				);
				throw new ProviderError(
					"PROCESS_CRASH",
					`Session ${sessionId} is not alive; cannot send message`,
				);
			}
			this.resolveTurnStarted(pendingTurn);
			this.resolveTurnCompletion(pendingTurn);
			session.pendingTurnIds = session.pendingTurnIds.filter(
				(candidate) => candidate !== pendingTurn,
			);
			return { turnId };
		}

		try {
			await pendingTurn.startedPromise;
		} catch (error) {
			if (error instanceof ProviderError) {
				throw error;
			}
			throw new ProviderError(
				"PROCESS_CRASH",
				`Failed waiting for turn start in session ${sessionId}`,
				error,
			);
		}
		return { turnId };
	}

	async cancelTurn(sessionId: string): Promise<void> {
		const slot = this.requireSlot(sessionId);
		if (!slot.handle) {
			return;
		}

		try {
			await slot.handle.interrupt();
		} catch (error) {
			throw new ProviderError(
				"INTERRUPT_FAILED",
				`Failed to interrupt session ${sessionId}`,
				error,
			);
		}
	}

	async killSession(sessionId: string): Promise<void> {
		const slot = this.requireSlot(sessionId);
		this.detachSession(slot.index, {
			removeListeners: true,
			error: new ProviderError(
				"PROCESS_CRASH",
				`Session ${sessionId} was killed before turn start`,
			),
		});
		slot.lastActiveAt = Date.now();
	}

	isAlive(sessionId: string): boolean {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return false;
		}
		const slot = this.pool[session.slotIndex];
		return session.alive && Boolean(slot?.handle?.isAlive());
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
		slotIndex: number;
	}): ClaudeProviderSessionState {
		return {
			sessionId: args.sessionId,
			projectDir: args.projectDir,
			alive: true,
			slotIndex: args.slotIndex,
			pendingTurnIds: [],
			activeTurnById: new Map<string, PendingTurn>(),
			toolByCallId: new Map<string, ToolInvocationState>(),
			runtime: {
				messageOrdinal: 0,
				blockStates: new Map<number, BlockState>(),
				isTurnTerminal: false,
			},
		};
	}

	private async consumeOutput(
		slotIndex: number,
		handle: ClaudeSdkQueryHandle,
	): Promise<void> {
		const slot = this.pool[slotIndex];
		if (!slot) {
			return;
		}

		if (!handle) {
			return;
		}

		const iterator = handle.output[Symbol.asyncIterator]();
		try {
			while (slot.alive && slot.handle === handle) {
				const next = await iterator.next();
				if (slot.handle !== handle) {
					break;
				}

				const boundSessionId = slot.boundSessionId;
				const session = boundSessionId
					? this.sessions.get(boundSessionId)
					: undefined;

				if (next.done) {
					slot.outputClosed = true;
					if (!handle.isAlive()) {
						const crashError = new ProviderError(
							"PROCESS_CRASH",
							"Claude SDK output stream ended unexpectedly",
						);
						if (
							session?.runtime.currentTurnId &&
							!session.runtime.isTurnTerminal
						) {
							this.emitTurn(session.sessionId, {
								type: "turn_error",
								turnId: session.runtime.currentTurnId,
								sessionId: session.sessionId,
								errorCode: crashError.code,
								errorMessage: crashError.message,
							});
						}
						if (session) {
							session.alive = false;
							this.failPendingTurns(session, crashError);
							this.failActiveTurns(session, crashError);
							this.resetTurnState(session.runtime, true);
							this.sessions.delete(session.sessionId);
							this.sessionBindings.delete(session.sessionId);
						}
						slot.boundSessionId = null;
						slot.alive = false;
						slot.handle = undefined;
						slot.inputQueue?.close();
						slot.inputQueue = undefined;
						break;
					}
					if (session) {
						this.resolvePendingTurns(session);
						this.resolveActiveTurns(session);
					}
					break;
				}

				if (!session) {
					continue;
				}

				slot.lastActiveAt = Date.now();
				const sourceTimestamp = this.now();
				this.handleStreamEvent(session, next.value, sourceTimestamp);
			}
		} catch (error) {
			if (slot.handle !== handle) {
				return;
			}

			const resolvedMessage =
				error instanceof Error ? error.message : String(error);
			const crashError = new ProviderError(
				"PROCESS_CRASH",
				resolvedMessage,
				error,
			);
			const boundSessionId = slot.boundSessionId;
			const session = boundSessionId
				? this.sessions.get(boundSessionId)
				: undefined;
			if (session) {
				this.emitTurn(session.sessionId, {
					type: "turn_error",
					turnId: session.runtime.currentTurnId ?? "unknown-turn",
					sessionId: session.sessionId,
					errorCode: crashError.code,
					errorMessage: crashError.message,
				});
				session.alive = false;
				this.failPendingTurns(session, crashError);
				this.failActiveTurns(session, crashError);
				this.resetTurnState(session.runtime, true);
				this.sessions.delete(session.sessionId);
				this.sessionBindings.delete(session.sessionId);
			}
			slot.boundSessionId = null;
			slot.alive = false;
			slot.handle = undefined;
			slot.inputQueue?.close();
			slot.inputQueue = undefined;
			slot.outputClosed = true;
		} finally {
			if (slot.handle === handle) {
				slot.outputConsumer = undefined;
			}
		}
	}

	private handleStreamEvent(
		session: ClaudeProviderSessionState,
		event: ClaudeSdkStreamEvent,
		sourceTimestamp: string,
	): void {
		if (session.runtime.isTurnTerminal && event.type !== "message_start") {
			return;
		}

		switch (event.type) {
			case "message_start": {
				this.handleMessageStart(session, event);
				return;
			}
			case "content_block_start": {
				this.handleContentBlockStart(session, event, sourceTimestamp);
				return;
			}
			case "content_block_delta": {
				this.handleContentBlockDelta(session, event, sourceTimestamp);
				return;
			}
			case "content_block_stop": {
				this.handleContentBlockStop(session, event, sourceTimestamp);
				return;
			}
			case "user_tool_result": {
				this.handleUserToolResult(session, event, sourceTimestamp);
				return;
			}
			case "message_delta": {
				session.runtime.stopReason = event.delta.stopReason;
				session.runtime.usage = event.delta.usage;
				return;
			}
			case "message_stop": {
				this.handleMessageStop(session);
				return;
			}
			default: {
				return;
			}
		}
	}

	private handleMessageStart(
		session: ClaudeProviderSessionState,
		event: ClaudeMessageStartEvent,
	): void {
		const pendingTurn = session.pendingTurnIds.shift();
		if (!pendingTurn) {
			this.emitTurn(session.sessionId, {
				type: "turn_error",
				turnId: session.runtime.currentTurnId ?? "unknown-turn",
				sessionId: session.sessionId,
				errorCode: "PROTOCOL_ERROR",
				errorMessage: "message_start with no pending turn",
			});
			this.resetTurnState(session.runtime, true);
			return;
		}

		session.runtime.currentTurnId = pendingTurn.turnId;
		session.runtime.currentModelId = event.message.model;
		session.runtime.messageOrdinal = 1;
		session.runtime.blockStates.clear();
		session.runtime.stopReason = undefined;
		session.runtime.usage = undefined;
		session.runtime.isTurnTerminal = false;

		this.emitTurn(session.sessionId, {
			type: "turn_started",
			turnId: pendingTurn.turnId,
			sessionId: session.sessionId,
			modelId: event.message.model,
			providerId: this.cliType,
		});
		session.activeTurnById.set(pendingTurn.turnId, pendingTurn);
		this.resolveTurnStarted(pendingTurn);
	}

	private handleContentBlockStart(
		session: ClaudeProviderSessionState,
		event: ClaudeContentBlockStartEvent,
		sourceTimestamp: string,
	): void {
		const turnId = session.runtime.currentTurnId;
		if (!turnId) {
			return;
		}
		const messageOrdinal = session.runtime.messageOrdinal || 1;
		const itemId = `${turnId}:${messageOrdinal}:${event.index}`;

		if (event.contentBlock.type === "text") {
			session.runtime.blockStates.set(event.index, {
				kind: "message",
				itemId,
				content: event.contentBlock.text,
				sourceTimestamp,
				emittedTokenCount: 0,
				batchIndex: 0,
				hasEmittedCreate: false,
			});
			return;
		}

		if (event.contentBlock.type === "thinking") {
			session.runtime.blockStates.set(event.index, {
				kind: "thinking",
				itemId,
				content: event.contentBlock.thinking,
				sourceTimestamp,
				emittedTokenCount: 0,
				batchIndex: 0,
				hasEmittedCreate: false,
			});
			return;
		}

		const toolState: ToolUseBlockState = {
			kind: "tool",
			itemId,
			callId: event.contentBlock.id,
			toolName: event.contentBlock.name,
			toolArguments: event.contentBlock.input ?? {},
			argumentBuffer: "",
			sourceTimestamp,
		};
		session.runtime.blockStates.set(event.index, toolState);
		session.toolByCallId.set(event.contentBlock.id, {
			itemId,
			toolName: event.contentBlock.name,
			toolArguments: event.contentBlock.input ?? {},
			callId: event.contentBlock.id,
		});

		this.emitUpsert(session.sessionId, {
			type: "tool_call",
			status: "create",
			turnId,
			sessionId: session.sessionId,
			itemId,
			sourceTimestamp,
			emittedAt: this.now(),
			toolName: event.contentBlock.name,
			toolArguments: event.contentBlock.input ?? {},
			callId: event.contentBlock.id,
		});
	}

	private handleContentBlockDelta(
		session: ClaudeProviderSessionState,
		event: ClaudeContentBlockDeltaEvent,
		sourceTimestamp: string,
	): void {
		const turnId = session.runtime.currentTurnId;
		if (!turnId) {
			return;
		}
		const blockState = session.runtime.blockStates.get(event.index);
		if (!blockState) {
			return;
		}

		if (event.delta.type === "input_json_delta") {
			if (blockState.kind === "tool") {
				blockState.argumentBuffer += event.delta.partialJson;
				blockState.sourceTimestamp = sourceTimestamp;
			}
			return;
		}

		if (blockState.kind === "tool") {
			return;
		}

		if (
			(event.delta.type === "text_delta" && blockState.kind !== "message") ||
			(event.delta.type === "thinking_delta" && blockState.kind !== "thinking")
		) {
			return;
		}

		if (event.delta.type === "text_delta") {
			blockState.content += event.delta.text;
		} else {
			blockState.content += event.delta.thinking;
		}
		blockState.sourceTimestamp = sourceTimestamp;

		const tokenCount = this.countBatchTokens(blockState.content);
		const unemittedTokens = tokenCount - blockState.emittedTokenCount;
		if (
			unemittedTokens > this.getCurrentBatchThreshold(blockState.batchIndex)
		) {
			const status = blockState.hasEmittedCreate ? "update" : "create";
			this.emitBufferedUpsert(
				session,
				turnId,
				blockState,
				status,
				sourceTimestamp,
			);
			blockState.hasEmittedCreate = true;
			this.advanceBatchIndex(blockState, unemittedTokens);
			blockState.emittedTokenCount = tokenCount;
		}
	}

	private handleContentBlockStop(
		session: ClaudeProviderSessionState,
		event: ClaudeContentBlockStopEvent,
		sourceTimestamp: string,
	): void {
		const turnId = session.runtime.currentTurnId;
		if (!turnId) {
			return;
		}
		const blockState = session.runtime.blockStates.get(event.index);
		if (!blockState) {
			return;
		}

		if (blockState.kind === "tool") {
			let toolArguments: Record<string, unknown> = blockState.toolArguments;
			if (blockState.argumentBuffer.trim().length > 0) {
				toolArguments = this.parseToolArguments(blockState.argumentBuffer);
			}

			session.toolByCallId.set(blockState.callId, {
				itemId: blockState.itemId,
				toolName: blockState.toolName,
				toolArguments,
				callId: blockState.callId,
			});

			this.emitUpsert(session.sessionId, {
				type: "tool_call",
				status: "complete",
				turnId,
				sessionId: session.sessionId,
				itemId: blockState.itemId,
				sourceTimestamp,
				emittedAt: this.now(),
				toolName: blockState.toolName,
				toolArguments,
				callId: blockState.callId,
			});
			session.runtime.blockStates.delete(event.index);
			return;
		}

		const tokenCount = this.countBatchTokens(blockState.content);
		if (tokenCount > blockState.emittedTokenCount) {
			const status = blockState.hasEmittedCreate ? "update" : "create";
			this.emitBufferedUpsert(
				session,
				turnId,
				blockState,
				status,
				sourceTimestamp,
			);
			blockState.hasEmittedCreate = true;
			this.advanceBatchIndex(
				blockState,
				tokenCount - blockState.emittedTokenCount,
			);
			blockState.emittedTokenCount = tokenCount;
		}

		if (blockState.kind === "message") {
			this.emitUpsert(session.sessionId, {
				type: "message",
				status: "complete",
				turnId,
				sessionId: session.sessionId,
				itemId: blockState.itemId,
				sourceTimestamp,
				emittedAt: this.now(),
				content: blockState.content,
				origin: "agent",
			});
		} else {
			this.emitUpsert(session.sessionId, {
				type: "thinking",
				status: "complete",
				turnId,
				sessionId: session.sessionId,
				itemId: blockState.itemId,
				sourceTimestamp,
				emittedAt: this.now(),
				content: blockState.content,
				providerId: this.cliType,
			});
		}

		session.runtime.blockStates.delete(event.index);
	}

	private handleUserToolResult(
		session: ClaudeProviderSessionState,
		event: ClaudeUserToolResultEvent,
		sourceTimestamp: string,
	): void {
		const turnId = session.runtime.currentTurnId ?? "unknown-turn";
		const messageOrdinal = session.runtime.messageOrdinal || 1;
		const correlated = session.toolByCallId.get(event.toolUseId) ?? {
			itemId: `${turnId}:${messageOrdinal}:tool:${event.toolUseId}`,
			toolName: "unknown_tool",
			toolArguments: {},
			callId: event.toolUseId,
		};

		this.emitUpsert(session.sessionId, {
			type: "tool_call",
			status: "complete",
			turnId,
			sessionId: session.sessionId,
			itemId: correlated.itemId,
			sourceTimestamp,
			emittedAt: this.now(),
			toolName: correlated.toolName,
			toolArguments: correlated.toolArguments,
			callId: correlated.callId,
			toolOutput: event.content,
			toolOutputIsError: event.isError,
		});
		session.toolByCallId.delete(event.toolUseId);
	}

	private handleMessageStop(session: ClaudeProviderSessionState): void {
		if (session.runtime.isTurnTerminal) {
			return;
		}

		const turnId = session.runtime.currentTurnId ?? "unknown-turn";
		if (session.runtime.stopReason === "error") {
			this.emitTurn(session.sessionId, {
				type: "turn_error",
				turnId,
				sessionId: session.sessionId,
				errorCode: "PROCESS_CRASH",
				errorMessage: "Claude SDK reported stopReason=error",
			});
			this.resolveActiveTurn(session, turnId);
			this.resetTurnState(session.runtime, true);
			return;
		}

		if (
			session.runtime.stopReason === "end_turn" ||
			session.runtime.stopReason === "tool_use"
		) {
			this.emitTurn(session.sessionId, {
				type: "turn_complete",
				turnId,
				sessionId: session.sessionId,
				status: "completed",
				usage: session.runtime.usage,
			});
			this.resolveActiveTurn(session, turnId);
			this.resetTurnState(session.runtime, true);
			return;
		}

		this.emitTurn(session.sessionId, {
			type: "turn_complete",
			turnId,
			sessionId: session.sessionId,
			status: "cancelled",
			usage: session.runtime.usage,
		});
		this.resolveActiveTurn(session, turnId);
		this.resetTurnState(session.runtime, true);
	}

	private resetTurnState(runtime: TurnRuntimeState, isTerminal: boolean): void {
		runtime.currentTurnId = undefined;
		runtime.currentModelId = undefined;
		runtime.messageOrdinal = 0;
		runtime.blockStates.clear();
		runtime.stopReason = undefined;
		runtime.usage = undefined;
		runtime.isTurnTerminal = isTerminal;
	}

	private emitBufferedUpsert(
		session: ClaudeProviderSessionState,
		turnId: string,
		blockState: BufferedTextBlockState,
		status: "create" | "update",
		sourceTimestamp: string,
	): void {
		if (blockState.kind === "message") {
			this.emitUpsert(session.sessionId, {
				type: "message",
				status,
				turnId,
				sessionId: session.sessionId,
				itemId: blockState.itemId,
				sourceTimestamp,
				emittedAt: this.now(),
				content: blockState.content,
				origin: "agent",
			});
			return;
		}

		this.emitUpsert(session.sessionId, {
			type: "thinking",
			status,
			turnId,
			sessionId: session.sessionId,
			itemId: blockState.itemId,
			sourceTimestamp,
			emittedAt: this.now(),
			content: blockState.content,
			providerId: this.cliType,
		});
	}

	private parseToolArguments(value: string): Record<string, unknown> {
		try {
			const parsed: unknown = JSON.parse(value);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
			return {};
		} catch {
			return {};
		}
	}

	private getCurrentBatchThreshold(batchIndex: number): number {
		const index = Math.min(batchIndex, DEFAULT_BATCH_GRADIENT.length - 1);
		return DEFAULT_BATCH_GRADIENT[index] ?? Number.POSITIVE_INFINITY;
	}

	private advanceBatchIndex(
		state: BufferedTextBlockState,
		emittedTokens: number,
	): void {
		let remaining = emittedTokens;
		while (remaining > 0) {
			const threshold = this.getCurrentBatchThreshold(state.batchIndex);
			if (!Number.isFinite(threshold) || threshold <= 0) {
				return;
			}
			if (remaining <= threshold) {
				return;
			}
			remaining -= threshold;
			state.batchIndex += 1;
		}
	}

	private countBatchTokens(text: string): number {
		return (text.match(/\S+/g) ?? []).length;
	}

	private createInputGenerator(): InputQueueHandle {
		const queue: string[] = [];
		let closed = false;
		let waitingResolver: ((result: IteratorResult<string>) => void) | undefined;

		const input: AsyncIterable<string> = {
			[Symbol.asyncIterator](): AsyncIterator<string> {
				return {
					next: async (): Promise<IteratorResult<string>> => {
						if (queue.length > 0) {
							const value = queue.shift();
							if (typeof value === "string") {
								return { done: false, value };
							}
						}
						if (closed) {
							return { done: true, value: undefined };
						}
						return await new Promise<IteratorResult<string>>((resolve) => {
							waitingResolver = resolve;
						});
					},
				};
			},
		};

		return {
			input,
			push: (message: string) => {
				if (closed) {
					return;
				}
				if (waitingResolver) {
					const resolve = waitingResolver;
					waitingResolver = undefined;
					resolve({ done: false, value: message });
					return;
				}
				queue.push(message);
			},
			close: () => {
				closed = true;
				if (!waitingResolver) {
					return;
				}
				const resolve = waitingResolver;
				waitingResolver = undefined;
				resolve({ done: true, value: undefined });
			},
		};
	}

	private ensureOutputConsumer(slotIndex: number): void {
		const slot = this.pool[slotIndex];
		if (!slot || slot.outputClosed || slot.outputConsumer || !slot.handle) {
			return;
		}
		slot.outputConsumer = this.consumeOutput(slotIndex, slot.handle);
	}

	private bindSession(
		slotIndex: number,
		sessionId: string,
		projectDir: string,
	): void {
		const slot = this.pool[slotIndex];
		if (!slot) {
			throw new ProviderError(
				"SESSION_CREATE_FAILED",
				"Pool slot was not found",
			);
		}
		const session = this.buildSessionState({
			sessionId,
			projectDir,
			slotIndex,
		});
		slot.boundSessionId = sessionId;
		slot.lastActiveAt = Date.now();
		this.sessions.set(sessionId, session);
		this.sessionBindings.set(sessionId, slotIndex);
		this.ensureOutputConsumer(slotIndex);
	}

	private requireSlot(sessionId: string): PoolSlot {
		const slotIndex = this.sessionBindings.get(sessionId);
		if (slotIndex === undefined) {
			throw new ProviderError(
				"SESSION_NOT_FOUND",
				`Session ${sessionId} was not found`,
			);
		}
		const slot = this.pool[slotIndex];
		if (!slot || slot.boundSessionId !== sessionId) {
			throw new ProviderError(
				"SESSION_NOT_FOUND",
				`Session ${sessionId} was not found`,
			);
		}
		return slot;
	}

	private async acquireSlot(_projectDir: string): Promise<PoolSlot> {
		const idleSlots = this.pool.filter((slot) => slot.boundSessionId === null);
		let selectedSlot: PoolSlot | undefined;
		if (idleSlots.length > 0) {
			selectedSlot = idleSlots.reduce((candidate, slot) =>
				slot.lastActiveAt < candidate.lastActiveAt ? slot : candidate,
			);
		} else {
			selectedSlot = this.pool.reduce((candidate, slot) =>
				slot.lastActiveAt < candidate.lastActiveAt ? slot : candidate,
			);
			this.detachSession(selectedSlot.index, {
				error: new ProviderError(
					"PROCESS_CRASH",
					`Session ${selectedSlot.boundSessionId ?? "unknown"} was evicted from pool`,
				),
			});
		}

		if (!selectedSlot) {
			throw new ProviderError(
				"SESSION_CREATE_FAILED",
				"Failed to acquire pooled Claude SDK slot",
			);
		}

		if (selectedSlot.handle && !selectedSlot.handle.isAlive()) {
			await this.closeSlotHandle(selectedSlot.index);
		}

		return selectedSlot;
	}

	private detachSession(
		slotIndex: number,
		options?: {
			error?: ProviderError;
			removeListeners?: boolean;
		},
	): void {
		const slot = this.pool[slotIndex];
		if (!slot) {
			return;
		}
		const sessionId = slot.boundSessionId;
		if (!sessionId) {
			return;
		}

		const session = this.sessions.get(sessionId);
		const detachError =
			options?.error ??
			new ProviderError(
				"PROCESS_CRASH",
				`Session ${sessionId} was detached from pooled slot`,
			);
		if (session) {
			session.alive = false;
			this.failPendingTurns(session, detachError);
			this.failActiveTurns(session, detachError);
			this.resetTurnState(session.runtime, true);
			session.toolByCallId.clear();
			this.sessions.delete(sessionId);
		}
		this.sessionBindings.delete(sessionId);
		slot.boundSessionId = null;
		slot.lastActiveAt = Date.now();

		if (options?.removeListeners) {
			this.upsertListeners.delete(sessionId);
			this.turnListeners.delete(sessionId);
		}
	}

	private async replaceSlotHandle(
		slotIndex: number,
		request: Omit<ClaudeSdkQueryRequest, "input">,
	): Promise<void> {
		const slot = this.pool[slotIndex];
		if (!slot) {
			throw new ProviderError(
				"SESSION_CREATE_FAILED",
				"Pool slot was not found",
			);
		}

		await this.closeSlotHandle(slotIndex);

		const inputQueue = this.createInputGenerator();
		let handle: ClaudeSdkQueryHandle;
		try {
			handle = await this.deps.sdk.query({
				...request,
				input: inputQueue.input,
			});
		} catch (error) {
			inputQueue.close();
			const detail = request.resumeSessionId
				? `Failed to load Claude SDK session ${request.resumeSessionId}`
				: "Failed to create Claude SDK session";
			throw new ProviderError("SESSION_CREATE_FAILED", detail, error);
		}

		slot.handle = handle;
		slot.inputQueue = inputQueue;
		slot.projectDir = request.cwd;
		slot.alive = true;
		slot.outputClosed = false;
		slot.lastActiveAt = Date.now();
		this.ensureOutputConsumer(slotIndex);
	}

	private async closeSlotHandle(slotIndex: number): Promise<void> {
		const slot = this.pool[slotIndex];
		if (!slot) {
			return;
		}
		const handle = slot.handle;
		slot.handle = undefined;
		slot.outputClosed = true;
		slot.alive = false;
		slot.outputConsumer = undefined;
		slot.inputQueue?.close();
		slot.inputQueue = undefined;
		if (!handle) {
			return;
		}
		try {
			await handle.close();
		} catch {
			// Best-effort shutdown.
		}
	}

	private async replenishPool(): Promise<void> {
		if (this.replenishPoolPromise) {
			return this.replenishPoolPromise;
		}

		const run = async (): Promise<void> => {
			for (const slot of this.pool) {
				if (slot.boundSessionId !== null) {
					continue;
				}
				if (slot.handle?.isAlive()) {
					continue;
				}
				try {
					await this.replaceSlotHandle(slot.index, {
						cwd: this.poolConfig.defaultProjectDir,
					});
				} catch {
					// Best-effort warm up.
				}
			}
		};

		this.replenishPoolPromise = run().finally(() => {
			this.replenishPoolPromise = undefined;
		});
		return this.replenishPoolPromise;
	}

	async shutdown(): Promise<void> {
		for (const slot of this.pool) {
			this.detachSession(slot.index, {
				removeListeners: true,
				error: new ProviderError(
					"PROCESS_CRASH",
					"Pooled Claude SDK provider was shut down",
				),
			});
		}
		for (const slot of this.pool) {
			await this.closeSlotHandle(slot.index);
		}
	}

	private createPendingTurn(turnId: string, sessionId: string): PendingTurn {
		let resolveStarted: () => void = () => {};
		let rejectStarted: (_error: ProviderError) => void = () => {};
		const startedPromise = new Promise<void>((resolve, reject) => {
			resolveStarted = resolve;
			rejectStarted = reject;
		});

		let resolveCompletion: () => void = () => {};
		let rejectCompletion: (_error: ProviderError) => void = () => {};
		const completionPromise = new Promise<void>((resolve, reject) => {
			resolveCompletion = resolve;
			rejectCompletion = reject;
		});

		return {
			turnId,
			sessionId,
			startedPromise,
			resolveStarted,
			rejectStarted,
			startedSettled: false,
			completionPromise,
			resolveCompletion,
			rejectCompletion,
			completionSettled: false,
		};
	}

	private resolveTurnStarted(pendingTurn: PendingTurn): void {
		if (pendingTurn.startedSettled) {
			return;
		}
		pendingTurn.startedSettled = true;
		pendingTurn.resolveStarted();
	}

	private rejectTurnStarted(
		pendingTurn: PendingTurn,
		error: ProviderError,
	): void {
		if (pendingTurn.startedSettled) {
			return;
		}
		pendingTurn.startedSettled = true;
		pendingTurn.rejectStarted(error);
	}

	private resolveTurnCompletion(pendingTurn: PendingTurn): void {
		if (pendingTurn.completionSettled) {
			return;
		}
		pendingTurn.completionSettled = true;
		pendingTurn.resolveCompletion();
	}

	private rejectTurnCompletion(
		pendingTurn: PendingTurn,
		error: ProviderError,
	): void {
		if (pendingTurn.completionSettled) {
			return;
		}
		pendingTurn.completionSettled = true;
		pendingTurn.rejectCompletion(error);
	}

	private resolvePendingTurns(session: ClaudeProviderSessionState): void {
		for (const pendingTurn of session.pendingTurnIds) {
			this.resolveTurnStarted(pendingTurn);
			this.resolveTurnCompletion(pendingTurn);
		}
		session.pendingTurnIds = [];
	}

	private failPendingTurns(
		session: ClaudeProviderSessionState,
		error: ProviderError,
	): void {
		for (const pendingTurn of session.pendingTurnIds) {
			this.rejectTurnStarted(pendingTurn, error);
			this.rejectTurnCompletion(pendingTurn, error);
		}
		session.pendingTurnIds = [];
	}

	private resolveActiveTurn(
		session: ClaudeProviderSessionState,
		turnId: string,
	): void {
		const pendingTurn = session.activeTurnById.get(turnId);
		if (!pendingTurn) {
			return;
		}
		this.resolveTurnCompletion(pendingTurn);
		session.activeTurnById.delete(turnId);
	}

	private resolveActiveTurns(session: ClaudeProviderSessionState): void {
		for (const [turnId, pendingTurn] of session.activeTurnById) {
			this.resolveTurnCompletion(pendingTurn);
			session.activeTurnById.delete(turnId);
		}
	}

	private failActiveTurns(
		session: ClaudeProviderSessionState,
		error: ProviderError,
	): void {
		for (const [turnId, pendingTurn] of session.activeTurnById) {
			this.rejectTurnCompletion(pendingTurn, error);
			session.activeTurnById.delete(turnId);
		}
	}

	private requireSession(sessionId: string): ClaudeProviderSessionState {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new ProviderError(
				"SESSION_NOT_FOUND",
				`Session ${sessionId} was not found`,
			);
		}
		return session;
	}

	private createSessionId(): string {
		return this.deps.createSessionId?.() ?? randomUUID();
	}

	private createTurnId(): string {
		return this.deps.createTurnId?.() ?? randomUUID();
	}

	private now(): string {
		return this.deps.now?.() ?? new Date().toISOString();
	}

	private emitUpsert(sessionId: string, upsert: UpsertObject): void {
		for (const callback of this.upsertListeners.get(sessionId) ?? []) {
			callback(upsert);
		}
	}

	private emitTurn(sessionId: string, event: TurnEvent): void {
		for (const callback of this.turnListeners.get(sessionId) ?? []) {
			callback(event);
		}
	}
}
