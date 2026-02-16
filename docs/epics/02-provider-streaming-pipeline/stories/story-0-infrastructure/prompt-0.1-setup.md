# Prompt 0.1: Story 0 Infrastructure Setup

## Context

**Product:** Liminal Builder is an agentic IDE that wraps AI coding CLIs (Claude Code, Codex) in a Fastify + WebSocket server with a browser-based chat UI.

**Project:** Builder currently uses a single ACP client to talk to all CLIs. This epic replaces that with a layered provider architecture: each CLI gets a purpose-built provider that emits canonical stream events, which flow through an upsert stream processor into WebSocket delivery. From the user's perspective nothing changes — same UI, same chat, same sessions.

**Feature:** Epic 02 — Provider Architecture + Streaming Pipeline. 8 stories (0-7), 92 tests. This is Story 0: shared infrastructure that all subsequent stories build on.

**Story 0 scope:** Types, Zod schemas, error classes, test fixtures, test helpers, barrel exports, dependency installation. No runtime business logic. No tests (those are Story 1).

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:** Project compiles. No other story in this epic has started.

## Reference Documents
(For human traceability — all required content is inlined below.)
- Tech design: `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- Feature spec: `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- Test plan: `docs/epics/02-provider-streaming-pipeline/test-plan.md`

## Important Notes
- `NotImplementedError` already exists at `server/errors.ts`. Reuse it — do not create a duplicate.
- `CliType` already exists at `server/sessions/session-types.ts` as `"claude-code" | "codex"`. The new `provider-types.ts` should import and re-export it from there for provider-layer use, not redefine it.
- Path aliases are configured in `tsconfig.json`: `@server/*`, `@shared/*`, `@tests/*`. Use aliases for cross-directory imports. Relative imports are fine for same-directory barrel files.

## Task

### Part 0: Dependencies and Format Fixes

**0a. Install dependencies**

Add to `package.json` `dependencies`:
```json
"zod": "^3.24.0",
"@anthropic-ai/claude-agent-sdk": "^0.2.42"
```

Add to `package.json` `devDependencies`:
```json
"@anthropic-ai/sdk": "^0.52.0"
```

Then run `bun install`.

`@anthropic-ai/sdk` is intentionally forward-looking for Story 3 type-safety on raw stream event normalization.

**0b. Fix pre-existing format failures**

Run `bun run format` to auto-fix formatting across the repository. Existing baseline issues are expected in more than two files. Confirm `bun run format:check` passes afterward.

### Part 0.5: File Creation Order

`provider-types.ts` depends on `stream-event-schema.ts`. Create `stream-event-schema.ts` first, or create all Story 0 files before running `bun run typecheck`.

### Part 1: Core Types and Schemas

**1. `server/providers/provider-errors.ts`**

```typescript
export type ProviderErrorCode =
	| "UNSUPPORTED_CLI_TYPE"
	| "SESSION_NOT_FOUND"
	| "PROCESS_CRASH"
	| "PROTOCOL_ERROR"
	| "INVALID_STREAM_EVENT"
	| "INTERRUPT_FAILED"
	| "SESSION_CREATE_FAILED";

export class ProviderError extends Error {
	readonly code: ProviderErrorCode;
	readonly cause?: unknown;

	constructor(code: ProviderErrorCode, message: string, cause?: unknown) {
		super(message);
		this.name = "ProviderError";
		this.code = code;
		this.cause = cause;
	}
}
```

**2. `server/providers/provider-types.ts`**

```typescript
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
	sendMessage(
		sessionId: string,
		message: string,
	): Promise<SendMessageResult>;
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
```

**3. `server/streaming/stream-event-schema.ts`**

