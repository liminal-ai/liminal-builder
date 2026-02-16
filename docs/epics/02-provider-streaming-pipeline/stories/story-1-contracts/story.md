# Story 1: Canonical Contracts and Interface Validation

## Overview
Implement contract and interface test suites for canonical stream events and provider lifecycle interfaces.

## Prerequisites
- Story 0 complete and typecheck passing.
- Contract/type files exist from Story 0.

## ACs Covered
- AC-1.1, AC-1.2, AC-1.3
- AC-2.1 (interface shape and provider conformance checks)

## TCs Covered
- TC-1.1a through TC-1.1f
- TC-1.2a through TC-1.2c
- TC-1.3a through TC-1.3b
- TC-2.1a through TC-2.1c

## Files

**Create/Modify:**
- `tests/server/contracts/stream-contracts.test.ts`
- `tests/server/providers/provider-interface.test.ts`
- `server/streaming/stream-event-schema.ts` (green refinements only)
- `server/providers/provider-types.ts` (green refinements only)

## Test Breakdown
- `tests/server/contracts/stream-contracts.test.ts`: 11 tests
- `tests/server/providers/provider-interface.test.ts`: 3 tests
- Story total: 14
- Running total: 14

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-1.1-skeleton-red.md` | Add contract/interface tests and red baseline |
| Green | `prompt-1.2-green.md` | Make contracts/interfaces pass all Story 1 tests |
| Verify | `prompt-1.R-verify.md` | Validate TC coverage and green quality gate |
