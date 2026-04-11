import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CanonicalHistoryStore,
	type CanonicalHistoryIndex,
} from "../../../server/streaming/canonical-history-store";
import { JsonStore } from "../../../server/store/json-store";
import type { UpsertObject } from "../../../server/streaming/upsert-types";

describe("CanonicalHistoryStore", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "liminal-canonical-history-"));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("replaces intermediate upserts with the final upsert per item while preserving semantic enrichment", () => {
		const store = new JsonStore<CanonicalHistoryIndex>(
			{
				filePath: join(tempDir, "session-upserts.json"),
				writeDebounceMs: 0,
			},
			{},
		);
		const historyStore = new CanonicalHistoryStore(store);
		const base: UpsertObject = {
			type: "message",
			status: "create",
			turnId: "turn-1",
			sessionId: "claude-code:session-1",
			itemId: "assistant-1",
			sourceTimestamp: "2026-03-05T00:00:00.000Z",
			emittedAt: "2026-03-05T00:00:00.000Z",
			content: "Hel",
			origin: "agent",
		};

		historyStore.recordUpsert("claude-code", base.sessionId, base);
		historyStore.recordUpsert("claude-code", base.sessionId, {
			...base,
			status: "update",
			emittedAt: "2026-03-05T00:00:01.000Z",
			content: "Hello",
		});
		historyStore.recordUpsert("claude-code", base.sessionId, {
			...base,
			status: "complete",
			emittedAt: "2026-03-05T00:00:02.000Z",
			content: "# Hello",
		});

		const history = historyStore.getHistory(base.sessionId);

		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({
			type: "message",
			status: "complete",
			content: "# Hello",
			semanticRole: "primary_response",
			contentFormat: "markdown",
			isPrimaryTurnOutput: true,
			itemOrder: 1,
			turnOrder: 1,
		});
	});

	it("assigns stable turn and item ordering across multiple items and turns", () => {
		const store = new JsonStore<CanonicalHistoryIndex>(
			{
				filePath: join(tempDir, "ordering.json"),
				writeDebounceMs: 0,
			},
			{},
		);
		const historyStore = new CanonicalHistoryStore(store);

		historyStore.recordUpsert("claude-code", "claude-code:session-2", {
			type: "message",
			status: "complete",
			turnId: "turn-1",
			sessionId: "claude-code:session-2",
			itemId: "user-1",
			sourceTimestamp: "2026-03-05T00:00:00.000Z",
			emittedAt: "2026-03-05T00:00:00.000Z",
			content: "hello",
			origin: "user",
		});
		historyStore.recordUpsert("claude-code", "claude-code:session-2", {
			type: "tool_call",
			status: "complete",
			turnId: "turn-2",
			sessionId: "claude-code:session-2",
			itemId: "tool-1",
			sourceTimestamp: "2026-03-05T00:00:01.000Z",
			emittedAt: "2026-03-05T00:00:01.000Z",
			toolName: "read_file",
			toolArguments: { path: "/tmp/file.ts" },
			callId: "call-1",
			toolOutput: "const answer = 42;",
		});

		const history = historyStore.getHistory("claude-code:session-2");

		expect(
			history.map((upsert) => [upsert.turnOrder, upsert.itemOrder]),
		).toEqual([
			[1, 1],
			[2, 2],
		]);
		expect(history[1]).toMatchObject({
			semanticRole: "tool_activity",
			annotationKind: "tool",
			toolArgumentsText: JSON.stringify({ path: "/tmp/file.ts" }, null, 2),
		});
	});
});
