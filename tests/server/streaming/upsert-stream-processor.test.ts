import { describe, expect, it, vi } from "vitest";
import type {
	MessageUpsert,
	ToolCallUpsert,
	TurnEvent,
	UpsertObject,
	UpsertProcessorConfig,
} from "../../../server/streaming/upsert-types";
import { UpsertStreamProcessor } from "../../../server/streaming/upsert-stream-processor";
import {
	TEST_SESSION_ID,
	TEST_TIMESTAMP,
	TEST_TURN_ID,
} from "../../fixtures/constants";
import { createEnvelope } from "../../fixtures/stream-events";
import { assertUpsertShape } from "../../helpers/stream-assertions";

function countBatchTokens(text: string): number {
	return (text.match(/\S+/g) ?? []).length;
}

function createHarness(options: Partial<UpsertProcessorConfig> = {}): {
	processor: UpsertStreamProcessor;
	upserts: UpsertObject[];
	turns: TurnEvent[];
} {
	const upserts: UpsertObject[] = [];
	const turns: TurnEvent[] = [];
	let offsetMs = 0;

	const processor = new UpsertStreamProcessor(
		{
			onUpsert: (upsert) => {
				upserts.push(upsert);
			},
			onTurn: (event) => {
				turns.push(event);
			},
			now: () =>
				new Date(Date.parse(TEST_TIMESTAMP) + offsetMs++).toISOString(),
		},
		options,
	);

	return {
		processor,
		upserts,
		turns,
	};
}

function getMessageUpserts(upserts: UpsertObject[]): MessageUpsert[] {
	return upserts.filter(
		(upsert): upsert is MessageUpsert => upsert.type === "message",
	);
}

function getCompletedToolCallUpserts(
	upserts: UpsertObject[],
): ToolCallUpsert[] {
	return upserts.filter(
		(upsert): upsert is ToolCallUpsert =>
			upsert.type === "tool_call" && upsert.status === "complete",
	);
}

