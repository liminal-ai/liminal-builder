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
