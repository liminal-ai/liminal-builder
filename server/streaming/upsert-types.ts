/**
 * Upsert objects: progressive render-state replacements for browser delivery.
 *
 * Phase 2 ingestion boundary note:
 * - `sourceTimestamp` preserves provider/source event time for downstream canonical sourceTimestamp derivation.
 * - `emittedAt` is processor emission time.
 * - Fields NOT resolved in this epic (deferred to Phase 2 Tech Design):
 *   `turnSequenceNumber`, `llmTurnNumber`, and canonical `entryType` derivation.
 *   Phase 2 defines the field-by-field transformation from upsert objects to Context canonical entries.
 */

export interface UpsertObjectBase {
	turnId: string;
	sessionId: string;
	itemId: string;
	/** Provider/source event time for downstream canonical sourceTimestamp derivation */
	sourceTimestamp: string; // ISO 8601 UTC
	/** Time the processor emitted this upsert object */
	emittedAt: string; // ISO 8601 UTC
	status: "create" | "update" | "complete" | "error";
	errorCode?: string;
	errorMessage?: string;
}

export interface MessageUpsert extends UpsertObjectBase {
	type: "message";
	content: string;
	origin: "user" | "agent" | "system";
}

export interface ThinkingUpsert extends UpsertObjectBase {
	type: "thinking";
	content: string;
	providerId: string;
}

export interface ToolCallUpsert extends UpsertObjectBase {
	type: "tool_call";
	toolName: string;
	/**
	 * Intentionally unvalidated - tool argument schemas are provider-specific.
	 * Note: create emissions can be partial/empty; finalized arguments arrive on item_done(function_call).
	 */
	toolArguments: Record<string, unknown>;
	callId: string;
	toolOutput?: string;
	/**
	 * Whether the tool output represents an error.
	 * Note: named `toolOutputIsError` (not `isError`) to disambiguate from
	 * FinalizedItem.function_call_output.isError at the stream-event layer.
	 */
	toolOutputIsError?: boolean;
}

export type UpsertObject = MessageUpsert | ThinkingUpsert | ToolCallUpsert;

// -- Upsert processor configuration --
export interface UpsertProcessorConfig {
	/** Emission thresholds in tokens; default [10, 20, 40, 80, 120] */
	batchGradientTokens: readonly number[];
	/** Flush buffered content when idle; default 1000ms */
	batchTimeoutMs: number;
}

export const DEFAULT_BATCH_GRADIENT: readonly number[] = [10, 20, 40, 80, 120];
export const DEFAULT_BATCH_TIMEOUT_MS = 1000;

// -- Turn lifecycle events (processor output) --
export type TurnEvent =
	| {
			type: "turn_started";
			turnId: string;
			sessionId: string;
			modelId: string;
			providerId: string;
	  }
	| {
			type: "turn_complete";
			turnId: string;
			sessionId: string;
			status: "completed" | "cancelled";
			usage?: {
				inputTokens: number;
				outputTokens: number;
				cacheReadInputTokens?: number;
				cacheCreationInputTokens?: number;
			};
	  }
	| {
			type: "turn_error";
			turnId: string;
			sessionId: string;
			errorCode: string;
			errorMessage: string;
	  };

// -- Processor dependency interface --
export interface UpsertProcessorDeps {
	onUpsert: (upsert: UpsertObject) => void;
	onTurn: (event: TurnEvent) => void;
	now: () => string;
}
