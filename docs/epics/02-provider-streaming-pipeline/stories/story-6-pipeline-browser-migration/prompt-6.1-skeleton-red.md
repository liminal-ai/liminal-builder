# Prompt 6.1: Story 6 Skeleton + Red

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product:** Liminal Builder (Fastify + WebSocket server with browser shell/portlet client).

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Feature:** Provider -> processor -> websocket delivery with browser upsert rendering.

**Story:** Story 6 (Tech Design Chunk 5) implements pipeline wiring + browser migration under a compatibility window.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 0 through Story 5 are green.
- Canonical contracts and provider implementations are stable.

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
- Story 6 scope includes compatibility window only; legacy-family removal is Story 7.

### New websocket messages
- `session:upsert` with upsert payload
- `session:turn` with turn lifecycle payload
- `session:history` with materialized history entries

### Required flow semantics
- Providers emit canonical events.
- Processor emits upsert/turn outputs.
- Delivery layer routes to selected family only.
- Browser upsert rendering is replace-by-`itemId` semantics.
- History load path: HTTP load returns metadata; websocket delivers history entries.

### File responsibility split
- `stream-delivery.ts`: transport delivery of upsert/turn/history payloads.
- `compatibility-gateway.ts`: connection negotiation + one-family-per-connection enforcement.
- `websocket.ts`: connection/session glue, no direct ACP normalization path.
- `client/shell/shell.js`: capability negotiation.
- `client/portlet/portlet.js`: upsert rendering state transitions and item isolation.

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
- `TC-7.4a`: no direct ACP-to-websocket path remains in active streaming flow.

## Files to Create/Modify
- `server/websocket/stream-delivery.ts`
- `server/websocket/compatibility-gateway.ts`
- `server/websocket.ts`
- `client/shell/shell.js`
- `client/portlet/portlet.js`
- `shared/stream-contracts.ts`
- `tests/server/websocket/websocket-compatibility.test.ts`
- `tests/server/pipeline/pipeline-integration.test.ts`
- `tests/server/pipeline/session-history-pipeline.test.ts`
- `tests/client/upsert/portlet-upsert-rendering.test.ts`

## Task
1. Add minimal delivery/gateway/client skeletons for Story 6 scope.
2. Add exactly 11 Story 6 tests across the listed suites with TC-prefixed names.
3. Ensure tests establish red baseline for compatibility routing, pipeline flow, history, and rendering semantics.

## Non-Goals
- No legacy-family removal (Story 7 scope).
- No provider internal rewrites.
- No session API contract redesign.
- No new persistence integrations.

## Constraints
- Do NOT modify files outside scoped list.
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
2. Run `bun run test -- tests/server/websocket/websocket-compatibility.test.ts tests/server/pipeline/pipeline-integration.test.ts tests/server/pipeline/session-history-pipeline.test.ts tests/client/upsert/portlet-upsert-rendering.test.ts`
3. Run `bun run guard:test-baseline-record`

Expected:
- Story 6 red suites exist with 11 TC-traceability tests.
- Compatibility routing, pipeline, history, and rendering tests fail/red before green implementation.
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
