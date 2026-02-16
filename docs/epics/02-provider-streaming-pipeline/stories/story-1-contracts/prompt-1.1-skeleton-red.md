# Prompt 1.1: Story 1 Skeleton + Red

## Context

**Product:** Liminal Builder is an agentic IDE that wraps AI coding CLIs (Claude Code, Codex) in a Fastify + WebSocket server with a browser-based chat UI.

**Project:** This epic introduces provider-specific runtime boundaries and canonical stream contracts so providers can normalize CLI-native events into one validated event vocabulary.

**Feature:** Epic 02 — Provider Architecture + Streaming Pipeline.

**Story:** Story 1 validates canonical contracts and provider interface shape using tests. It does not implement providers, session routes, or streaming runtime behavior.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:** Story 0 setup and compile gates are green.

## Reference Documents
(For human traceability; key execution content is inlined below.)
- Feature spec: `docs/epics/02-provider-streaming-pipeline/feature-spec.md` (AC-1.1/1.2/1.3, AC-2.1)
- Tech design: `docs/epics/02-provider-streaming-pipeline/tech-design.md` (Chunk 0)
- Test plan: `docs/epics/02-provider-streaming-pipeline/test-plan.md` (TC-1.x, TC-2.1)
- Story sharding notes: `docs/epics/02-provider-streaming-pipeline/stories/README.md` (TC-2.1b/c activation timing)

## Inlined Contract Snapshot

### Canonical stream envelope invariants
- Envelope fields: `eventId`, `timestamp`, `turnId`, `sessionId`, `type`, `payload`
- `timestamp` is ISO datetime (`z.string().datetime()`)
- Envelope/payload type parity is required: `event.type === event.payload.type`
- Payload event types:
  - `response_start`
  - `item_start`
  - `item_delta`
  - `item_done`
  - `item_error`
  - `item_cancelled`
  - `response_done`
  - `response_error`

### Correlation and provenance expectations
- Turn correlation: events for one turn share `turnId`
- Item correlation: item lifecycle events share `itemId`
- Tool correlation: function call/result events share `callId`
- Phase 2 boundary is explicit in contracts:
  - Present now: `sourceTimestamp`, `emittedAt`
  - Deferred to Phase 2 derivation: `turnSequenceNumber`, `llmTurnNumber`, canonical `entryType`

### Provider interface surface under test
`CliProvider` includes:
- `createSession(options)`
- `loadSession(sessionId, options?)`
- `sendMessage(sessionId, message)`
- `cancelTurn(sessionId)`
- `killSession(sessionId)`
- `isAlive(sessionId)`
- `onEvent(sessionId, callback)`

## TCs In Scope
- TC-1.1a..TC-1.1f
- TC-1.2a..TC-1.2c
- TC-1.3a..TC-1.3b
- TC-2.1a (executable now)
- TC-2.1b..TC-2.1c (placeholder in Story 1; activated in Stories 4-5)

## TC Expectation Map (Inline Execution Contract)
- `TC-1.1a`: `item_delta` text payload validates with matching envelope type and string `deltaContent`.
- `TC-1.1b`: tool-call lifecycle payloads validate across `item_start` -> `item_delta` -> `item_done`; function-call correlation fields remain consistent.
- `TC-1.1c`: reasoning payload validates (`itemType: "reasoning"`, string content).
- `TC-1.1d`: response lifecycle validates (`response_start` includes `turnId`/`modelId`; `response_done` supports `status`, `usage`, `finishReason`).
- `TC-1.1e`: error payloads validate for both item-level and response-level errors.
- `TC-1.1f`: malformed events fail schema validation with expected issue paths.
- `TC-1.2a`: all events in one turn share `turnId`.
- `TC-1.2b`: item lifecycle events share `itemId`.
- `TC-1.2c`: tool invocation/result events share `callId`.
- `TC-1.3a`: contract types preserve provenance/order boundary fields required for Phase 2 (`sourceTimestamp`, `emittedAt`, stable correlation IDs).
- `TC-1.3b`: Phase 2 derivation boundary remains explicit (`turnSequenceNumber`, `llmTurnNumber`, canonical `entryType` deferred to Phase 2).
- `TC-2.1a`: provider interface shape includes `createSession`, `loadSession`, `sendMessage`, `cancelTurn`, `killSession`, `isAlive`, `onEvent`.
- `TC-2.1b`: placeholder only in Story 1; activation target Story 4 (Claude provider).
- `TC-2.1c`: placeholder only in Story 1; activation target Story 5 (Codex provider).

## Task

### Files to Create
- `tests/server/contracts/stream-contracts.test.ts`
- `tests/server/providers/provider-interface.test.ts`

### Files to Modify (Red-only minimal adjustments if required for compile)
- `server/streaming/stream-event-schema.ts`
- `server/providers/provider-types.ts`

### Implementation Requirements
1. Create 14 traceability tests with explicit TC IDs in names/comments.
2. Implement 12 executable tests in Story 1:
   - TC-1.1a through TC-1.1f
   - TC-1.2a through TC-1.2c
   - TC-1.3a through TC-1.3b
   - TC-2.1a
3. Implement TC-2.1b and TC-2.1c as explicit placeholders (`it.todo` or `it.skip`) with activation notes:
   - `TC-2.1b activates in Story 4 when Claude provider exists`
   - `TC-2.1c activates in Story 5 when Codex provider exists`
4. Use existing fixtures/helpers where appropriate:
   - `@tests/fixtures/stream-events`
   - `@tests/helpers/stream-assertions`
5. Keep tests strictly at contract/interface boundary (no runtime provider/session/route implementation).
6. Add one explicit schema strictness test for function-call starts:
   - `item_start` with `itemType: "function_call"` must include both `name` and `callId`
   - Missing either field must fail validation

## Constraints
- Do NOT implement provider runtime logic.
- Do NOT implement session API, registry, processor, or websocket behavior.
- Do NOT edit files not listed.
- Red phase is expected to be failing/incomplete on behavior before Green.

## If Blocked or Uncertain
- If Story 0 contracts and TC expectations conflict, stop and surface the conflict.
- If a TC cannot be represented as a meaningful test without adding out-of-scope runtime code, stop and ask.
- If type signatures or schema contracts are ambiguous, document the ambiguity and return to orchestrator.
- Do NOT silently work around ambiguity.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts`
3. Record observed executable test state (`red` or `partial/fully green`) and include rationale; Story 1 may already satisfy some contracts from Story 0.
4. Run `bun run guard:test-baseline-record` after Red test set is finalized.
5. Commit all Red-phase work before proceeding to Green.

Expected:
- Quality gates pass (`red-verify`).
- Story 1 test suite exists with 14 TC-traceability entries.
- 12 executable tests + 2 explicit placeholders are visible.
- Observed executable test state is documented for handoff.
- Red baseline commit exists.

## Done When
- [ ] Two Story 1 test files created.
- [ ] 14 TC-traceability entries exist (12 executable + 2 placeholders).
- [ ] Function-call `item_start` strictness test exists.
- [ ] `bun run red-verify` passes.
- [ ] Red baseline recorded via `bun run guard:test-baseline-record`.
- [ ] Red-phase commit completed.
