# Prompt 6.1: Story 6 Skeleton + Red

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product:** Liminal Builder (Fastify + WebSocket server with browser shell/portlet client).

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Feature:** Provider callback outputs -> WebSocket delivery -> browser upsert rendering.

**Story:** Story 6 (Tech Design Chunk 5) implements pipeline wiring + browser migration under a compatibility window.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 0-3 are green.
- Story 4 + Story 5 provider contracts are stable (`onUpsert`/`onTurn`, turn-start send semantics).
- Session service callback-to-delivery ownership is already wired from Story 3/4/5; Story 6 may touch `session-service.ts` only if objectively required.

## Reference Documents
(For human traceability only. Execution details are inlined below.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/story.md`

## Inlined Contract Snapshot

### Message family compatibility contract
- Client may send: `session:hello { streamProtocol: "upsert-v1" }`.
- Server responds: `session:hello:ack { selectedFamily: "legacy" | "upsert-v1" }`.
- Routing rule: exactly one family per connection for the lifetime of that connection.
- During Story 6, if no hello is received, default selected family is `legacy`.
- Story 6 scope includes compatibility window only; legacy-family removal is Story 7.
- TC-7.4a in Story 6 removes direct ACP-to-WebSocket bridge usage in active flow (for example `createPromptBridgeMessages`, ACP-specific normalization/replay bridge paths). Removing legacy message-family emissions is Story 7 (AC-6.4b).

### Inlined type contracts (authoritative for this story)
```ts
type StreamProtocolFamily = "legacy" | "upsert-v1";

interface ConnectionCapabilities {
  streamProtocol?: "upsert-v1";
}

interface ConnectionContext {
  connectionId: string;
  selectedFamily: StreamProtocolFamily;
}

type TurnEvent =
  | { type: "turn_started"; turnId: string; sessionId: string; modelId: string; providerId: string }
  | { type: "turn_complete"; turnId: string; sessionId: string; status: "completed" | "cancelled"; usage?: object }
  | { type: "turn_error"; turnId: string; sessionId: string; errorCode: string; errorMessage: string };

interface UpsertObject {
  turnId: string;
  sessionId: string;
  itemId: string;
  sourceTimestamp: string;
  emittedAt: string;
  status: "create" | "update" | "complete" | "error";
  type: "message" | "thinking" | "tool_call";
  content?: string;
  callId?: string;
}

interface WsUpsertMessage {
  type: "session:upsert";
  sessionId: string;
  payload: UpsertObject;
}

interface WsTurnMessage {
  type: "session:turn";
  sessionId: string;
  payload: TurnEvent;
}

interface WsHistoryMessage {
  type: "session:history";
  sessionId: string;
  entries: UpsertObject[];
}

interface CompatibilityGateway {
  negotiate(connectionId: string, capabilities?: ConnectionCapabilities): ConnectionContext;
  deliver(
    context: ConnectionContext,
    payload: { upsert?: UpsertObject; turn?: TurnEvent; legacy?: unknown }
  ): void;
}

interface StreamDelivery {
  deliverUpsert(connectionId: string, sessionId: string, payload: UpsertObject): void;
  deliverTurn(connectionId: string, sessionId: string, payload: TurnEvent): void;
  deliverHistory(connectionId: string, sessionId: string, entries: UpsertObject[]): void;
}
```

### New WebSocket messages
- `session:upsert` with upsert payload
- `session:turn` with turn lifecycle payload
- `session:history` with materialized history entries

### Required flow semantics
- Providers emit `UpsertObject`/`TurnEvent` via callbacks.
- WebSocket delivery routes callback outputs to the selected family only.
- Browser upsert rendering is replace-by-`itemId` semantics.
- History load path: HTTP load returns metadata; WebSocket delivers history entries.
- Legacy and upsert families must not be emitted together on one connection.

### File responsibility split
- `stream-delivery.ts`: transport delivery of upsert/turn/history payloads.
- `compatibility-gateway.ts`: connection negotiation + one-family-per-connection enforcement.
- `websocket.ts`: connection/session glue, no active direct ACP streaming-bridge path.
- `session-service.ts`: do not modify unless callback ownership is objectively missing from prior stories.
- `client/shell/shell.js`: capability negotiation.
- `client/portlet/portlet.js`: upsert rendering state transitions and item isolation.
- `shared/stream-contracts.ts` + `shared/types.ts`: WebSocket contract shapes shared by server/client (including `session:hello`/`session:hello:ack` and `session:upsert`/`session:turn`/`session:history`).

## TCs In Scope
- TC-6.4a
- TC-6.4c
- TC-7.1a..TC-7.1c
- TC-7.2a..TC-7.2c
- TC-7.3a..TC-7.3b
- TC-7.4a

## TC Expectation Map (must be encoded in test names)
- `TC-6.4a`: Story 6 provides compatibility window for legacy consumers during migration.
- `TC-6.4c`: single connection receives exactly one negotiated family (no duplicate processing).
- `TC-7.1a`: Claude text streaming reaches browser as message upserts.
- `TC-7.1b`: Codex text streaming reaches browser as message upserts.
- `TC-7.1c`: tool-call create/complete upserts arrive for both providers.
- `TC-7.2a`: text upserts render progressively by in-place update.
- `TC-7.2b`: tool-call invocation/completion state transition renders correctly.
- `TC-7.2c`: interleaved items render independently.
- `TC-7.3a`: Claude session load renders history via pipeline.
- `TC-7.3b`: Codex session load renders history via pipeline.
- `TC-7.4a`: no direct ACP-to-WebSocket path remains in active streaming flow.

## Files to Create/Modify
- `server/websocket/stream-delivery.ts`
- `server/websocket/compatibility-gateway.ts`
- `server/websocket.ts`
- `server/api/session/session-service.ts` (only if callback-to-delivery ownership is objectively missing)
- `client/shell/shell.js`
- `client/portlet/portlet.js`
- `shared/stream-contracts.ts`
- `shared/types.ts`
- `tests/server/websocket/websocket-compatibility.test.ts`
- `tests/server/pipeline/pipeline-integration.test.ts`
- `tests/server/pipeline/session-history-pipeline.test.ts`
- `tests/client/upsert/portlet-upsert-rendering.test.ts`

## Task
1. Add minimal delivery/gateway/client skeletons for Story 6 scope.
2. Add exactly 11 Story 6 tests across the listed suites with TC-prefixed names.
3. Ensure tests establish red baseline for compatibility routing, callback-delivery flow, history, and rendering semantics.
4. Ensure client tests run under jsdom for browser rendering behavior (`TC-7.2a..TC-7.2c`).

## Non-Goals
- No legacy-family removal (Story 7 scope).
- No provider internal rewrites.
- No session API contract redesign.
- No new persistence integrations.

## Constraints
- Do NOT modify files outside scoped list; conditional scope exceptions noted above are explicit in-scope exceptions.
- Do NOT add new dependencies.
- Do NOT emit both message families on one connection.
- Every Story 6 test title must include its TC ID.

## If Blocked or Uncertain
- If one-family enforcement conflicts with existing connection lifecycle code, stop and report exact mismatch.
- If TC-7.4a requires Story 7 cleanup work, stop and report boundary conflict.
- Do NOT silently reinterpret migration boundaries.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bunx vitest run tests/server/websocket/websocket-compatibility.test.ts tests/server/pipeline/pipeline-integration.test.ts tests/server/pipeline/session-history-pipeline.test.ts tests/client/upsert/portlet-upsert-rendering.test.ts`
3. Run `bun run guard:test-baseline-record`

Expected:
- Story 6 red suites exist with 11 TC-traceability tests.
- Compatibility routing, callback delivery, history, and rendering tests fail/red before green implementation.
- Red baseline is recorded.

## Done When
- [ ] Story 6 scoped files are created/updated.
- [ ] Exactly 11 Story 6 tests exist with TC-prefixed names.
- [ ] Story 6 suites are red.
- [ ] `bun run red-verify` passes.
- [ ] `bun run guard:test-baseline-record` passes.

## Handoff Output Contract
Return:
- Files changed
- Count of Story 6 tests added
- Verification summary
- Any blockers with file-level evidence
