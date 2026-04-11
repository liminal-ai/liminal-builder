import { describe, expect, it } from "vitest";
import {
	addOptimisticUserEntry,
	applyTurnEvent,
	applyUpsert,
	applyUpsertHistory,
	createEmptySessionState,
} from "../chat-state";
import type { UpsertObject } from "../types";

describe("chat-state", () => {
	it("applies history and projects assistant output into turn surfaces", () => {
		const initial = createEmptySessionState();
		const history: UpsertObject[] = [
			{
				type: "message",
				status: "complete",
				turnId: "t1",
				sessionId: "claude-code:s1",
				itemId: "i1",
				sourceTimestamp: new Date().toISOString(),
				emittedAt: new Date().toISOString(),
				content: "hello",
				origin: "user",
				itemOrder: 1,
				turnOrder: 1,
				semanticRole: "user_prompt",
			},
			{
				type: "message",
				status: "complete",
				turnId: "t1",
				sessionId: "claude-code:s1",
				itemId: "i2",
				sourceTimestamp: new Date().toISOString(),
				emittedAt: new Date().toISOString(),
				content: "# world",
				origin: "agent",
				itemOrder: 2,
				turnOrder: 1,
				semanticRole: "primary_response",
				isPrimaryTurnOutput: true,
				contentFormat: "markdown",
			},
		];

		const next = applyUpsertHistory(initial, history);

		expect(next.turns).toHaveLength(1);
		const assistantBlock = next.turns[0]?.blocks.find(
			(block) => block.type === "assistant-document",
		);
		expect(assistantBlock?.type).toBe("assistant-document");
		if (assistantBlock?.type === "assistant-document") {
			expect(assistantBlock.finalized).toBe(true);
		}
	});

	it("updates assistant content in place within a turn as upserts arrive", () => {
		const initial = createEmptySessionState();
		const createUpsert: UpsertObject = {
			type: "message",
			status: "create",
			turnId: "t1",
			sessionId: "claude-code:s1",
			itemId: "i1",
			sourceTimestamp: new Date().toISOString(),
			emittedAt: new Date().toISOString(),
			content: "he",
			origin: "agent",
			itemOrder: 1,
			turnOrder: 1,
			semanticRole: "primary_response",
			isPrimaryTurnOutput: true,
			contentFormat: "markdown",
		};

		const updateUpsert: UpsertObject = {
			...createUpsert,
			status: "update",
			content: "hello",
		};

		const completeUpsert: UpsertObject = {
			...createUpsert,
			status: "complete",
			content: "hello world",
		};

		const afterCreate = applyUpsert(initial, createUpsert);
		const afterUpdate = applyUpsert(afterCreate, updateUpsert);
		const afterComplete = applyUpsert(afterUpdate, completeUpsert);

		expect(afterComplete.turns).toHaveLength(1);
		const assistantBlock = afterComplete.turns[0]?.blocks.find(
			(block) => block.type === "assistant-document",
		);
		expect(assistantBlock?.type).toBe("assistant-document");
		if (assistantBlock?.type === "assistant-document") {
			expect(assistantBlock.content).toBe("hello world");
			expect(assistantBlock.finalized).toBe(true);
		}
	});

	it("consumes optimistic user entry when canonical user upsert arrives", () => {
		const initial = createEmptySessionState();
		const withOptimistic = addOptimisticUserEntry(initial, "hello");

		const canonicalUser: UpsertObject = {
			type: "message",
			status: "complete",
			turnId: "t1",
			sessionId: "claude-code:s1",
			itemId: "i-user",
			sourceTimestamp: new Date().toISOString(),
			emittedAt: new Date().toISOString(),
			content: "hello",
			origin: "user",
			itemOrder: 1,
			turnOrder: 1,
			semanticRole: "user_prompt",
		};

		const next = applyUpsert(withOptimistic, canonicalUser);
		expect(next.pendingOptimisticUserEntries).toHaveLength(0);
		expect(
			next.turns
				.flatMap((turn) => turn.blocks)
				.filter((block) => block.type === "user-prompt"),
		).toHaveLength(1);
	});

	it("updates streaming state on turn events", () => {
		const initial = createEmptySessionState();
		const started = applyTurnEvent(initial, {
			type: "turn_started",
			turnId: "t1",
			sessionId: "claude-code:s1",
			providerId: "claude-code",
			modelId: "claude-3",
		});
		const completed = applyTurnEvent(started, {
			type: "turn_complete",
			turnId: "t1",
			sessionId: "claude-code:s1",
			status: "completed",
		});

		expect(started.isStreaming).toBe(true);
		expect(completed.isStreaming).toBe(false);
	});
});
