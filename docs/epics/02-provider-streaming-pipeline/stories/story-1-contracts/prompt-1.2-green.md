# Prompt 1.2: Story 1 Green

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Streaming Pipeline.

**Story:** Complete Story 1 by bringing executable contract/interface tests from red to green while preserving Red test contract integrity.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 1 Red phase committed.
- Red baseline file recorded via `bun run guard:test-baseline-record`.

## Reference Documents
(For human traceability; execution content is inlined.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/README.md`

## Scope
- Bring Story 1 executable tests to green.
- Preserve placeholder status for TC-2.1b/c until Stories 4-5.

## Files to Modify
- `server/streaming/stream-event-schema.ts`
- `server/providers/provider-types.ts`
- `shared/stream-contracts.ts` (if required for contract parity)

## Requirements
1. Do NOT modify test files in Green. Red tests are the behavioral contract.
2. Preserve envelope/payload discriminators and strict parity (`type === payload.type`).
3. Ensure provider interface exact method surface remains:
   - `createSession`, `loadSession`, `sendMessage`, `cancelTurn`, `killSession`, `isAlive`, `onEvent`
4. Enforce function-call start strictness in schema:
   - For `item_start` with `itemType: "function_call"`, require `name` and `callId`.
5. Enforce response terminal error payload semantics in schema:
   - For `response_done` with `status: "error"`, support structured `error` details.
   - Preserve compatibility with `response_error` events as explicit terminal errors.
6. Keep TC-2.1b/c placeholder tests intact (do not activate in Story 1).

## Constraints
- No provider runtime implementation.
- No route/session/processor/websocket implementation.
- No file edits outside listed files.

## If Blocked or Uncertain
- If an executable test cannot pass without changing test files, stop and surface why.
- If enabling strict function-call start validation causes conflicts with documented contract semantics, stop and ask before widening scope.
- Do NOT work around contract mismatches silently.

## Verification
When complete:
1. Run `bun run green-verify`
2. Run `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts`

Expected:
- `green-verify` passes (includes test immutability guard).
- Story 1 executable tests pass.
- TC-2.1b/c remain explicit placeholders with activation notes for Stories 4-5.

## Done When
- [ ] Story 1 executable tests are green.
- [ ] No test files were modified in Green.
- [ ] `bun run green-verify` passes.
- [ ] Contracts are stable for Story 2+.