```typescript
import { z } from "zod";

// -- Item cancellation reasons --
export const cancellationReasonSchema = z.enum([
	"user_cancel",
	"timeout",
	"process_death",
]);

export type CancellationReason = z.infer<typeof cancellationReasonSchema>;

// -- Finalized item schema (concrete, not z.unknown()) --
export const finalizedItemSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("message"),
		content: z.string(),
		origin: z.enum(["user", "agent", "system"]),
	}),
	z.object({
		type: z.literal("reasoning"),
		content: z.string(),
		providerId: z.string(),
	}),
	z.object({
		type: z.literal("function_call"),
		name: z.string(),
		callId: z.string(),
		arguments: z.record(z.unknown()),
	}),
	z.object({
		type: z.literal("function_call_output"),
		callId: z.string(),
		output: z.string(),
		isError: z.boolean(),
	}),
]);

export type FinalizedItem = z.infer<typeof finalizedItemSchema>;

// -- Usage schema (concrete, not z.unknown()) --
export const usageSchema = z.object({
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheReadInputTokens: z.number().optional(),
	cacheCreationInputTokens: z.number().optional(),
});

export type Usage = z.infer<typeof usageSchema>;

// -- Stream event payloads --
export const streamEventPayloadSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("response_start"),
		modelId: z.string(),
		providerId: z.string(),
	}),
	z.object({
		type: z.literal("item_start"),
		itemId: z.string(),
		itemType: z.enum([
			"message",
			"reasoning",
			"function_call",
			"function_call_output",
		]),
		initialContent: z.string().optional(),
		name: z.string().optional(),
		callId: z.string().optional(),
	}),
	z.object({
		type: z.literal("item_delta"),
		itemId: z.string(),
		deltaContent: z.string(),
	}),
	z.object({
		type: z.literal("item_done"),
		itemId: z.string(),
		finalItem: finalizedItemSchema,
	}),
	z.object({
		type: z.literal("item_error"),
		itemId: z.string(),
		error: z.object({ code: z.string(), message: z.string() }),
	}),
	z.object({
		type: z.literal("item_cancelled"),
		itemId: z.string(),
		reason: cancellationReasonSchema.optional(),
	}),
	z.object({
		type: z.literal("response_done"),
		status: z.enum(["completed", "cancelled", "error"]),
		finishReason: z.string().optional(),
		usage: usageSchema.optional(),
	}),
	z.object({
		type: z.literal("response_error"),
		error: z.object({ code: z.string(), message: z.string() }),
	}),
]);

export type StreamEventPayload = z.infer<typeof streamEventPayloadSchema>;

// -- Stream event types --
export const streamEventTypeSchema = z.enum([
	"response_start",
	"item_start",
	"item_delta",
	"item_done",
	"item_error",
	"item_cancelled",
	"response_done",
	"response_error",
]);

export type StreamEventType = z.infer<typeof streamEventTypeSchema>;

// -- Envelope --
export const streamEventEnvelopeSchema = z
	.object({
		eventId: z.string(),
		timestamp: z.string().datetime(),
		turnId: z.string(),
		sessionId: z.string(),
		type: streamEventTypeSchema,
		payload: streamEventPayloadSchema,
	})
	.refine((event) => event.type === event.payload.type, {
		message: "Envelope type must match payload.type",
		path: ["type"],
	});

export type StreamEventEnvelope = z.infer<typeof streamEventEnvelopeSchema>;
```

**4. `server/streaming/upsert-types.ts`**

```typescript
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
	/** Intentionally unvalidated — tool argument schemas are provider-specific */
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
```

**5. `shared/stream-contracts.ts`**

Re-export types and Zod schemas needed by both server and client code.

```typescript
import type {
	UpsertObject,
	TurnEvent,
} from "@server/streaming/upsert-types";

// Types re-exported for client consumption
export type {
	StreamEventEnvelope,
	StreamEventPayload,
	StreamEventType,
	FinalizedItem,
	Usage,
} from "@server/streaming/stream-event-schema";

export type {
	UpsertObject,
	MessageUpsert,
	ThinkingUpsert,
	ToolCallUpsert,
	TurnEvent,
} from "@server/streaming/upsert-types";

// Zod schemas re-exported for runtime validation (e.g., client-side WS message validation)
export {
	streamEventEnvelopeSchema,
	streamEventPayloadSchema,
	finalizedItemSchema,
	usageSchema,
} from "@server/streaming/stream-event-schema";

// -- WebSocket message types (Builder -> Browser) --
export interface WsUpsertMessage {
	type: "session:upsert";
	sessionId: string;
	payload: UpsertObject;
}

export interface WsTurnMessage {
	type: "session:turn";
	sessionId: string;
	payload: TurnEvent;
}

export interface WsHistoryMessage {
	type: "session:history";
	sessionId: string;
	entries: UpsertObject[];
}

export type StreamingServerMessage =
	| WsUpsertMessage
	| WsTurnMessage
	| WsHistoryMessage;
```

