# Prompt 6.2: Story 6 Green

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Bring Story 6 to green by implementing pipeline delivery wiring, compatibility routing, and browser upsert rendering.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 6 red baseline exists.
- Story 0 through Story 5 suites remain green.

## Reference Documents
(For human traceability only. Execution details are inlined.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/story.md`

## Inlined Implementation Contract

### Required behavior
- Provider canonical events flow through processor into websocket delivery.
- Browser renders upserts by `itemId` replacement/update semantics.
- HTTP load returns session metadata; history entries arrive over websocket `session:history`.
- Compatibility negotiation selects one family per connection and enforces single-family routing.

### Compatibility window constraints
- Story 6 supports both families across rollout.
- Per-connection routing must never emit both families.
- Legacy removal is explicitly deferred to Story 7.

### File responsibility boundary
- `stream-delivery.ts`: emit `session:upsert`, `session:turn`, `session:history` for new family.
- `compatibility-gateway.ts`: negotiation + selected-family routing.
- `websocket.ts`: connection wiring to delivery/gateway; remove active direct ACP path usage.
- `shell.js`: client hello capability handshake.
- `portlet.js`: upsert render/update behavior.

## Files to Modify
- `server/websocket/stream-delivery.ts`
- `server/websocket/compatibility-gateway.ts`
- `server/websocket.ts`
- `client/shell/shell.js`
- `client/portlet/portlet.js`
- `shared/stream-contracts.ts`

## Optional Files (only if red contract is objectively wrong)
- `tests/server/websocket/websocket-compatibility.test.ts`
- `tests/server/pipeline/pipeline-integration.test.ts`
- `tests/server/pipeline/session-history-pipeline.test.ts`
- `tests/client/upsert/portlet-upsert-rendering.test.ts`

If needed, document exact contract mismatch before editing tests.

## Non-Goals
- No legacy-family removal (Story 7).
- No provider internal behavior rewrites.
- No new API routes or route-contract changes.
- No Context/Redis integration.

## Constraints
- Do NOT modify tests in green unless there is a proven contract inconsistency.
- Do NOT add new dependencies.
- Do NOT modify files outside scoped list.
- Preserve red test intent and TC naming.
- One-family-per-connection rule is mandatory.

## If Blocked or Uncertain
- If compatibility routing conflicts with existing websocket behavior, stop and report exact conflict.
- If passing requires relaxing duplicate-processing safeguards, stop and report.
- Do NOT silently reinterpret migration boundaries.

## Verification
When complete:
1. Run `bun run green-verify`
2. Run `bun run test -- tests/server/websocket/websocket-compatibility.test.ts tests/server/pipeline/pipeline-integration.test.ts tests/server/pipeline/session-history-pipeline.test.ts tests/client/upsert/portlet-upsert-rendering.test.ts`

Expected:
- Story 6: 11 tests pass.
- Running traceability total remains 79.
- Compatibility window behavior is migration-safe and duplicate-free.

## Done When
- [ ] Story 6 scoped tests are green.
- [ ] One-family-per-connection routing is enforced.
- [ ] History load path uses pipeline semantics.
- [ ] No unapproved test rewrites in green.
- [ ] `green-verify` passes.

## Handoff Output Contract
Return:
- Files changed
- Story 6 test pass counts
- Negotiation/routing behavior summary
- Any unresolved risks or deferred decisions
