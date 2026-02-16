# Prompt 1.R: Story 1 Verification

## Context

You are auditing Story 1 for AC/TC traceability, gate compliance, and test-contract integrity.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Reference Documents
(For human traceability.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/README.md`

## Verification Checklist

### 1) Test inventory and counts
- Confirm exactly two Story 1 test files exist:
  - `tests/server/contracts/stream-contracts.test.ts`
  - `tests/server/providers/provider-interface.test.ts`
- Confirm 14 TC-traceability entries total:
  - 12 executable tests
  - 2 placeholders (TC-2.1b, TC-2.1c)

### 2) TC-by-TC coverage audit
- TC-1.1a..TC-1.1f are represented with schema success/rejection coverage.
- TC-1.2a..TC-1.2c enforce turn/item/tool correlation checks.
- TC-1.3a verifies provenance fields needed downstream.
- TC-1.3b verifies explicit Phase 2 derivation boundary.
- TC-2.1a verifies provider interface method surface.
- TC-2.1b and TC-2.1c are explicit placeholders with activation notes:
  - Story 4 activation for Claude
  - Story 5 activation for Codex

### 3) Strictness and parity checks
- Invalid payloads are rejected.
- Envelope/payload type mismatch is rejected.
- `item_start` function-call strictness is enforced (`name` + `callId` required when `itemType` is `function_call`).

### 4) Green-phase immutability
- Confirm Green did not modify test files.
- If test files changed, fail verification and explain why this violates Story 1 Green rules unless an explicit orchestrator override exists.

## Commands
- `bun run green-verify`
- `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts`
- `git status --porcelain`

## If Blocked or Uncertain
- If test-count math, TC mappings, or placeholder strategy conflicts across docs, stop and surface the exact mismatch.
- Do NOT infer missing requirements; report them.

## Done When
- [ ] Story 1 is green for executable scope.
- [ ] TC traceability is complete and accurate.
- [ ] Placeholder tests are explicit and correctly deferred.
- [ ] Green immutability rules are satisfied.
- [ ] No unapproved scope changes.
