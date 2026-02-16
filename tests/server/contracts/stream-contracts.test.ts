import { describe, expect, it } from "vitest";
import type { UpsertObject } from "../../../server/streaming";
import { streamEventEnvelopeSchema } from "../../../server/streaming";
import {
	TEST_EMITTED_AT,
	TEST_TIMESTAMP,
	TEST_TURN_ID,
} from "../../fixtures/constants";
import {
	ITEM_DELTA_TEXT_FIXTURE,
	ITEM_DONE_FUNCTION_CALL_FIXTURE,
	ITEM_DONE_FUNCTION_CALL_OUTPUT_FIXTURE,
	ITEM_DONE_REASONING_FIXTURE,
	ITEM_ERROR_FIXTURE,
	ITEM_START_FUNCTION_CALL_FIXTURE,
	ITEM_START_FUNCTION_CALL_OUTPUT_FIXTURE,
	ITEM_START_REASONING_FIXTURE,
	MALFORMED_BAD_TIMESTAMP,
	MALFORMED_MISSING_PAYLOAD_FIELDS,
	MALFORMED_MISSING_TYPE,
	MALFORMED_TYPE_MISMATCH,
	RESPONSE_DONE_COMPLETED_FIXTURE,
	RESPONSE_DONE_ERROR_FIXTURE,
	RESPONSE_ERROR_FIXTURE,
	RESPONSE_START_FIXTURE,
	createEnvelope,
	createFullTurnSequence,
} from "../../fixtures/stream-events";
import {
	assertItemIdConsistency,
	assertTurnCorrelation,
	assertValidEnvelope,
} from "../../helpers/stream-assertions";

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

describe("Canonical stream contracts (Story 1, Red)", () => {
	it("TC-1.1a: item_delta text payload validates with matching envelope type and string deltaContent", () => {
		const parsed = assertValidEnvelope(ITEM_DELTA_TEXT_FIXTURE);

		expect(parsed.type).toBe("item_delta");
		expect(parsed.payload.type).toBe("item_delta");
		if (parsed.payload.type !== "item_delta") {
			throw new Error("Expected item_delta payload");
		}
		expect(parsed.payload.deltaContent).toBeTypeOf("string");
	});

	it("TC-1.1b: function-call lifecycle validates across item_start -> item_delta -> item_done with consistent call correlation", () => {
		const start = assertValidEnvelope(ITEM_START_FUNCTION_CALL_FIXTURE);
		const delta = assertValidEnvelope(
			createEnvelope("tc-1.1b-delta-event", {
				type: "item_delta",
				itemId: "test-item-fc-001",
				deltaContent: '{"path":"/src/index.ts"}',
			}),
		);
		const done = assertValidEnvelope(ITEM_DONE_FUNCTION_CALL_FIXTURE);

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
		const start = assertValidEnvelope(ITEM_START_REASONING_FIXTURE);
		const done = assertValidEnvelope(ITEM_DONE_REASONING_FIXTURE);

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

	it("TC-1.1d: response lifecycle validates response_start metadata and response_done status/usage/error fields", () => {
		const responseStart = assertValidEnvelope(RESPONSE_START_FIXTURE);
		const responseDone = assertValidEnvelope(RESPONSE_DONE_COMPLETED_FIXTURE);
		const responseDoneError = assertValidEnvelope(RESPONSE_DONE_ERROR_FIXTURE);

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
		expect(responseDoneError.payload.type).toBe("response_done");
		if (responseDoneError.payload.type !== "response_done") {
			throw new Error("Expected response_done payload");
		}
		expect(responseDoneError.payload.status).toBe("error");
		expect(responseDoneError.payload.error).toEqual({
			code: "MODEL_ABORT",
			message: "Provider aborted generation",
		});
	});

	it("TC-1.1e: item_error and response_error payloads both validate", () => {
		const itemError = assertValidEnvelope(ITEM_ERROR_FIXTURE);
		const responseError = assertValidEnvelope(RESPONSE_ERROR_FIXTURE);

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
		const turnEvents = createFullTurnSequence().map(assertValidEnvelope);

		assertTurnCorrelation(turnEvents, TEST_TURN_ID);
	});

	it("TC-1.2b: item lifecycle events in one sequence share the same itemId", () => {
		const itemLifecycle = createFullTurnSequence()
			.map(assertValidEnvelope)
			.filter((event) => "itemId" in event.payload);

		expect(itemLifecycle.length).toBeGreaterThan(0);
		assertItemIdConsistency(itemLifecycle, "turn-item-001");
	});

	it("TC-1.2c: tool invocation/result events share the same callId", () => {
		const toolEvents = [
			assertValidEnvelope(ITEM_START_FUNCTION_CALL_FIXTURE),
			assertValidEnvelope(ITEM_DONE_FUNCTION_CALL_FIXTURE),
			assertValidEnvelope(ITEM_START_FUNCTION_CALL_OUTPUT_FIXTURE),
			assertValidEnvelope(ITEM_DONE_FUNCTION_CALL_OUTPUT_FIXTURE),
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
			sessionId: RESPONSE_START_FIXTURE.sessionId,
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
			sessionId: RESPONSE_START_FIXTURE.sessionId,
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
