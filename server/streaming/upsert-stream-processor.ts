import type { StreamEventEnvelope } from "./stream-event-schema";
import {
	DEFAULT_BATCH_GRADIENT,
	DEFAULT_BATCH_TIMEOUT_MS,
	type MessageUpsert,
	type ThinkingUpsert,
	type ToolCallUpsert,
	type UpsertProcessorConfig,
	type UpsertProcessorDeps,
} from "./upsert-types";

export type UpsertStreamProcessorOptions = Partial<UpsertProcessorConfig>;

export interface UpsertProcessor {
	process(event: StreamEventEnvelope): void;
	destroy(reason?: { code: string; message: string }): void;
}

interface BufferedItemState {
	turnId: string;
	sessionId: string;
	itemId: string;
	type: "message" | "thinking";
	content: string;
	origin: "user" | "agent" | "system";
	providerId: string;
	sourceTimestamp: string;
	emittedTokenCount: number;
	batchIndex: number;
	hasEmittedCreate: boolean;
}

interface ToolInvocationState {
	itemId: string;
	toolName: string;
	toolArguments: Record<string, unknown>;
	callId: string;
}

export class UpsertStreamProcessor implements UpsertProcessor {
	private readonly config: UpsertProcessorConfig;
	private readonly bufferedItems = new Map<string, BufferedItemState>();
	private readonly batchTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();
	private readonly toolByCallId = new Map<string, ToolInvocationState>();
	private readonly callIdByItemId = new Map<string, string>();
	private readonly cancelledItemIds = new Set<string>();
	private currentProviderId = "";
	private isTurnTerminal = false;

	constructor(
		private readonly deps: UpsertProcessorDeps,
		options: UpsertStreamProcessorOptions = {},
	) {
		this.config = {
			batchGradientTokens: options.batchGradientTokens?.length
				? options.batchGradientTokens
				: DEFAULT_BATCH_GRADIENT,
			batchTimeoutMs: options.batchTimeoutMs ?? DEFAULT_BATCH_TIMEOUT_MS,
		};
	}

	process(event: StreamEventEnvelope): void {
		const payload = event.payload;

		if (payload.type === "response_start") {
			this.isTurnTerminal = false;
		}
		if (this.isTurnTerminal && payload.type !== "response_start") {
			return;
		}

		switch (payload.type) {
			case "response_start": {
				this.currentProviderId = payload.providerId;
				this.deps.onTurn({
					type: "turn_started",
					turnId: event.turnId,
					sessionId: event.sessionId,
					modelId: payload.modelId,
					providerId: payload.providerId,
				});
				return;
			}
			case "item_start": {
				this.cancelledItemIds.delete(payload.itemId);
				this.handleItemStart(event);
				return;
			}
			case "item_delta": {
				this.handleItemDelta(event);
				return;
			}
			case "item_done": {
				this.handleItemDone(event);
				return;
			}
			case "item_error": {
				this.handleItemError(event);
				return;
			}
			case "item_cancelled": {
				this.handleItemCancelled(event);
				return;
			}
			case "response_done": {
				this.flushBufferedItems();
				if (payload.status === "error") {
					const resolvedError = payload.error ?? {
						code: payload.finishReason ?? "RESPONSE_ERROR",
						message: "Response finished with error status",
					};
					this.deps.onTurn({
						type: "turn_error",
						turnId: event.turnId,
						sessionId: event.sessionId,
						errorCode: resolvedError.code,
						errorMessage: resolvedError.message,
					});
					this.resolveTurnTerminal();
					return;
				}
				this.deps.onTurn({
					type: "turn_complete",
					turnId: event.turnId,
					sessionId: event.sessionId,
					status: payload.status,
					usage: payload.usage,
				});
				this.resolveTurnTerminal();
				return;
			}
			case "response_error": {
				this.flushBufferedItems();
				this.deps.onTurn({
					type: "turn_error",
					turnId: event.turnId,
					sessionId: event.sessionId,
					errorCode: payload.error.code,
					errorMessage: payload.error.message,
				});
				this.resolveTurnTerminal();
				return;
			}
			default: {
				return;
			}
		}
	}

