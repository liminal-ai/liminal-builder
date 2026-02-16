import { describe, expect, it } from "vitest";
import type {
	StreamEventEnvelope,
	UpsertObject,
} from "../../../server/streaming";
import { streamEventEnvelopeSchema } from "../../../server/streaming";
import {
	TEST_EMITTED_AT,
	TEST_SESSION_ID,
	TEST_TIMESTAMP,
	TEST_TURN_ID,
} from "../../fixtures/constants";

function createEnvelope(
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

function expectInvalidWithPath(
	event: unknown,
	expectedPath: string,
	expectedMessageIncludes?: string,
): void {
	const result = streamEventEnvelopeSchema.safeParse(event);
	expect(result.success).toBe(false);
	if (result.success) {
		return;
	}

	const matchedIssue = result.error.issues.find(
		(issue) =>
			issue.path.join(".") === expectedPath &&
			(expectedMessageIncludes === undefined ||
				issue.message.includes(expectedMessageIncludes)),
	);
	expect(matchedIssue).toBeDefined();
}

function assertTurnCorrelation(
	events: StreamEventEnvelope[],
	expectedTurnId: string,
): void {
	for (const event of events) {
		expect(event.turnId).toBe(expectedTurnId);
	}
}

function assertItemIdConsistency(
	events: StreamEventEnvelope[],
	expectedItemId: string,
): void {
	for (const event of events) {
		if ("itemId" in event.payload) {
			expect(event.payload.itemId).toBe(expectedItemId);
		}
	}
}

const RESPONSE_START_FIXTURE = createEnvelope("test-event-001", {
	type: "response_start",
	modelId: "claude-sonnet-4-5-20250929",
	providerId: "claude-code",
});

const ITEM_START_REASONING_FIXTURE = createEnvelope("test-event-002", {
	type: "item_start",
	itemId: "test-item-reason-001",
	itemType: "reasoning",
});

const ITEM_START_FUNCTION_CALL_FIXTURE = createEnvelope("test-event-003", {
	type: "item_start",
	itemId: "test-item-fc-001",
	itemType: "function_call",
	name: "read_file",
	callId: "test-call-001",
});

const ITEM_START_FUNCTION_CALL_OUTPUT_FIXTURE = createEnvelope(
	"test-event-004",
	{
		type: "item_start",
		itemId: "test-item-fco-001",
		itemType: "function_call_output",
		callId: "test-call-001",
	},
);

const ITEM_DELTA_TEXT_FIXTURE = createEnvelope("test-event-005", {
	type: "item_delta",
	itemId: "test-item-msg-001",
	deltaContent: "Hello, world!",
});

const ITEM_DONE_REASONING_FIXTURE = createEnvelope("test-event-006", {
	type: "item_done",
	itemId: "test-item-reason-001",
	finalItem: {
		type: "reasoning",
		content: "Let me think about this...",
		providerId: "claude-code",
	},
});

const ITEM_DONE_FUNCTION_CALL_FIXTURE = createEnvelope("test-event-007", {
	type: "item_done",
	itemId: "test-item-fc-001",
	finalItem: {
		type: "function_call",
		name: "read_file",
		callId: "test-call-001",
		arguments: { path: "/src/index.ts" },
	},
});

const ITEM_DONE_FUNCTION_CALL_OUTPUT_FIXTURE = createEnvelope(
	"test-event-008",
	{
		type: "item_done",
		itemId: "test-item-fco-001",
		finalItem: {
			type: "function_call_output",
			callId: "test-call-001",
			output: "File contents",
			isError: false,
		},
	},
);

const ITEM_ERROR_FIXTURE = createEnvelope("test-event-009", {
	type: "item_error",
	itemId: "test-item-err-001",
	error: { code: "CONTENT_FILTER", message: "Content was filtered" },
});

const RESPONSE_DONE_COMPLETED_FIXTURE = createEnvelope("test-event-010", {
	type: "response_done",
	status: "completed",
	finishReason: "end_turn",
	usage: {
		inputTokens: 100,
		outputTokens: 250,
		cacheReadInputTokens: 50,
	},
});

const RESPONSE_ERROR_FIXTURE = createEnvelope("test-event-011", {
	type: "response_error",
	error: {
		code: "PROCESS_CRASH",
		message: "Subprocess exited unexpectedly",
	},
});

const MALFORMED_MISSING_TYPE = {
	eventId: "bad-001",
	timestamp: TEST_TIMESTAMP,
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	payload: { type: "item_delta", itemId: "x", deltaContent: "y" },
};

const MALFORMED_TYPE_MISMATCH = {
	eventId: "bad-002",
	timestamp: TEST_TIMESTAMP,
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	type: "item_start",
	payload: { type: "item_delta", itemId: "x", deltaContent: "y" },
};

const MALFORMED_BAD_TIMESTAMP = {
	eventId: "bad-003",
	timestamp: "not-a-date",
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	type: "item_delta",
	payload: { type: "item_delta", itemId: "x", deltaContent: "y" },
};

const MALFORMED_MISSING_PAYLOAD_FIELDS = {
	eventId: "bad-004",
	timestamp: TEST_TIMESTAMP,
	turnId: TEST_TURN_ID,
	sessionId: TEST_SESSION_ID,
	type: "item_start",
	payload: { type: "item_start" },
};

function createFullTurnSequence(): StreamEventEnvelope[] {
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

describe("Canonical stream contracts (Story 1, Red)", () => {
	it("TC-1.1a: item_delta text payload validates with matching envelope type and string deltaContent", () => {
		const parsed = streamEventEnvelopeSchema.parse(ITEM_DELTA_TEXT_FIXTURE);

		expect(parsed.type).toBe("item_delta");
		expect(parsed.payload.type).toBe("item_delta");
		if (parsed.payload.type !== "item_delta") {
			throw new Error("Expected item_delta payload");
		}
		expect(parsed.payload.deltaContent).toBeTypeOf("string");
	});

	it("TC-1.1b: function-call lifecycle validates across item_start -> item_delta -> item_done with consistent call correlation", () => {
		const start = streamEventEnvelopeSchema.parse(
			ITEM_START_FUNCTION_CALL_FIXTURE,
		);
		const delta = streamEventEnvelopeSchema.parse(
			createEnvelope("tc-1.1b-delta-event", {
				type: "item_delta",
				itemId: "test-item-fc-001",
				deltaContent: '{"path":"/src/index.ts"}',
			}),
		);
		const done = streamEventEnvelopeSchema.parse(
			ITEM_DONE_FUNCTION_CALL_FIXTURE,
		);

		expect(start).toMatchObject({
			payload: {
				type: "item_start",
				itemType: "function_call",
				itemId: "test-item-fc-001",
				callId: "test-call-001",
			},
		});
		expect(delta).toMatchObject({
			payload: {
				type: "item_delta",
				itemId: "test-item-fc-001",
				deltaContent: '{"path":"/src/index.ts"}',
			},
		});
		expect(done).toMatchObject({
			payload: {
				type: "item_done",
				finalItem: {
					type: "function_call",
					callId: "test-call-001",
				},
			},
		});
	});

	it("TC-1.1c: reasoning payload validates for reasoning itemType and string content", () => {
		const start = streamEventEnvelopeSchema.parse(ITEM_START_REASONING_FIXTURE);
		const done = streamEventEnvelopeSchema.parse(ITEM_DONE_REASONING_FIXTURE);

		expect(start).toMatchObject({
			payload: {
				type: "item_start",
				itemType: "reasoning",
			},
		});
		expect(done).toMatchObject({
			payload: {
				type: "item_done",
				finalItem: {
					type: "reasoning",
					content: "Let me think about this...",
				},
			},
		});
	});

	it("TC-1.1d: response lifecycle validates response_start metadata and response_done status/usage/finishReason", () => {
		const responseStart = streamEventEnvelopeSchema.parse(
			RESPONSE_START_FIXTURE,
		);
		const responseDone = streamEventEnvelopeSchema.parse(
			RESPONSE_DONE_COMPLETED_FIXTURE,
		);

		expect(responseStart.payload.type).toBe("response_start");
		expect(responseStart.turnId).toBe(TEST_TURN_ID);
		if (responseStart.payload.type !== "response_start") {
			throw new Error("Expected response_start payload");
		}
		expect(responseStart.payload.modelId).toBeTypeOf("string");
		expect(responseDone.payload.type).toBe("response_done");
		if (responseDone.payload.type !== "response_done") {
			throw new Error("Expected response_done payload");
		}
		expect(responseDone.payload.status).toBe("completed");
		expect(responseDone.payload.finishReason).toBeTypeOf("string");
		expect(responseDone.payload.usage).toBeDefined();
	});

	it("TC-1.1e: item_error and response_error payloads both validate", () => {
		const itemError = streamEventEnvelopeSchema.parse(ITEM_ERROR_FIXTURE);
		const responseError = streamEventEnvelopeSchema.parse(
			RESPONSE_ERROR_FIXTURE,
		);

		expect(itemError).toMatchObject({
			payload: {
				type: "item_error",
				error: {
					code: "CONTENT_FILTER",
					message: "Content was filtered",
				},
			},
		});
		expect(responseError).toMatchObject({
			payload: {
				type: "response_error",
				error: {
					code: "PROCESS_CRASH",
					message: "Subprocess exited unexpectedly",
				},
			},
		});
	});

	it("TC-1.1f: malformed envelopes fail schema validation with expected issue paths (including function_call item_start strictness)", () => {
		expectInvalidWithPath(MALFORMED_MISSING_TYPE, "type");
		expectInvalidWithPath(
			MALFORMED_TYPE_MISMATCH,
			"type",
			"Envelope type must match payload.type",
		);
		expectInvalidWithPath(MALFORMED_BAD_TIMESTAMP, "timestamp");
		expectInvalidWithPath(MALFORMED_MISSING_PAYLOAD_FIELDS, "payload.itemId");

		const missingNameOnFunctionCallStart = {
			...ITEM_START_FUNCTION_CALL_FIXTURE,
			payload: {
				...ITEM_START_FUNCTION_CALL_FIXTURE.payload,
				name: undefined,
			},
		};
		const missingCallIdOnFunctionCallStart = {
			...ITEM_START_FUNCTION_CALL_FIXTURE,
			payload: {
				...ITEM_START_FUNCTION_CALL_FIXTURE.payload,
				callId: undefined,
			},
		};

		expectInvalidWithPath(missingNameOnFunctionCallStart, "payload.name");
		expectInvalidWithPath(missingCallIdOnFunctionCallStart, "payload.callId");
	});

	it("TC-1.2a: all events in a turn share the same turnId", () => {
		const turnEvents = createFullTurnSequence().map((event) =>
			streamEventEnvelopeSchema.parse(event),
		);

		assertTurnCorrelation(turnEvents, TEST_TURN_ID);
	});

	it("TC-1.2b: item lifecycle events in one sequence share the same itemId", () => {
		const itemLifecycle = createFullTurnSequence()
			.map((event) => streamEventEnvelopeSchema.parse(event))
			.filter((event) => "itemId" in event.payload);

		expect(itemLifecycle.length).toBeGreaterThan(0);
		assertItemIdConsistency(itemLifecycle, "turn-item-001");
	});

	it("TC-1.2c: tool invocation/result events share the same callId", () => {
		const toolEvents = [
			streamEventEnvelopeSchema.parse(ITEM_START_FUNCTION_CALL_FIXTURE),
			streamEventEnvelopeSchema.parse(ITEM_DONE_FUNCTION_CALL_FIXTURE),
			streamEventEnvelopeSchema.parse(ITEM_START_FUNCTION_CALL_OUTPUT_FIXTURE),
			streamEventEnvelopeSchema.parse(ITEM_DONE_FUNCTION_CALL_OUTPUT_FIXTURE),
		];

		const callIds = toolEvents.map((event) => {
			if (event.payload.type === "item_start") {
				return event.payload.callId;
			}
			if (event.payload.type === "item_done") {
				if (event.payload.finalItem.type === "function_call") {
					return event.payload.finalItem.callId;
				}
				if (event.payload.finalItem.type === "function_call_output") {
					return event.payload.finalItem.callId;
				}
			}
			return undefined;
		});

		expect(callIds.every((callId) => callId === "test-call-001")).toBe(true);
	});

	it("TC-1.3a: contract types preserve provenance fields (sourceTimestamp, emittedAt) and stable correlation IDs for Phase 2", () => {
		const startedToolUpsert: UpsertObject = {
			type: "tool_call",
			status: "create",
			turnId: TEST_TURN_ID,
			sessionId: TEST_SESSION_ID,
			itemId: "upsert-item-001",
			sourceTimestamp: TEST_TIMESTAMP,
			emittedAt: TEST_EMITTED_AT,
			toolName: "read_file",
			toolArguments: { path: "/src/index.ts" },
			callId: "upsert-call-001",
		};
		const completedToolUpsert: UpsertObject = {
			...startedToolUpsert,
			status: "complete",
			toolOutput: "file contents",
			toolOutputIsError: false,
		};

		expect(startedToolUpsert.sourceTimestamp).toBe(TEST_TIMESTAMP);
		expect(startedToolUpsert.emittedAt).toBe(TEST_EMITTED_AT);
		expect(completedToolUpsert.turnId).toBe(startedToolUpsert.turnId);
		expect(completedToolUpsert.sessionId).toBe(startedToolUpsert.sessionId);
		expect(completedToolUpsert.itemId).toBe(startedToolUpsert.itemId);
		expect(completedToolUpsert.callId).toBe(startedToolUpsert.callId);
	});

	it("TC-1.3b: Phase 2 derivation boundary stays explicit by deferring turnSequenceNumber/llmTurnNumber/entryType", () => {
		const upsert: UpsertObject = {
			type: "message",
			status: "update",
			turnId: TEST_TURN_ID,
			sessionId: TEST_SESSION_ID,
			itemId: "upsert-item-002",
			sourceTimestamp: TEST_TIMESTAMP,
			emittedAt: TEST_EMITTED_AT,
			content: "delta text",
			origin: "agent",
		};

		expect("turnSequenceNumber" in upsert).toBe(false);
		expect("llmTurnNumber" in upsert).toBe(false);
		expect("entryType" in upsert).toBe(false);
	});
});
