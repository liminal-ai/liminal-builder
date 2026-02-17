# Prompt 6.1b: Story 6 Pivot — Remove Compatibility Window (Skeleton Red Delta)

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product:** Liminal Builder (Fastify + WebSocket server with browser shell/portlet client).

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Story 6 pivot — simplify pipeline wiring by removing the compatibility window and committing directly to `upsert-v1` message family.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Baseline state:**
- Story 6.1 skeleton-red has been executed. The following files exist from that run:
  - `server/websocket/stream-delivery.ts` (keep — no changes needed)
  - `server/websocket/compatibility-gateway.ts` (DELETE)
  - `server/websocket.ts` (modified — needs further modification)
  - `shared/stream-contracts.ts` (modified — needs cleanup)
  - `shared/types.ts` (modified — keep)
  - `client/portlet/portlet.js` (modified — keep)
  - `client/shell/shell.js` (modified — needs simplification)
  - `tests/server/websocket/websocket-compatibility.test.ts` (REWRITE)
  - `tests/server/pipeline/pipeline-integration.test.ts` (keep — no changes)
  - `tests/server/pipeline/session-history-pipeline.test.ts` (keep — no changes)
  - `tests/client/upsert/portlet-upsert-rendering.test.ts` (keep — no changes)
- Stories 0-5 are green.

## What Changed and Why

The compatibility window (`session:hello` negotiation, per-connection family routing, dual-path legacy+upsert emission) has been removed from Story 6 scope. This is a greenfield app with zero external consumers of the legacy message format. The browser client is being rewritten in this same story. There is no migration audience.

Story 6 now commits directly to `upsert-v1`: providers emit upserts → `stream-delivery.ts` wraps them as WebSocket messages → browser renders them. No negotiation, no dual paths, no compatibility gateway.

See `story-6-pivot-addendum.md` in this directory for full rationale.

## Specific Changes Required

### 1. DELETE `server/websocket/compatibility-gateway.ts`

Remove this file entirely. Its responsibility (family selection, dual-path routing) no longer exists.

### 2. REWRITE `tests/server/websocket/websocket-compatibility.test.ts`

The current file has 3 tests for compatibility window behavior. Replace with 1 test:

**New test (replaces TC-6.4a and TC-6.4c):**
- `TC-7.4a: legacy message emission paths are removed from active streaming flow`
  - Use a **runtime assertion**, not source-text reading. Do NOT use `readFileSync` to check source code.
  - Exercise a mock send flow: create a mock WebSocket, call `handleWebSocket`, send a `session:send` message, collect all outbound messages.
  - Assert that NO legacy streaming message types appear in the output: `session:update`, `session:chunk`, `session:complete`, `session:cancelled`.
  - Assert that upsert streaming message types DO appear: `session:upsert` and/or `session:turn`.
  - This test is correctly red because the current code still emits legacy messages and does not emit upsert messages.

Example structure for the test:
```ts
it("TC-7.4a: legacy message emission paths are removed from active streaming flow", async () => {
    const socket = createMockSocket();
    handleWebSocket(socket, createDeps());

    await sendMessage(socket, {
        type: "session:send",
        sessionId: "claude-code:test-session",
        content: "hello",
    });

    const messages = socket.getSentMessages();
    const legacyTypes = new Set(["session:update", "session:chunk", "session:complete", "session:cancelled"]);
    const hasLegacy = messages.some(m => legacyTypes.has(m.type));
    const hasUpsert = messages.some(m => m.type === "session:upsert" || m.type === "session:turn");

    expect(hasLegacy).toBe(false);
    expect(hasUpsert).toBe(true);
});
```

Rename the file to `tests/server/websocket/websocket-delivery.test.ts` to reflect its new purpose (optional — acceptable to keep current name if simpler).

### 3. MODIFY `server/websocket.ts`

Remove all compatibility-gateway integration added by 6.1:

- Remove `import { createCompatibilityGateway }` and the gateway instantiation
- Remove `ConnectionState` type
- Remove `session:hello` case from `isClientMessage` and `routeMessage`
- Remove `session:hello:ack` response
- Remove `connectionState` and `compatibilityGateway` parameters threaded through `handleIncomingMessage` and `routeMessage`
- Remove the `compatibilityGateway.deliver(connectionState.context, { legacy: ... })` wrapping — the legacy bridge messages that were wrapped should now be left as-is temporarily (they will be replaced in the green phase with direct `stream-delivery` calls)