	destroy(reason?: { code: string; message: string }): void {
		for (const [itemId, state] of this.bufferedItems) {
			this.emitBufferedUpsert(state, "error", state.sourceTimestamp, reason);
			this.clearBatchTimer(itemId);
		}
		for (const itemId of this.batchTimers.keys()) {
			this.clearBatchTimer(itemId);
		}
		this.bufferedItems.clear();
		this.toolByCallId.clear();
		this.callIdByItemId.clear();
		this.cancelledItemIds.clear();
		this.currentProviderId = "";
		this.isTurnTerminal = true;
	}

	private handleItemStart(event: StreamEventEnvelope): void {
		const payload = event.payload;
		if (payload.type !== "item_start") {
			return;
		}
		switch (payload.itemType) {
			case "message": {
				const initialContent = payload.initialContent ?? "";
				const state: BufferedItemState = {
					turnId: event.turnId,
					sessionId: event.sessionId,
					itemId: payload.itemId,
					type: "message",
					content: initialContent,
					origin: "agent",
					providerId: this.currentProviderId,
					sourceTimestamp: event.timestamp,
					emittedTokenCount: 0,
					batchIndex: 0,
					hasEmittedCreate: false,
				};
				this.bufferedItems.set(payload.itemId, state);
				if (initialContent.length > 0) {
					this.resetBatchTimer(payload.itemId);
				}
				return;
			}
			case "reasoning": {
				const initialContent = payload.initialContent ?? "";
				const state: BufferedItemState = {
					turnId: event.turnId,
					sessionId: event.sessionId,
					itemId: payload.itemId,
					type: "thinking",
					content: initialContent,
					origin: "agent",
					providerId: this.currentProviderId,
					sourceTimestamp: event.timestamp,
					emittedTokenCount: 0,
					batchIndex: 0,
					hasEmittedCreate: false,
				};
				this.bufferedItems.set(payload.itemId, state);
				if (initialContent.length > 0) {
					this.resetBatchTimer(payload.itemId);
				}
				return;
			}
			case "function_call": {
				if (!payload.callId || !payload.name) {
					return;
				}
				const tool: ToolInvocationState = {
					itemId: payload.itemId,
					toolName: payload.name,
					toolArguments: {},
					callId: payload.callId,
				};
				this.toolByCallId.set(payload.callId, tool);
				this.callIdByItemId.set(payload.itemId, payload.callId);
				this.deps.onUpsert(this.buildToolUpsert(event, "create", tool));
				return;
			}
			case "function_call_output": {
				return;
			}
			default: {
				return;
			}
		}
	}

	private handleItemDelta(event: StreamEventEnvelope): void {
		const payload = event.payload;
		if (payload.type !== "item_delta") {
			return;
		}
		if (this.cancelledItemIds.has(payload.itemId)) {
			return;
		}
		const state = this.bufferedItems.get(payload.itemId);
		if (!state) {
			return;
		}

		state.content += payload.deltaContent;
		state.sourceTimestamp = event.timestamp;

		const tokenCount = this.countBatchTokens(state.content);
		const unemittedTokens = tokenCount - state.emittedTokenCount;
		if (unemittedTokens > this.getCurrentBatchThreshold(state.batchIndex)) {
			const status = state.hasEmittedCreate ? "update" : "create";
			this.emitBufferedUpsert(state, status, event.timestamp);
			state.hasEmittedCreate = true;
			this.advanceBatchIndex(state, unemittedTokens);
			state.emittedTokenCount = tokenCount;
		}

		this.resetBatchTimer(payload.itemId);
	}

