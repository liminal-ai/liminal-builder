# Prompt 6.2: Story 6 Green (Revised — No Compatibility Window)

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Bring Story 6 to green by implementing direct provider→delivery→browser pipeline wiring and migrating browser rendering to upsert semantics. No compatibility window — upsert-v1 is the only message family.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 6 red baseline exists (9 tests, all red).
- Story 0-3 + Story 4-5 suites remain green.
- `compatibility-gateway.ts` has been deleted (prompt 6.1b).
- No `session:hello` / `session:hello:ack` negotiation exists.

## Reference Documents
(For human traceability only. Execution details are inlined.)
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/story.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/story-6-pivot-addendum.md`

## Architecture Overview

The pipeline wiring this story implements:

```
Provider (onUpsert/onTurn callbacks)
    ↓
server/websocket.ts (registers callbacks, receives upserts/turns)
    ↓
server/websocket/stream-delivery.ts (wraps as session:upsert / session:turn / session:history)
    ↓
WebSocket send
    ↓
Browser portlet (renders by itemId replacement semantics)
```

There is no compatibility gateway, no family selection, no legacy message path. The browser receives only `session:upsert`, `session:turn`, and `session:history` messages for streaming content.

## Inlined Implementation Contract

### Required behavior

1. **Provider callback wiring:** When a session is created or loaded, register `onUpsert` and `onTurn` callbacks with the provider. When callbacks fire, route the upsert/turn through `stream-delivery` to the WebSocket connection that owns that session.

2. **Legacy path removal (TC-7.4a):** Remove `createPromptBridgeMessages` usage from the active `session:send` flow. Remove legacy `session:update`, `session:chunk`, `session:complete`, `session:cancelled` emission from the streaming path. The browser no longer receives these message types for streaming content.

3. **Browser upsert rendering:** The portlet receives `session:upsert` messages and renders content by `itemId`. Each upsert replaces the previous state for that `itemId` (not append). Tool calls transition through `create` → `complete` states in the same item slot. Interleaved items (different `itemId`s) render independently.

4. **Session history:** When a session is loaded, history entries are delivered as `session:history` containing an array of `UpsertObject` entries. The portlet renders these the same way it renders live upserts.

5. **Turn lifecycle:** `session:turn` messages carry `turn_started`, `turn_complete`, and `turn_error` events. The browser can use these for UI state (showing "thinking...", clearing input, showing errors).

### Type contracts
```ts
interface WsUpsertMessage { type: "session:upsert"; sessionId: string; payload: UpsertObject }
interface WsTurnMessage { type: "session:turn"; sessionId: string; payload: TurnEvent }
interface WsHistoryMessage { type: "session:history"; sessionId: string; entries: UpsertObject[] }
```

```ts
interface StreamDelivery {
  deliverUpsert(connectionId: string, sessionId: string, payload: UpsertObject): void;
  deliverTurn(connectionId: string, sessionId: string, payload: TurnEvent): void;
  deliverHistory(connectionId: string, sessionId: string, entries: UpsertObject[]): void;
}
```

### Key implementation notes

**Session-to-connection mapping:** The WebSocket handler needs to know which connection(s) should receive upserts for a given session. The current architecture is one-connection-per-browser, so the simplest approach is: when the WebSocket handler calls `sendMessage` on a provider, it also registers `onUpsert`/`onTurn` callbacks that capture the current connection's `streamDelivery` and `connectionId`. This is analogous to how the current `onEvent` callback in `sessionManager.sendMessage` captures the socket.

**Provider access — critical implementation detail:** The Epic 2 providers (`ClaudeSdkProvider`, `CodexAcpProvider`) exist as implemented classes from Stories 4-5, but they are **not instantiated in the runtime**. The provider registry (`provider-registry.ts`) is a stub. There is no connection between the `SessionManager` and the provider instances.

The actual streaming path goes through `sessionManager.sendMessage(sessionId, content, onEvent)` where `onEvent` receives `AcpUpdateEvent` objects from the ACP client layer. This is the Epic 1 path that currently works.

**The pragmatic approach for this story:** Convert `AcpUpdateEvent` objects to `UpsertObject` format inside the `onEvent` callback in `websocket.ts`, then deliver them through `streamDelivery.deliverUpsert()`. This replaces the current `createPromptBridgeMessages()` call with an ACP-to-upsert translation. Reference `server/providers/codex/codex-acp-provider.ts` method `handleSessionUpdate` for the ACP event → upsert mapping pattern.

This is a shim — the full provider wiring (where `websocket.ts` calls `provider.sendMessage()` directly and registers `onUpsert`/`onTurn`) requires the provider registry to be implemented, which is deferred. For now, the session manager continues to own metadata (titles, timestamps) and the ACP client interaction, while the streaming output format changes from legacy bridge messages to upsert objects.

**`createPromptBridgeMessages` removal:** This function translates ACP events into legacy `session:update`/`session:chunk` messages. Replace its call site with the ACP-to-upsert translation described above. The function definition may remain in the codebase if other code still references it, but it must not be called from the `session:send` handler.

## Files to Modify

### `server/websocket.ts` — PRIMARY
1. In the `session:send` handler, replace the legacy `createPromptBridgeMessages` bridge with ACP-to-upsert translation:
   - The `sessionManager.sendMessage(sessionId, content, onEvent)` call stays — it owns metadata updates (title, timestamps) and ACP client interaction
   - Inside the `onEvent` callback, replace `createPromptBridgeMessages(...)` with an ACP-event-to-`UpsertObject` conversion, then call `streamDelivery.deliverUpsert(connectionId, sessionId, upsertObject)` and/or `streamDelivery.deliverTurn(connectionId, sessionId, turnEvent)`
   - Reference `server/providers/codex/codex-acp-provider.ts` `handleSessionUpdate` for the ACP event field mapping
   - Remove legacy `session:complete` / `session:cancelled` emission from the streaming result handler — replace with `streamDelivery.deliverTurn()` for turn lifecycle
2. In the `session:open` / session load handler, deliver history via `streamDelivery.deliverHistory()` instead of legacy chat entry replay
3. Keep non-streaming WebSocket messages unchanged (project operations, session list, etc.)

### `server/websocket/stream-delivery.ts` — KEEP AS-IS
Already implemented correctly from 6.1. No changes needed unless compilation requires adjustment.

### `client/portlet/portlet.js` — IMPLEMENT UPSERT RENDERING
1. Add a `session:upsert` message handler that:
   - Looks up existing DOM element by `itemId` (or creates one if `status === "create"`)
   - Replaces content in-place for `status === "update"` or `"complete"`
   - For `type: "tool_call"`, renders tool name, arguments, and transitions from invocation to completion
   - For `type: "thinking"`, renders thinking content (may use a distinct visual treatment)
2. Add a `session:turn` message handler that:
   - On `turn_started`: show activity indicator, disable send button
   - On `turn_complete`: hide activity indicator, re-enable send button
   - On `turn_error`: display error, re-enable send button
3. Add a `session:history` message handler that:
   - Iterates entries and renders each as if it were a completed upsert
   - Clears previous content before rendering history (avoids duplication on session switch)

### `client/shell/shell.js` — SIMPLIFY
1. On WebSocket open: no `session:hello` needed (removed in 6.1b)
2. Route incoming `session:upsert`, `session:turn`, `session:history` messages to the active portlet iframe via postMessage
3. Keep all existing non-streaming message handling unchanged

### `shared/stream-contracts.ts` — KEEP AS-IS (post 6.1b)
Should already export `StreamDelivery`, `WsUpsertMessage`, `WsTurnMessage`, `WsHistoryMessage`. No compatibility types.

### `shared/types.ts` — FINALIZE HISTORY SHAPE
After converting `session:open` to emit `UpsertObject[]` history through `streamDelivery.deliverHistory()`, remove the legacy `session:history` (`ChatEntry[]`) variant from `ServerMessage`.

End state in green:
- `session:history` in `ServerMessage` should be the `WsHistoryMessage` shape (`UpsertObject[]`) only.
- No legacy `ChatEntry[]` history variant remains.

### Legacy assertion test files — UPDATE AS NEEDED
To align the rest of the suite with upsert-only streaming, you may update assertions in:
- `tests/server/websocket.test.ts`
- `tests/client/portlet.test.ts`
- `tests/client/tabs.test.ts`

## Files NOT to Modify
- Provider implementations (`claude-sdk-provider.ts`, `codex-acp-provider.ts`)
- Provider types/errors
- Session service stub (`server/api/session/session-service.ts`)
- Session routes stub (`server/api/session/routes.ts`)
- Session manager (`server/sessions/session-manager.ts`) — unless callback wiring requires it

## Allowed Test-Update Scope (Explicit)
Legacy-to-upsert assertion updates are allowed only in these existing files:
- `tests/server/websocket.test.ts`
- `tests/client/portlet.test.ts`
- `tests/client/tabs.test.ts`

These updates are specifically for replacing legacy streaming expectations (`session:update`/`session:chunk`/`session:complete`/`session:cancelled`) with upsert-v1 expectations where needed.

Do not modify any other test files in this prompt.

## Non-Goals
- No provider internal behavior rewrites
- No new API routes
- No Context/Redis integration
- No new dependencies
- No compatibility negotiation (removed)
- No legacy message family support (removed)

## Constraints
- Do NOT modify Story 6 red-baseline test files in green (`tests/server/websocket/websocket-compatibility.test.ts`, `tests/server/pipeline/pipeline-integration.test.ts`, `tests/server/pipeline/session-history-pipeline.test.ts`, `tests/client/upsert/portlet-upsert-rendering.test.ts`).
- For non-Story-6 suites, test changes are allowed only in the explicit legacy-assertion files listed above.
- Do NOT add `session:hello` / `session:hello:ack` back.
- Do NOT emit `session:update`, `session:chunk`, `session:complete`, or `session:cancelled` from the streaming delivery path.
- Do NOT modify files outside the scoped list.
- One WebSocket connection maps to one set of session callbacks. No cross-connection routing needed.

## Known Test Behaviors

**`session:hello` in pipeline/history tests:** The pipeline integration tests and session history tests send `{ type: "session:hello", streamProtocol: "upsert-v1" }` as their first message. After 6.1b removed `session:hello` from `isClientMessage`, this message type is unrecognized and produces an `{ type: "error", message: "Invalid message format" }` response. This is **harmless** — the subsequent `session:send` or `session:open` messages still route correctly, and test assertions filter for `session:upsert` messages so the extra error response is ignored. Do not attempt to fix this in test files.

**Session history format:** The `session:open` handler currently returns `ChatEntry[]` from `sessionManager.openSession()`. To emit `session:history` with `UpsertObject[]` entries, convert the `ChatEntry[]` to `UpsertObject[]` format before passing to `streamDelivery.deliverHistory()`. Map each `ChatEntry` to an `UpsertObject` with `type: "message"`, `status: "complete"`, and the relevant content/origin fields. Alternatively, check if the history pipeline tests mock the session load to return `UpsertObject[]` directly — if so, implement to match the test mock format.

## If Blocked or Uncertain

- If the test expects `createPromptBridgeMessages` to still be importable but not called, keep the function definition but remove its invocation from the active path.
- If test mocks expect a specific callback registration order, trace the test setup to see exactly how `onUpsert`/`onTurn` or `onEvent` are expected to be called.
- The providers are not instantiated in the runtime. Do NOT try to import and instantiate `ClaudeSdkProvider` or `CodexAcpProvider` in websocket.ts. The streaming translation happens inside the `sessionManager.sendMessage(onEvent)` callback as described in the Provider Access section above.
- If the TC-7.4a test checks for absence of legacy message types in output (runtime assertion), ensure the `session:send` path no longer calls `createPromptBridgeMessages` and does not emit `session:update`/`session:chunk`/`session:complete`/`session:cancelled`.
- Do NOT silently reinterpret what "legacy path removed" means. It means: no `session:update`, `session:chunk`, `session:complete`, `session:cancelled` emitted from the `session:send` streaming flow.

## Verification

When complete, run in order:

1. `bun run red-verify` — must pass (format + lint + typecheck)
2. `bunx vitest run tests/server/websocket/websocket-compatibility.test.ts` — TC-7.4a passes (1/1)
3. `bunx vitest run tests/server/pipeline/pipeline-integration.test.ts` — TC-7.1a/b/c pass (3/3)
4. `bunx vitest run tests/server/pipeline/session-history-pipeline.test.ts` — TC-7.3a/b pass (2/2)
5. `bunx vitest run tests/client/upsert/portlet-upsert-rendering.test.ts` — TC-7.2a/b/c pass (3/3)
6. `bunx vitest run tests/server/providers/claude-sdk-provider.test.ts` — Story 4 still green (14/14)
7. `bunx vitest run tests/server/providers/codex-acp-provider.test.ts` — Story 5 still green
8. `bunx vitest run tests/server/providers/provider-interface.test.ts` — conformance still green
9. `bun run green-verify` — full suite passes

Expected:
- Story 6: 9 tests pass
- No regressions in Stories 0-5
- `green-verify` passes with no out-of-scope failures

## Done When
- [ ] All 9 Story 6 tests are green
- [ ] `session:upsert` / `session:turn` / `session:history` are the only streaming message types emitted
- [ ] `createPromptBridgeMessages` is not invoked from the `session:send` handler
- [ ] Browser portlet renders upserts by `itemId` replacement
- [ ] Session history loads via `session:history` message
- [ ] Only allowed legacy-assertion test files were modified (if any): `tests/server/websocket.test.ts`, `tests/client/portlet.test.ts`, `tests/client/tabs.test.ts`
- [ ] `green-verify` passes
- [ ] No regressions in Stories 0-5

## Handoff Output Contract

Return:
- Files changed (list with line count delta)
- Story 6 test pass counts (9/9)
- Full suite results (pass/fail counts)
- How provider callbacks were wired (which code path — direct provider or through session manager)
- Whether `createPromptBridgeMessages` was deleted or just disconnected (and why)
- Any judgment calls or deviations from spec
- Any risks for Story 7 (E2E verification)