### Part 2: Barrel Exports

**6. `server/providers/index.ts`**

```typescript
export { ProviderError } from "./provider-errors";
export type { ProviderErrorCode } from "./provider-errors";
export type {
	CliType,
	CliProvider,
	ProviderRegistry,
	CreateSessionOptions,
	LoadSessionOptions,
	ProviderSession,
	SendMessageResult,
} from "./provider-types";
```

**7. `server/streaming/index.ts`**

```typescript
export {
	streamEventEnvelopeSchema,
	streamEventPayloadSchema,
	streamEventTypeSchema,
	finalizedItemSchema,
	usageSchema,
} from "./stream-event-schema";

export type {
	StreamEventEnvelope,
	StreamEventPayload,
	StreamEventType,
	FinalizedItem,
	Usage,
	CancellationReason,
} from "./stream-event-schema";

export type {
	UpsertObject,
	MessageUpsert,
	ThinkingUpsert,
	ToolCallUpsert,
	UpsertObjectBase,
	UpsertProcessorConfig,
	UpsertProcessorDeps,
	TurnEvent,
} from "./upsert-types";

export {
	DEFAULT_BATCH_GRADIENT,
	DEFAULT_BATCH_TIMEOUT_MS,
} from "./upsert-types";
```

### Part 3: Test Fixtures

**8. `tests/fixtures/constants.ts`**

```typescript
export const TEST_SESSION_ID = "test-session-001";
export const TEST_TURN_ID = "test-turn-001";
export const TEST_TIMESTAMP = "2026-02-15T10:00:00.000Z";
export const TEST_EMITTED_AT = "2026-02-15T10:00:00.100Z";
```

**9. `tests/fixtures/stream-events.ts`**

All fixtures use deterministic IDs for snapshot-friendly assertions. Every fixture must validate against the corresponding Zod schema.