	private handleItemDone(event: StreamEventEnvelope): void {
		const payload = event.payload;
		if (payload.type !== "item_done") {
			return;
		}
		if (this.cancelledItemIds.has(payload.itemId)) {
			return;
		}

		const finalItem = payload.finalItem;
		if (finalItem.type === "function_call_output") {
			const correlated = this.toolByCallId.get(finalItem.callId);
			if (!correlated) {
				return;
			}
			this.deps.onUpsert(
				this.buildToolUpsert(event, "complete", correlated, {
					output: finalItem.output,
					isError: finalItem.isError,
				}),
			);
			this.toolByCallId.delete(finalItem.callId);
			this.callIdByItemId.delete(correlated.itemId);
			return;
		}

		if (finalItem.type === "function_call") {
			const existing = this.toolByCallId.get(finalItem.callId);
			const tool: ToolInvocationState = {
				itemId: payload.itemId,
				toolName: finalItem.name,
				toolArguments: finalItem.arguments,
				callId: finalItem.callId,
			};
			this.toolByCallId.set(finalItem.callId, tool);
			this.callIdByItemId.set(payload.itemId, finalItem.callId);
			if (!existing) {
				this.deps.onUpsert(this.buildToolUpsert(event, "create", tool));
			}
			return;
		}

		const state = this.bufferedItems.get(payload.itemId);
		if (state) {
			const tokenCount = this.countBatchTokens(state.content);
			if (tokenCount > state.emittedTokenCount) {
				const status = state.hasEmittedCreate ? "update" : "create";
				this.emitBufferedUpsert(state, status, state.sourceTimestamp);
				state.hasEmittedCreate = true;
				this.advanceBatchIndex(state, tokenCount - state.emittedTokenCount);
				state.emittedTokenCount = tokenCount;
			}
		}
		this.clearBatchTimer(payload.itemId);
		this.bufferedItems.delete(payload.itemId);

		if (finalItem.type === "message") {
			const upsert: MessageUpsert = {
				type: "message",
				status: "complete",
				turnId: event.turnId,
				sessionId: event.sessionId,
				itemId: payload.itemId,
				sourceTimestamp: event.timestamp,
				emittedAt: this.deps.now(),
				content: finalItem.content,
				origin: finalItem.origin,
			};
			this.deps.onUpsert(upsert);
			return;
		}

		if (finalItem.type === "reasoning") {
			const upsert: ThinkingUpsert = {
				type: "thinking",
				status: "complete",
				turnId: event.turnId,
				sessionId: event.sessionId,
				itemId: payload.itemId,
				sourceTimestamp: event.timestamp,
				emittedAt: this.deps.now(),
				content: finalItem.content,
				providerId: finalItem.providerId,
			};
			this.deps.onUpsert(upsert);
		}
	}

	private handleItemError(event: StreamEventEnvelope): void {
		const payload = event.payload;
		if (payload.type !== "item_error") {
			return;
		}
		const state = this.bufferedItems.get(payload.itemId);
		if (!state) {
			return;
		}
		this.emitBufferedUpsert(state, "error", event.timestamp, {
			code: payload.error.code,
			message: payload.error.message,
		});
		this.clearBatchTimer(payload.itemId);
		this.bufferedItems.delete(payload.itemId);
	}

	private handleItemCancelled(event: StreamEventEnvelope): void {
		const payload = event.payload;
		if (payload.type !== "item_cancelled") {
			return;
		}
		this.cancelledItemIds.add(payload.itemId);
		this.clearBatchTimer(payload.itemId);
		this.bufferedItems.delete(payload.itemId);

		const callId = this.callIdByItemId.get(payload.itemId);
		if (callId) {
			this.toolByCallId.delete(callId);
			this.callIdByItemId.delete(payload.itemId);
		}
	}