describe("UpsertStreamProcessor (Story 2, Red)", () => {
	it("TC-5.1a: simple text lifecycle emits create then complete with accumulated content", () => {
		const { processor, upserts } = createHarness({ batchGradientTokens: [1] });

		processor.process(
			createEnvelope("tc-5.1a-001", {
				type: "item_start",
				itemId: "msg-5.1a",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.1a-002", {
				type: "item_delta",
				itemId: "msg-5.1a",
				deltaContent: "hello ",
			}),
		);
		processor.process(
			createEnvelope("tc-5.1a-003", {
				type: "item_done",
				itemId: "msg-5.1a",
				finalItem: {
					type: "message",
					content: "hello world",
					origin: "agent",
				},
			}),
		);

		expect(upserts).toHaveLength(2);
		assertUpsertShape(upserts[0], {
			type: "message",
			status: "create",
			itemId: "msg-5.1a",
		});
		assertUpsertShape(upserts[1], {
			type: "message",
			status: "complete",
			itemId: "msg-5.1a",
		});
		if (upserts[1].type !== "message") {
			throw new Error("Expected message complete upsert");
		}
		expect(upserts[1].content).toBe("hello world");
	});

	it("TC-5.1b: intermediate emissions contain full accumulated text", () => {
		const { processor, upserts } = createHarness({
			batchGradientTokens: [1, 1, 1],
		});

		processor.process(
			createEnvelope("tc-5.1b-001", {
				type: "item_start",
				itemId: "msg-5.1b",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.1b-002", {
				type: "item_delta",
				itemId: "msg-5.1b",
				deltaContent: "alpha beta",
			}),
		);
		processor.process(
			createEnvelope("tc-5.1b-003", {
				type: "item_delta",
				itemId: "msg-5.1b",
				deltaContent: " gamma",
			}),
		);
		processor.process(
			createEnvelope("tc-5.1b-004", {
				type: "item_done",
				itemId: "msg-5.1b",
				finalItem: {
					type: "message",
					content: "alpha beta gamma",
					origin: "agent",
				},
			}),
		);

		const messageUpserts = getMessageUpserts(upserts);
		expect(messageUpserts.length).toBeGreaterThanOrEqual(3);
		expect(messageUpserts.some((upsert) => upsert.status === "update")).toBe(
			true,
		);
		const finalContent = messageUpserts.at(-1)?.content ?? "";
		expect(
			messageUpserts.every((upsert) => finalContent.startsWith(upsert.content)),
		).toBe(true);
		expect(messageUpserts.every((upsert) => upsert.content.length > 0)).toBe(
			true,
		);
		expect(messageUpserts.at(-1)?.content).toBe("alpha beta gamma");
	});

	it("TC-5.1c: tool call emits invocation create and correlated completion complete only", () => {
		const { processor, upserts } = createHarness();

		processor.process(
			createEnvelope("tc-5.1c-001", {
				type: "item_start",
				itemId: "fc-invocation-5.1c",
				itemType: "function_call",
				name: "read_file",
				callId: "call-5.1c",
			}),
		);
		processor.process(
			createEnvelope("tc-5.1c-002", {
				type: "item_done",
				itemId: "fc-invocation-5.1c",
				finalItem: {
					type: "function_call",
					name: "read_file",
					callId: "call-5.1c",
					arguments: { path: "/tmp/file.ts" },
				},
			}),
		);
		processor.process(
			createEnvelope("tc-5.1c-003", {
				type: "item_start",
				itemId: "fc-output-5.1c",
				itemType: "function_call_output",
				callId: "call-5.1c",
			}),
		);
		processor.process(
			createEnvelope("tc-5.1c-004", {
				type: "item_done",
				itemId: "fc-output-5.1c",
				finalItem: {
					type: "function_call_output",
					callId: "call-5.1c",
					output: "ok",
					isError: false,
				},
			}),
		);

		expect(upserts).toHaveLength(2);
		assertUpsertShape(upserts[0], {
			type: "tool_call",
			status: "create",
			itemId: "fc-invocation-5.1c",
		});
		assertUpsertShape(upserts[1], {
			type: "tool_call",
			status: "complete",
			itemId: "fc-invocation-5.1c",
		});
	});

	it("TC-5.1d: reasoning events emit thinking upserts", () => {
		const { processor, upserts } = createHarness({ batchGradientTokens: [1] });

		processor.process(
			createEnvelope("tc-5.1d-001", {
				type: "item_start",
				itemId: "reason-5.1d",
				itemType: "reasoning",
			}),
		);
		processor.process(
			createEnvelope("tc-5.1d-002", {
				type: "item_delta",
				itemId: "reason-5.1d",
				deltaContent: "thinking...",
			}),
		);
		processor.process(
			createEnvelope("tc-5.1d-003", {
				type: "item_done",
				itemId: "reason-5.1d",
				finalItem: {
					type: "reasoning",
					content: "thinking... done",
					providerId: "claude-code",
				},
			}),
		);

		expect(upserts.length).toBeGreaterThanOrEqual(2);
		expect(upserts[0]?.type).toBe("thinking");
		expect(upserts.at(-1)?.type).toBe("thinking");
		expect(upserts.at(-1)?.status).toBe("complete");
	});

	it("TC-5.2a: early small thresholds emit frequently", () => {
		const { processor, upserts } = createHarness({
			batchGradientTokens: [1, 2, 3, 4, 5],
		});

		processor.process(
			createEnvelope("tc-5.2a-001", {
				type: "item_start",
				itemId: "msg-5.2a",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.2a-002", {
				type: "item_delta",
				itemId: "msg-5.2a",
				deltaContent: "one two",
			}),
		);
		processor.process(
			createEnvelope("tc-5.2a-003", {
				type: "item_delta",
				itemId: "msg-5.2a",
				deltaContent: " three",
			}),
		);
		processor.process(
			createEnvelope("tc-5.2a-004", {
				type: "item_delta",
				itemId: "msg-5.2a",
				deltaContent: " four",
			}),
		);
		processor.process(
			createEnvelope("tc-5.2a-005", {
				type: "item_done",
				itemId: "msg-5.2a",
				finalItem: {
					type: "message",
					content: "one two three four",
					origin: "agent",
				},
			}),
		);

		const messageUpserts = getMessageUpserts(upserts);
		expect(messageUpserts.length).toBeGreaterThanOrEqual(3);
	});

	it("TC-5.2b: later thresholds emit less frequently", () => {
		const { processor, upserts } = createHarness({
			batchGradientTokens: [1, 40, 120],
		});

		processor.process(
			createEnvelope("tc-5.2b-001", {
				type: "item_start",
				itemId: "msg-5.2b",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.2b-002", {
				type: "item_delta",
				itemId: "msg-5.2b",
				deltaContent: "one two",
			}),
		);
		processor.process(
			createEnvelope("tc-5.2b-003", {
				type: "item_delta",
				itemId: "msg-5.2b",
				deltaContent:
					" three four five six seven eight nine ten eleven twelve thirteen fourteen",
			}),
		);
		processor.process(
			createEnvelope("tc-5.2b-004", {
				type: "item_done",
				itemId: "msg-5.2b",
				finalItem: {
					type: "message",
					content:
						"one two three four five six seven eight nine ten eleven twelve thirteen fourteen",
					origin: "agent",
				},
			}),
		);

		const messageUpserts = getMessageUpserts(upserts);
		const updateCount = messageUpserts.filter(
			(upsert) => upsert.status === "update",
		).length;
		expect(updateCount).toBeLessThanOrEqual(1);
	});

	it("TC-5.2c: strict > threshold behavior enforced", () => {
		const { processor, upserts } = createHarness({ batchGradientTokens: [3] });

		processor.process(
			createEnvelope("tc-5.2c-001", {
				type: "item_start",
				itemId: "msg-5.2c",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.2c-002", {
				type: "item_delta",
				itemId: "msg-5.2c",
				deltaContent: "one two three",
			}),
		);
		expect(upserts).toHaveLength(0);

		processor.process(
			createEnvelope("tc-5.2c-003", {
				type: "item_delta",
				itemId: "msg-5.2c",
				deltaContent: " four",
			}),
		);

		expect(upserts).toHaveLength(1);
		assertUpsertShape(upserts[0], { type: "message", status: "create" });
		if (upserts[0].type !== "message") {
			throw new Error("Expected message create upsert");
		}
		expect(countBatchTokens(upserts[0].content)).toBe(4);
	});

	it("TC-5.2d: one large delta crossing multiple thresholds emits once and advances batch index", () => {
		const { processor, upserts } = createHarness({
			batchGradientTokens: [2, 4, 8],
		});

		processor.process(
			createEnvelope("tc-5.2d-001", {
				type: "item_start",
				itemId: "msg-5.2d",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.2d-002", {
				type: "item_delta",
				itemId: "msg-5.2d",
				deltaContent: "one two three four five six seven eight nine ten",
			}),
		);
		const messageUpsertsAfterLargeDelta = getMessageUpserts(upserts);
		expect(messageUpsertsAfterLargeDelta).toHaveLength(1);
		expect(
			countBatchTokens(messageUpsertsAfterLargeDelta[0]?.content ?? ""),
		).toBe(10);

		processor.process(
			createEnvelope("tc-5.2d-003", {
				type: "item_delta",
				itemId: "msg-5.2d",
				deltaContent: " eleven",
			}),
		);
		expect(getMessageUpserts(upserts)).toHaveLength(1);
	});

	it("TC-5.2e: final gradient value repeats indefinitely after exhaustion", () => {
		const { processor, upserts } = createHarness({
			batchGradientTokens: [1, 2],
		});

		processor.process(
			createEnvelope("tc-5.2e-001", {
				type: "item_start",
				itemId: "msg-5.2e",
				itemType: "message",
			}),
		);

		for (let index = 1; index <= 10; index += 1) {
			processor.process(
				createEnvelope(`tc-5.2e-delta-${index}`, {
					type: "item_delta",
					itemId: "msg-5.2e",
					deltaContent: ` token${index}`,
				}),
			);
		}

		const tokenCounts = getMessageUpserts(upserts)
			.filter((upsert) => upsert.status !== "complete")
			.map((upsert) => countBatchTokens(upsert.content));
		expect(tokenCounts).toEqual([2, 5, 8]);
	});

	it("TC-5.2f: defaults initialize as [10, 20, 40, 80, 120], including when [] is provided", () => {
		const { processor: defaultProcessor, upserts: defaultUpserts } =
			createHarness();
		const { processor: emptyProcessor, upserts: emptyUpserts } = createHarness({
			batchGradientTokens: [],
		});

		defaultProcessor.process(
			createEnvelope("tc-5.2f-default-001", {
				type: "item_start",
				itemId: "msg-5.2f-default",
				itemType: "message",
			}),
		);
		defaultProcessor.process(
			createEnvelope("tc-5.2f-default-002", {
				type: "item_delta",
				itemId: "msg-5.2f-default",
				deltaContent: "one two three four five six seven eight nine ten",
			}),
		);
		defaultProcessor.process(
			createEnvelope("tc-5.2f-default-003", {
				type: "item_delta",
				itemId: "msg-5.2f-default",
				deltaContent: " eleven",
			}),
		);

		emptyProcessor.process(
			createEnvelope("tc-5.2f-empty-001", {
				type: "item_start",
				itemId: "msg-5.2f-empty",
				itemType: "message",
			}),
		);
		emptyProcessor.process(
			createEnvelope("tc-5.2f-empty-002", {
				type: "item_delta",
				itemId: "msg-5.2f-empty",
				deltaContent: "one two three four five six seven eight nine ten",
			}),
		);
		emptyProcessor.process(
			createEnvelope("tc-5.2f-empty-003", {
				type: "item_delta",
				itemId: "msg-5.2f-empty",
				deltaContent: " eleven",
			}),
		);

		expect(defaultUpserts).toHaveLength(1);
		expect(emptyUpserts).toHaveLength(1);
	});

	it("TC-5.3a: function_call_output correlates to original invocation item by callId", () => {
		const { processor, upserts } = createHarness();

		processor.process(
			createEnvelope("tc-5.3a-001", {
				type: "item_start",
				itemId: "tool-invocation-5.3a",
				itemType: "function_call",
				name: "search",
				callId: "call-5.3a",
			}),
		);
		processor.process(
			createEnvelope("tc-5.3a-002", {
				type: "item_start",
				itemId: "tool-output-5.3a",
				itemType: "function_call_output",
				callId: "call-5.3a",
			}),
		);
		processor.process(
			createEnvelope("tc-5.3a-003", {
				type: "item_done",
				itemId: "tool-output-5.3a",
				finalItem: {
					type: "function_call_output",
					callId: "call-5.3a",
					output: "search results",
					isError: false,
				},
			}),
		);

		expect(upserts).toHaveLength(2);
		assertUpsertShape(upserts[0], {
			type: "tool_call",
			status: "create",
			itemId: "tool-invocation-5.3a",
		});
		assertUpsertShape(upserts[1], {
			type: "tool_call",
			status: "complete",
			itemId: "tool-invocation-5.3a",
		});
	});

	it("TC-5.3b: interleaved concurrent tool calls stay independently correlated", () => {
		const { processor, upserts } = createHarness();

		processor.process(
			createEnvelope("tc-5.3b-001", {
				type: "item_start",
				itemId: "tool-a",
				itemType: "function_call",
				name: "read_file",
				callId: "call-a",
			}),
		);
		processor.process(
			createEnvelope("tc-5.3b-002", {
				type: "item_start",
				itemId: "tool-b",
				itemType: "function_call",
				name: "list_files",
				callId: "call-b",
			}),
		);
		processor.process(
			createEnvelope("tc-5.3b-003", {
				type: "item_start",
				itemId: "tool-b-output",
				itemType: "function_call_output",
				callId: "call-b",
			}),
		);
		processor.process(
			createEnvelope("tc-5.3b-004", {
				type: "item_done",
				itemId: "tool-b-output",
				finalItem: {
					type: "function_call_output",
					callId: "call-b",
					output: "[]",
					isError: false,
				},
			}),
		);
		processor.process(
			createEnvelope("tc-5.3b-005", {
				type: "item_start",
				itemId: "tool-a-output",
				itemType: "function_call_output",
				callId: "call-a",
			}),
		);
		processor.process(
			createEnvelope("tc-5.3b-006", {
				type: "item_done",
				itemId: "tool-a-output",
				finalItem: {
					type: "function_call_output",
					callId: "call-a",
					output: "file.ts",
					isError: false,
				},
			}),
		);

		const completeByCallId = getCompletedToolCallUpserts(upserts)
			.map((upsert) => ({ itemId: upsert.itemId, callId: upsert.callId }))
			.sort((left, right) => left.callId.localeCompare(right.callId));

		expect(completeByCallId).toEqual([
			{ itemId: "tool-a", callId: "call-a" },
			{ itemId: "tool-b", callId: "call-b" },
		]);
	});

	it("TC-5.4a: destroy mid-stream flushes buffered content as upsert error, never complete", () => {
		const { processor, upserts } = createHarness({
			batchGradientTokens: [100],
		});

		processor.process(
			createEnvelope("tc-5.4a-001", {
				type: "item_start",
				itemId: "msg-5.4a",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4a-002", {
				type: "item_delta",
				itemId: "msg-5.4a",
				deltaContent: "partial data",
			}),
		);
		processor.destroy({
			code: "PROCESS_CRASH",
			message: "Subprocess exited unexpectedly",
		});

		expect(upserts).toHaveLength(1);
		assertUpsertShape(upserts[0], {
			status: "error",
			type: "message",
			itemId: "msg-5.4a",
		});
		expect(upserts.some((upsert) => upsert.status === "complete")).toBe(false);
		expect(upserts[0]?.errorCode).toBe("PROCESS_CRASH");
		expect(upserts[0]?.errorMessage).toBe("Subprocess exited unexpectedly");
	});

	it("TC-5.4b: timeout flush emits buffered content after configured delay", () => {
		vi.useFakeTimers();

		try {
			const { processor, upserts } = createHarness({
				batchGradientTokens: [100],
				batchTimeoutMs: 50,
			});

			processor.process(
				createEnvelope("tc-5.4b-001", {
					type: "item_start",
					itemId: "msg-5.4b",
					itemType: "message",
				}),
			);
			processor.process(
				createEnvelope("tc-5.4b-002", {
					type: "item_delta",
					itemId: "msg-5.4b",
					deltaContent: "one two",
				}),
			);
			expect(upserts).toHaveLength(0);

			vi.advanceTimersByTime(49);
			expect(upserts).toHaveLength(0);

			vi.advanceTimersByTime(1);
			expect(upserts).toHaveLength(1);
			assertUpsertShape(upserts[0], { type: "message", itemId: "msg-5.4b" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("TC-5.4c: empty start->done emits one complete upsert with empty content", () => {
		const { processor, upserts } = createHarness();

		processor.process(
			createEnvelope("tc-5.4c-001", {
				type: "item_start",
				itemId: "msg-5.4c",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4c-002", {
				type: "item_done",
				itemId: "msg-5.4c",
				finalItem: {
					type: "message",
					content: "",
					origin: "agent",
				},
			}),
		);

		expect(upserts).toHaveLength(1);
		assertUpsertShape(upserts[0], {
			type: "message",
			status: "complete",
			itemId: "msg-5.4c",
		});
		if (upserts[0].type !== "message") {
			throw new Error("Expected message complete upsert");
		}
		expect(upserts[0].content).toBe("");
	});

	it("TC-5.4d: cancelled items are discarded with no item upsert emission", () => {
		const { processor, upserts } = createHarness({
			batchGradientTokens: [100],
		});

		processor.process(
			createEnvelope("tc-5.4d-001", {
				type: "item_start",
				itemId: "msg-5.4d",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4d-002", {
				type: "item_delta",
				itemId: "msg-5.4d",
				deltaContent: "buffered text",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4d-003", {
				type: "item_cancelled",
				itemId: "msg-5.4d",
				reason: "user_cancel",
			}),
		);

		expect(upserts).toHaveLength(0);
	});

	it("TC-5.4e: turn cancellation represented at turn lifecycle level without mislabeling items", () => {
		const { processor, upserts, turns } = createHarness();

		processor.process(
			createEnvelope("tc-5.4e-001", {
				type: "response_start",
				modelId: "claude-sonnet-4-5-20250929",
				providerId: "claude-code",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4e-002", {
				type: "item_start",
				itemId: "msg-5.4e",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4e-003", {
				type: "item_cancelled",
				itemId: "msg-5.4e",
				reason: "user_cancel",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4e-004", {
				type: "response_done",
				status: "cancelled",
			}),
		);

		expect(turns).toContainEqual({
			type: "turn_started",
			turnId: TEST_TURN_ID,
			sessionId: TEST_SESSION_ID,
			modelId: "claude-sonnet-4-5-20250929",
			providerId: "claude-code",
		});
		expect(turns).toContainEqual({
			type: "turn_complete",
			turnId: TEST_TURN_ID,
			sessionId: TEST_SESSION_ID,
			status: "cancelled",
		});
		expect(upserts).toHaveLength(0);
	});

	it("TC-5.4f: failed turns emit a single terminal turn_error with precedence fallback, and ignore late post-terminal events", () => {
		const { processor, turns, upserts } = createHarness();

		processor.process(
			createEnvelope("tc-5.4f-001", {
				type: "response_start",
				modelId: "claude-sonnet-4-5-20250929",
				providerId: "claude-code",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-002", {
				type: "response_error",
				error: {
					code: "PROCESS_CRASH",
					message: "Subprocess exited unexpectedly",
				},
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-003", {
				type: "response_done",
				status: "error",
				error: {
					code: "MODEL_ABORT",
					message: "Should be ignored after response_error",
				},
				finishReason: "legacy_fallback_should_not_win",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-004", {
				type: "item_start",
				itemId: "late-msg-5.4f",
				itemType: "message",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-005", {
				type: "item_delta",
				itemId: "late-msg-5.4f",
				deltaContent: "should not emit",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-006", {
				type: "item_done",
				itemId: "late-msg-5.4f",
				finalItem: {
					type: "message",
					content: "should not emit",
					origin: "agent",
				},
			}),
		);

		const terminalErrorsAfterDualTerminal = turns.filter(
			(event): event is Extract<TurnEvent, { type: "turn_error" }> =>
				event.type === "turn_error",
		);
		expect(terminalErrorsAfterDualTerminal).toHaveLength(1);
		expect(terminalErrorsAfterDualTerminal[0]).toEqual({
			type: "turn_error",
			turnId: TEST_TURN_ID,
			sessionId: TEST_SESSION_ID,
			errorCode: "PROCESS_CRASH",
			errorMessage: "Subprocess exited unexpectedly",
		});
		expect(upserts).toHaveLength(0);

		processor.process(
			createEnvelope("tc-5.4f-007", {
				type: "response_start",
				modelId: "claude-sonnet-4-5-20250929",
				providerId: "claude-code",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-008", {
				type: "response_done",
				status: "error",
				error: {
					code: "MODEL_ABORT",
					message: "Provider aborted generation",
				},
				finishReason: "legacy_fallback_should_not_win",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-009", {
				type: "response_start",
				modelId: "claude-sonnet-4-5-20250929",
				providerId: "claude-code",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-010", {
				type: "response_done",
				status: "error",
				finishReason: "RATE_LIMIT",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-011", {
				type: "response_start",
				modelId: "claude-sonnet-4-5-20250929",
				providerId: "claude-code",
			}),
		);
		processor.process(
			createEnvelope("tc-5.4f-012", {
				type: "response_done",
				status: "error",
			}),
		);

		const turnErrors = turns.filter(
			(event): event is Extract<TurnEvent, { type: "turn_error" }> =>
				event.type === "turn_error",
		);
		expect(turnErrors).toHaveLength(4);
		expect(turnErrors[1]).toMatchObject({
			errorCode: "MODEL_ABORT",
			errorMessage: "Provider aborted generation",
		});
		expect(turnErrors[2]).toMatchObject({
			errorCode: "RATE_LIMIT",
			errorMessage: "Response finished with error status",
		});
		expect(turnErrors[3]).toMatchObject({
			errorCode: "RESPONSE_ERROR",
			errorMessage: "Response finished with error status",
		});
		expect(turns.some((event) => event.type === "turn_complete")).toBe(false);
	});
});
