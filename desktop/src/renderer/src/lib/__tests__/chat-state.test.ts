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
  it("applies history and finalizes assistant entries", () => {
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
      },
      {
        type: "message",
        status: "complete",
        turnId: "t1",
        sessionId: "claude-code:s1",
        itemId: "i2",
        sourceTimestamp: new Date().toISOString(),
        emittedAt: new Date().toISOString(),
        content: "world",
        origin: "agent",
      },
    ];

    const next = applyUpsertHistory(initial, history);

    expect(next.entries).toHaveLength(2);
    const assistant = next.entries[1];
    expect(assistant?.type).toBe("assistant");
    if (assistant?.type === "assistant") {
      expect(assistant.finalized).toBe(true);
    }
  });

  it("updates assistant entry in place as upserts arrive", () => {
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

    expect(afterComplete.entries).toHaveLength(1);
    const assistant = afterComplete.entries[0];
    expect(assistant?.type).toBe("assistant");
    if (assistant?.type === "assistant") {
      expect(assistant.content).toBe("hello world");
      expect(assistant.finalized).toBe(true);
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
    };

    const next = applyUpsert(withOptimistic, canonicalUser);
    expect(next.pendingOptimisticUserEntryIds).toHaveLength(0);
    expect(next.entries.filter((entry) => entry.type === "user")).toHaveLength(1);
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