```typescript
import {
	streamEventEnvelopeSchema,
	type StreamEventEnvelope,
} from "@server/streaming";
import {
	TEST_SESSION_ID,
	TEST_TIMESTAMP,
	TEST_TURN_ID,
} from "@tests/fixtures/constants";

// -- Envelope factory: builds a complete envelope from just a payload + optional overrides --
export function createEnvelope(
	eventId: string,
	payload: StreamEventEnvelope["payload"],
	overrides?: Partial<Omit<StreamEventEnvelope, "payload">>,
): StreamEventEnvelope {
	return streamEventEnvelopeSchema.parse({
		eventId,
		timestamp: TEST_TIMESTAMP,
		turnId: TEST_TURN_ID,
		sessionId: TEST_SESSION_ID,
		type: payload.type,
		...overrides,
		payload,
	});
}

// -- Per-event-type fixtures --

export const RESPONSE_START_FIXTURE = createEnvelope("test-event-001", {
	type: "response_start",
	modelId: "claude-sonnet-4-5-20250929",
	providerId: "claude-code",
});

export const ITEM_START_MESSAGE_FIXTURE = createEnvelope("test-event-002", {
	type: "item_start",
	itemId: "test-item-msg-001",
	itemType: "message",
});

export const ITEM_START_REASONING_FIXTURE = createEnvelope("test-event-003", {
	type: "item_start",
	itemId: "test-item-reason-001",
	itemType: "reasoning",
});

export const ITEM_START_FUNCTION_CALL_FIXTURE = createEnvelope("test-event-004", {
	type: "item_start",
	itemId: "test-item-fc-001",
	itemType: "function_call",
	name: "read_file",
	callId: "test-call-001",
});

export const ITEM_START_FUNCTION_CALL_OUTPUT_FIXTURE = createEnvelope(
	"test-event-005",
	{
		type: "item_start",
		itemId: "test-item-fco-001",
		itemType: "function_call_output",
		callId: "test-call-001",
	},
);

export const ITEM_DELTA_TEXT_FIXTURE = createEnvelope("test-event-006", {
	type: "item_delta",
	itemId: "test-item-msg-001",
	deltaContent: "Hello, world!",
});

export const ITEM_DELTA_ARGS_FIXTURE = createEnvelope("test-event-007", {
	type: "item_delta",
	itemId: "test-item-fc-001",
	deltaContent: '{"path": "/src/index.ts"}',
});

export const ITEM_DONE_MESSAGE_FIXTURE = createEnvelope("test-event-008", {
	type: "item_done",
	itemId: "test-item-msg-001",
	finalItem: {
		type: "message",
		content: "Hello, world! How can I help?",
		origin: "agent",
	},
});

export const ITEM_DONE_REASONING_FIXTURE = createEnvelope("test-event-009", {
	type: "item_done",
	itemId: "test-item-reason-001",
	finalItem: {
		type: "reasoning",
		content: "Let me think about this...",
		providerId: "claude-code",
	},
});

export const ITEM_DONE_FUNCTION_CALL_FIXTURE = createEnvelope("test-event-010", {
	type: "item_done",
	itemId: "test-item-fc-001",
	finalItem: {
		type: "function_call",
		name: "read_file",
		callId: "test-call-001",
		arguments: { path: "/src/index.ts" },
	},
});

export const ITEM_DONE_FUNCTION_CALL_OUTPUT_FIXTURE = createEnvelope(
	"test-event-011",
	{
	type: "item_done",
	itemId: "test-item-fco-001",
	finalItem: {
		type: "function_call_output",
		callId: "test-call-001",
		output: "File contents here...",
		isError: false,
	},
},
);

export const ITEM_ERROR_FIXTURE = createEnvelope("test-event-012", {
	type: "item_error",
	itemId: "test-item-err-001",
	error: { code: "CONTENT_FILTER", message: "Content was filtered" },
});

export const ITEM_CANCELLED_FIXTURE = createEnvelope("test-event-013", {
	type: "item_cancelled",
	itemId: "test-item-cancel-001",
	reason: "user_cancel",
});

export const RESPONSE_DONE_COMPLETED_FIXTURE = createEnvelope("test-event-014", {
	type: "response_done",
	status: "completed",
	finishReason: "end_turn",
	usage: {
		inputTokens: 100,
		outputTokens: 250,
		cacheReadInputTokens: 50,
	},
});

export const RESPONSE_DONE_CANCELLED_FIXTURE = createEnvelope("test-event-015", {
	type: "response_done",
	status: "cancelled",
});

export const RESPONSE_DONE_ERROR_FIXTURE = createEnvelope("test-event-016", {
	type: "response_done",
	status: "error",
});

export const RESPONSE_ERROR_FIXTURE = createEnvelope("test-event-017", {
	type: "response_error",
	error: { code: "PROCESS_CRASH", message: "Subprocess exited unexpectedly" },
});

export const ALL_VALID_STREAM_EVENT_FIXTURES: StreamEventEnvelope[] = [
	RESPONSE_START_FIXTURE,
	ITEM_START_MESSAGE_FIXTURE,
	ITEM_START_REASONING_FIXTURE,
	ITEM_START_FUNCTION_CALL_FIXTURE,
	ITEM_START_FUNCTION_CALL_OUTPUT_FIXTURE,
	ITEM_DELTA_TEXT_FIXTURE,
	ITEM_DELTA_ARGS_FIXTURE,
	ITEM_DONE_MESSAGE_FIXTURE,
	ITEM_DONE_REASONING_FIXTURE,
	ITEM_DONE_FUNCTION_CALL_FIXTURE,
	ITEM_DONE_FUNCTION_CALL_OUTPUT_FIXTURE,
	ITEM_ERROR_FIXTURE,
	ITEM_CANCELLED_FIXTURE,
	RESPONSE_DONE_COMPLETED_FIXTURE,
	RESPONSE_DONE_CANCELLED_FIXTURE,
	RESPONSE_DONE_ERROR_FIXTURE,
	RESPONSE_ERROR_FIXTURE,
];

// -- Full turn sequence: response_start -> item lifecycle -> response_done --
export function createFullTurnSequence(): StreamEventEnvelope[] {
	return [
		createEnvelope("turn-event-001", {
			type: "response_start",
			modelId: "claude-sonnet-4-5-20250929",
			providerId: "claude-code",
		}),
		createEnvelope("turn-event-002", {
			type: "item_start",
			itemId: "turn-item-001",
			itemType: "message",
		}),
		createEnvelope("turn-event-003", {
			type: "item_delta",
			itemId: "turn-item-001",
			deltaContent: "Here is ",
		}),
		createEnvelope("turn-event-004", {
			type: "item_delta",
			itemId: "turn-item-001",
			deltaContent: "my response.",
		}),
		createEnvelope("turn-event-005", {
			type: "item_done",
			itemId: "turn-item-001",
			finalItem: {
				type: "message",
				content: "Here is my response.",
				origin: "agent",
			},
		}),
		createEnvelope("turn-event-006", {
			type: "response_done",
			status: "completed",
			finishReason: "end_turn",
			usage: { inputTokens: 50, outputTokens: 12 },
		}),
	];
}

// -- Malformed fixtures for negative testing (TC-1.1f) --
export const MALFORMED_MISSING_TYPE = {
	eventId: "bad-001",
	timestamp: "2026-02-15T10:00:00.000Z",
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	// type is missing
	payload: { type: "item_delta", itemId: "x", deltaContent: "y" },
};

export const MALFORMED_TYPE_MISMATCH = {
	eventId: "bad-002",
	timestamp: "2026-02-15T10:00:00.000Z",
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	type: "item_start", // doesn't match payload.type
	payload: { type: "item_delta", itemId: "x", deltaContent: "y" },
};

export const MALFORMED_BAD_TIMESTAMP = {
	eventId: "bad-003",
	timestamp: "not-a-date",
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	type: "item_delta",
	payload: { type: "item_delta", itemId: "x", deltaContent: "y" },
};

export const MALFORMED_MISSING_PAYLOAD_FIELDS = {
	eventId: "bad-004",
	timestamp: "2026-02-15T10:00:00.000Z",
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	type: "item_start",
	payload: { type: "item_start" }, // missing required itemId, itemType
};

export const ALL_MALFORMED_STREAM_EVENT_FIXTURES = [
	MALFORMED_MISSING_TYPE,
	MALFORMED_TYPE_MISMATCH,
	MALFORMED_BAD_TIMESTAMP,
	MALFORMED_MISSING_PAYLOAD_FIELDS,
];
```