	private flushBufferedItems(): void {
		for (const [itemId, state] of this.bufferedItems) {
			const tokenCount = this.countBatchTokens(state.content);
			if (tokenCount === state.emittedTokenCount) {
				this.clearBatchTimer(itemId);
				continue;
			}
			const status = state.hasEmittedCreate ? "update" : "create";
			this.emitBufferedUpsert(state, status, state.sourceTimestamp);
			state.hasEmittedCreate = true;
			this.advanceBatchIndex(state, tokenCount - state.emittedTokenCount);
			state.emittedTokenCount = tokenCount;
			this.clearBatchTimer(itemId);
		}
	}

	private resetTerminalState(): void {
		for (const itemId of this.batchTimers.keys()) {
			this.clearBatchTimer(itemId);
		}
		this.bufferedItems.clear();
		this.toolByCallId.clear();
		this.callIdByItemId.clear();
		this.cancelledItemIds.clear();
		this.currentProviderId = "";
	}

	private resolveTurnTerminal(): void {
		this.isTurnTerminal = true;
		this.resetTerminalState();
	}

	private onBatchTimeout(itemId: string): void {
		const state = this.bufferedItems.get(itemId);
		if (!state) {
			return;
		}
		this.clearBatchTimer(itemId);

		const tokenCount = this.countBatchTokens(state.content);
		if (tokenCount === state.emittedTokenCount) {
			return;
		}

		const status = state.hasEmittedCreate ? "update" : "create";
		this.emitBufferedUpsert(state, status, state.sourceTimestamp);
		state.hasEmittedCreate = true;
		this.advanceBatchIndex(state, tokenCount - state.emittedTokenCount);
		state.emittedTokenCount = tokenCount;
	}

	private emitBufferedUpsert(
		state: BufferedItemState,
		status: "create" | "update" | "error",
		sourceTimestamp: string,
		error?: { code: string; message: string },
	): void {
		const base = {
			status,
			turnId: state.turnId,
			sessionId: state.sessionId,
			itemId: state.itemId,
			sourceTimestamp,
			emittedAt: this.deps.now(),
			errorCode: error?.code,
			errorMessage: error?.message,
		};

		if (state.type === "message") {
			const upsert: MessageUpsert = {
				type: "message",
				...base,
				content: state.content,
				origin: state.origin,
			};
			this.deps.onUpsert(upsert);
			return;
		}

		const upsert: ThinkingUpsert = {
			type: "thinking",
			...base,
			content: state.content,
			providerId: state.providerId,
		};
		this.deps.onUpsert(upsert);
	}

	private buildToolUpsert(
		event: StreamEventEnvelope,
		status: "create" | "complete",
		tool: ToolInvocationState,
		output?: { output: string; isError: boolean },
	): ToolCallUpsert {
		return {
			type: "tool_call",
			status,
			turnId: event.turnId,
			sessionId: event.sessionId,
			itemId: tool.itemId,
			sourceTimestamp: event.timestamp,
			emittedAt: this.deps.now(),
			toolName: tool.toolName,
			toolArguments: tool.toolArguments,
			callId: tool.callId,
			toolOutput: output?.output,
			toolOutputIsError: output?.isError,
		};
	}

	private resetBatchTimer(itemId: string): void {
		this.clearBatchTimer(itemId);
		this.batchTimers.set(
			itemId,
			setTimeout(() => {
				this.onBatchTimeout(itemId);
			}, this.config.batchTimeoutMs),
		);
	}

	private clearBatchTimer(itemId: string): void {
		const timer = this.batchTimers.get(itemId);
		if (!timer) {
			return;
		}
		clearTimeout(timer);
		this.batchTimers.delete(itemId);
	}

	private getCurrentBatchThreshold(batchIndex: number): number {
		if (this.config.batchGradientTokens.length === 0) {
			return Number.POSITIVE_INFINITY;
		}
		const index = Math.min(
			batchIndex,
			this.config.batchGradientTokens.length - 1,
		);
		return this.config.batchGradientTokens[index] ?? Number.POSITIVE_INFINITY;
	}

	private advanceBatchIndex(
		state: BufferedItemState,
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
}
