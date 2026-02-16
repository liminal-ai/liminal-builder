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

export const ITEM_START_FUNCTION_CALL_FIXTURE = createEnvelope(
	"test-event-004",
	{
		type: "item_start",
		itemId: "test-item-fc-001",
		itemType: "function_call",
		name: "read_file",
		callId: "test-call-001",
	},
);

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

export const ITEM_DONE_FUNCTION_CALL_FIXTURE = createEnvelope(
	"test-event-010",
	{
		type: "item_done",
		itemId: "test-item-fc-001",
		finalItem: {
			type: "function_call",
			name: "read_file",
			callId: "test-call-001",
			arguments: { path: "/src/index.ts" },
		},
	},
);

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

export const RESPONSE_DONE_COMPLETED_FIXTURE = createEnvelope(
	"test-event-014",
	{
		type: "response_done",
		status: "completed",
		finishReason: "end_turn",
		usage: {
			inputTokens: 100,
			outputTokens: 250,
			cacheReadInputTokens: 50,
		},
	},
);

export const RESPONSE_DONE_CANCELLED_FIXTURE = createEnvelope(
	"test-event-015",
	{
		type: "response_done",
		status: "cancelled",
	},
);

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