**10. `tests/fixtures/upserts.ts`**

```typescript
import type {
	MessageUpsert,
	ThinkingUpsert,
	ToolCallUpsert,
	TurnEvent,
} from "@server/streaming/upsert-types";
import {
	TEST_EMITTED_AT,
	TEST_SESSION_ID,
	TEST_TIMESTAMP,
	TEST_TURN_ID,
} from "@tests/fixtures/constants";

// -- Message upserts in each status --

export const MESSAGE_UPSERT_CREATE: MessageUpsert = {
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	itemId: "test-item-msg-001",
	sourceTimestamp: TEST_TIMESTAMP,
	emittedAt: TEST_EMITTED_AT,
	status: "create",
	type: "message",
	content: "Hello",
	origin: "agent",
};

export const MESSAGE_UPSERT_UPDATE: MessageUpsert = {
	...MESSAGE_UPSERT_CREATE,
	status: "update",
	content: "Hello, world! Here is more content.",
	emittedAt: "2026-02-15T10:00:00.200Z",
};

export const MESSAGE_UPSERT_COMPLETE: MessageUpsert = {
	...MESSAGE_UPSERT_CREATE,
	status: "complete",
	content: "Hello, world! Here is the complete response.",
	emittedAt: "2026-02-15T10:00:01.000Z",
};

export const MESSAGE_UPSERT_ERROR: MessageUpsert = {
	...MESSAGE_UPSERT_CREATE,
	status: "error",
	content: "Hello, world! Partial content before error.",
	errorCode: "PROCESS_CRASH",
	errorMessage: "Subprocess exited unexpectedly",
	emittedAt: "2026-02-15T10:00:00.500Z",
};

// -- Thinking upserts --

export const THINKING_UPSERT_CREATE: ThinkingUpsert = {
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	itemId: "test-item-think-001",
	sourceTimestamp: TEST_TIMESTAMP,
	emittedAt: TEST_EMITTED_AT,
	status: "create",
	type: "thinking",
	content: "Let me think...",
	providerId: "claude-code",
};

export const THINKING_UPSERT_COMPLETE: ThinkingUpsert = {
	...THINKING_UPSERT_CREATE,
	status: "complete",
	content: "Let me think about the best approach here.",
	emittedAt: "2026-02-15T10:00:01.000Z",
};

// -- Tool call upserts --

export const TOOL_CALL_UPSERT_CREATE: ToolCallUpsert = {
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	itemId: "test-item-fc-001",
	sourceTimestamp: TEST_TIMESTAMP,
	emittedAt: TEST_EMITTED_AT,
	status: "create",
	type: "tool_call",
	toolName: "read_file",
	toolArguments: { path: "/src/index.ts" },
	callId: "test-call-001",
};

export const TOOL_CALL_UPSERT_COMPLETE: ToolCallUpsert = {
	...TOOL_CALL_UPSERT_CREATE,
	status: "complete",
	toolOutput: "File contents here...",
	toolOutputIsError: false,
	emittedAt: "2026-02-15T10:00:02.000Z",
};

// -- Turn events --

export const TURN_STARTED_EVENT: TurnEvent = {
	type: "turn_started",
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	modelId: "claude-sonnet-4-5-20250929",
	providerId: "claude-code",
};

export const TURN_COMPLETE_EVENT: TurnEvent = {
	type: "turn_complete",
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	status: "completed",
	usage: { inputTokens: 100, outputTokens: 250 },
};

export const TURN_CANCELLED_EVENT: TurnEvent = {
	type: "turn_complete",
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	status: "cancelled",
};

export const TURN_ERROR_EVENT: TurnEvent = {
	type: "turn_error",
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	errorCode: "PROCESS_CRASH",
	errorMessage: "Subprocess exited unexpectedly",
};
```