Keep:
- The `connectionId` generation (useful for delivery targeting)
- The `createStreamDelivery` import and instantiation (this is the delivery module we're keeping)

The net effect on `websocket.ts` after this prompt: it should look close to the pre-6.1 state but with `connectionId` and `streamDelivery` available as local state for the green prompt to wire.

### 4. MODIFY `shared/stream-contracts.ts`

Remove:
- `StreamProtocolFamily` type
- `ConnectionCapabilities` interface
- `ConnectionContext` interface
- `CompatibilityGateway` interface

Keep:
- `StreamDelivery` interface
- `WsUpsertMessage`, `WsTurnMessage`, `WsHistoryMessage` types
- Any re-exports of `UpsertObject`, `TurnEvent` needed by browser/shared code

### 5. MODIFY `client/shell/shell.js`

Remove:
- Any `session:hello` send on WebSocket open
- Any `session:hello:ack` handler
- Any `selectedFamily` tracking

The shell should open the WebSocket and immediately be ready for `session:upsert`/`session:turn`/`session:history` messages. No negotiation.

### 6. MODIFY `shared/types.ts`

Do **not** remove the legacy `session:history` (`ChatEntry[]`) variant yet in 6.1b.

For this red-adjustment step, keep `ServerMessage` temporarily permissive for history:
- keep `WsHistoryMessage` (`UpsertObject[]`) in the union, and
- keep the legacy `session:history` (`ChatEntry[]`) variant if it exists.

Reason: `websocket.ts` still emits legacy `session:history` payloads in 6.1b. Removing the legacy variant in red can force premature conversion work and create compile friction.  
The legacy `session:history` union member will be removed in 6.2 after the `session:open` path is converted to emit `UpsertObject[]` through `streamDelivery.deliverHistory()`.

### 7. NO CHANGES to these files (keep 6.1 output as-is):
- `server/websocket/stream-delivery.ts`
- `tests/server/pipeline/pipeline-integration.test.ts`
- `tests/server/pipeline/session-history-pipeline.test.ts`
- `tests/client/upsert/portlet-upsert-rendering.test.ts`
- `client/portlet/portlet.js`

## Revised TC Map

After this prompt, Story 6 has **9 tests** across 4 test files:

| File | Tests | TCs |
|---|---|---|
| `tests/server/websocket/websocket-compatibility.test.ts` | 1 | TC-7.4a |
| `tests/server/pipeline/pipeline-integration.test.ts` | 3 | TC-7.1a, TC-7.1b, TC-7.1c |
| `tests/server/pipeline/session-history-pipeline.test.ts` | 2 | TC-7.3a, TC-7.3b |
| `tests/client/upsert/portlet-upsert-rendering.test.ts` | 3 | TC-7.2a, TC-7.2b, TC-7.2c |

Removed: TC-6.4a, TC-6.4c (compatibility window tests — no longer applicable).

## Non-Goals
- Do NOT implement any green behavior. This is a red-baseline adjustment only.
- Do NOT modify provider code.
- Do NOT modify pipeline or rendering tests (they are correct as-is).
- Do NOT add new dependencies.

## Constraints
- Keep all 8 existing pipeline/rendering/history tests unchanged.
- The new TC-7.4a test should be red (failing) — it asserts legacy paths are removed, which hasn't happened yet.
- The existing 8 tests should remain red (they test delivery behavior not yet implemented).
- `bun run red-verify` must pass (compiles, lints, typechecks — tests fail is expected).

## Verification

When complete, run in order:

1. `bun run red-verify` — must pass
2. `bunx vitest run tests/server/websocket/ tests/server/pipeline/ tests/client/upsert/` — 9 tests exist, all red/failing
3. Confirm `server/websocket/compatibility-gateway.ts` does not exist
4. Confirm no references to `CompatibilityGateway`, `ConnectionCapabilities`, `StreamProtocolFamily`, `session:hello` remain in server code
5. `bun run guard:test-baseline-record` — record updated baseline

## Done When
- [ ] `compatibility-gateway.ts` deleted
- [ ] Compatibility types removed from `shared/stream-contracts.ts`
- [ ] `session:hello` / `session:hello:ack` removed from `websocket.ts` and `shell.js`
- [ ] `websocket-compatibility.test.ts` has 1 test (TC-7.4a), not 3
- [ ] 9 total Story 6 tests exist, all red
- [ ] `bun run red-verify` passes
- [ ] No compilation errors from removed imports

## Handoff Output Contract

Return:
- Files deleted
- Files modified
- Final test count per file
- `red-verify` result
- Any issues encountered
