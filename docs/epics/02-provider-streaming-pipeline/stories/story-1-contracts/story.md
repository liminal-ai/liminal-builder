# Story 1: Canonical Contracts and Interface Validation

## Overview
Implement contract and interface test suites for canonical stream events and provider lifecycle interfaces.

## Prerequisites
- Story 0 complete and typecheck passing.
- Contract/type files from Story 0 exist and compile:
  - `server/streaming/stream-event-schema.ts`
  - `server/providers/provider-types.ts`
  - `server/streaming/upsert-types.ts`
  - `tests/fixtures/stream-events.ts`
  - `tests/helpers/stream-assertions.ts`

## Execution Decision (Resolved)
- TC-2.1a is fully executable in Story 1.
- TC-2.1b and TC-2.1c are represented as explicit placeholder tests in Story 1 and are activated in:
  - Story 4 (Claude provider implementation)
  - Story 5 (Codex provider implementation)
- Story 1 therefore contains 14 traceability tests total:
  - 12 executable tests in Story 1
  - 2 placeholder conformance tests with activation notes

## ACs Covered
- AC-1.1, AC-1.2, AC-1.3
- AC-2.1 (interface shape now, provider conformance activated in Stories 4-5)

## TCs Covered
- TC-1.1a through TC-1.1f (executable)
- TC-1.2a through TC-1.2c (executable)
- TC-1.3a through TC-1.3b (executable)
- TC-2.1a (executable)
- TC-2.1b through TC-2.1c (placeholder in Story 1; activated later)

## Files

**New:**
- `tests/server/contracts/stream-contracts.test.ts`
- `tests/server/providers/provider-interface.test.ts`

**Modified (Green only):**
- `server/streaming/stream-event-schema.ts` (contract refinements only)
- `server/providers/provider-types.ts` (contract refinements only)
- `shared/stream-contracts.ts` (if required for contract parity)

## Test Breakdown
- `tests/server/contracts/stream-contracts.test.ts`: 11 executable tests
- `tests/server/providers/provider-interface.test.ts`: 1 executable + 2 placeholders
- Story traceability total: 14
- Story executable total (Story 1 runtime): 12
- Running total (traceability accounting): 14

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-1.1-skeleton-red.md` | Add contract/interface tests, establish red baseline, record test baseline |
| Green | `prompt-1.2-green.md` | Make Story 1 executable tests pass without modifying tests |
| Verify | `prompt-1.R-verify.md` | Audit TC coverage, placeholder status, immutability, and gates |