### Part 4: Test Helpers

**11. `tests/helpers/provider-mocks.ts`**

```typescript
import { vi } from "vitest";
import type {
	CliProvider,
	CreateSessionOptions,
	LoadSessionOptions,
	ProviderSession,
	SendMessageResult,
} from "@server/providers";
import type { CliType } from "@server/sessions/session-types";
import type { StreamEventEnvelope } from "@server/streaming";

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
			(sessionId: string, options?: LoadSessionOptions) => Promise<ProviderSession>
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
	onEvent: ReturnType<
		typeof vi.fn<
			(
				sessionId: string,
				callback: (event: StreamEventEnvelope) => void,
			) => void
		>
	>;
} {
	return {
		cliType,
		createSession: vi.fn<(options: CreateSessionOptions) => Promise<ProviderSession>>(
			() =>
				Promise.resolve({
					sessionId: `${cliType}:mock-session-001`,
					cliType,
				}),
		),
		loadSession: vi.fn<
			(sessionId: string, options?: LoadSessionOptions) => Promise<ProviderSession>
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
		onEvent: vi.fn<
			(
				sessionId: string,
				callback: (event: StreamEventEnvelope) => void,
			) => void
		>(),
	};
}
```

**12. `tests/helpers/stream-assertions.ts`**

```typescript
import { expect } from "vitest";
import {
	streamEventEnvelopeSchema,
	type StreamEventEnvelope,
	type UpsertObject,
} from "@server/streaming";

/** Validate that an event passes Zod schema parsing */
export function assertValidEnvelope(event: unknown): StreamEventEnvelope {
	const result = streamEventEnvelopeSchema.safeParse(event);
	if (!result.success) {
		throw new Error(
			`Invalid envelope: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
		);
	}
	return result.data;
}

