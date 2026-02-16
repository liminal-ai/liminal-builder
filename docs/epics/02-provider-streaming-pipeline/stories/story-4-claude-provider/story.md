# Story 4: Claude SDK Provider

## Overview
Implement Claude provider session lifecycle, message sending, event normalization, and process-state handling behind `CliProvider`.
Normalization includes create-time tool invocation events (arguments may finalize later at completion) and structured terminal error signaling (`response_error` and/or `response_done(status:"error", error)`).

## Prerequisites
- Story 3 complete.
- Registry and Session API route through provider contract.

## ACs Covered
- AC-3.1, AC-3.2, AC-3.3, AC-3.4

## TCs Covered
- TC-3.1a through TC-3.1c
- TC-3.2a through TC-3.2b
- TC-3.3a through TC-3.3f
- TC-3.4a through TC-3.4c

## Files

**Create/Modify:**
- `server/providers/claude/claude-sdk-provider.ts`
- `server/providers/claude/claude-event-normalizer.ts`
- `tests/server/providers/claude-sdk-provider.test.ts`

## Test Breakdown
- `tests/server/providers/claude-sdk-provider.test.ts`: 14 tests
- Story total: 14
- Running total: 60

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-4.1-skeleton-red.md` | Create provider/normalizer skeleton and failing tests |
| Green | `prompt-4.2-green.md` | Implement Claude provider lifecycle and normalization |
| Verify | `prompt-4.R-verify.md` | Validate crash/cancel/error propagation and mapping |