/** Assert that Zod schema parsing fails for the given input */
export function assertInvalidEnvelope(event: unknown): void {
	const result = streamEventEnvelopeSchema.safeParse(event);
	expect(result.success).toBe(false);
}

/** Assert upsert object has expected shape */
export function assertUpsertShape(
	upsert: UpsertObject,
	expected: {
		type?: UpsertObject["type"];
		status?: UpsertObject["status"];
		itemId?: string;
		turnId?: string;
		sessionId?: string;
	},
): void {
	if (expected.type !== undefined) expect(upsert.type).toBe(expected.type);
	if (expected.status !== undefined)
		expect(upsert.status).toBe(expected.status);
	if (expected.itemId !== undefined)
		expect(upsert.itemId).toBe(expected.itemId);
	if (expected.turnId !== undefined)
		expect(upsert.turnId).toBe(expected.turnId);
	if (expected.sessionId !== undefined)
		expect(upsert.sessionId).toBe(expected.sessionId);
}

/** Assert all events in a sequence share the same turnId */
export function assertTurnCorrelation(
	events: StreamEventEnvelope[],
	expectedTurnId: string,
): void {
	for (const event of events) {
		expect(event.turnId).toBe(expectedTurnId);
	}
}

/**
 * Assert all item-scoped payloads in a sequence share the same itemId.
 * Non-item payloads (e.g. response_start/response_done/response_error) are ignored.
 */
export function assertItemIdConsistency(
	events: StreamEventEnvelope[],
	expectedItemId: string,
): void {
	for (const event of events) {
		const payload = event.payload;
		if ("itemId" in payload) {
			expect(payload.itemId).toBe(expectedItemId);
		}
	}
}

// Backward-compatible alias
export const assertItemCorrelation = assertItemIdConsistency;
```

## Constraints
- Story 0 is setup only: no test files (`.test.ts`). Test suites are created in Story 1.
- No runtime business logic implementation (no processor, no providers, no routes).
- Files outside the list above may only be touched by `bun run format` auto-fix.
- Use path aliases (`@server/*`, `@shared/*`, `@tests/*`) for cross-directory imports.
- Reuse `NotImplementedError` from `server/errors.ts` — do not duplicate it.
- Reuse `CliType` from `server/sessions/session-types.ts` via re-export — do not redefine it.

## If Blocked or Uncertain
- If `bun install` fails for any dependency (version mismatch, registry issue), document the error and try with `latest` tag. If still blocked, document what you attempted and return to the orchestrator.
- If type imports don't resolve after dependency install, check that `tsconfig.json` includes the new directories (it should — `server/**/*.ts` covers `server/providers/` and `server/streaming/`).
- If you encounter inconsistencies between the inlined code above and any referenced document, **stop and surface the inconsistency** rather than silently resolving it.
- If `bun run format` changes files beyond the two listed (`acp-client.test.ts`, `websocket.test.ts`), that's fine — format auto-fix is safe. Note what changed.

## Verification
When complete:
1. `bun install` — no errors
2. `bun run format:check` — passes (0 errors)
3. `bun run typecheck` — passes (0 errors)
4. `bun run red-verify` — passes
5. Confirm no `.test.ts` files were created in this story

Expected: All gates pass. No new tests.

## Done When
- [ ] Dependencies installed (`zod`, `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`)
- [ ] Pre-existing format failures resolved
- [ ] All 12 new files created (9 content files + `tests/fixtures/constants.ts` + 2 barrel exports)
- [ ] `package.json` updated
- [ ] Path aliases used consistently
- [ ] `bun run red-verify` passes
- [ ] No `.test.ts` files added
- [ ] All fixtures validate against their corresponding schemas (verified manually or by import compilation)
