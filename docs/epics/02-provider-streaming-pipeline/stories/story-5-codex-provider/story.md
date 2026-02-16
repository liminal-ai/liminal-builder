# Story 5: Codex ACP Provider Refactor

## Overview
Refactor Codex ACP path behind provider abstraction without behavior regression.
Normalization preserves tool invocation/completion correlation when arguments finalize at completion and emits structured terminal errors via canonical error signaling (`response_error` and/or `response_done(status:"error", error)`).

## Prerequisites
- Story 4 complete.
- Provider registry and Session API can host multiple providers.

## ACs Covered
- AC-4.1, AC-4.2

## TCs Covered
- TC-4.1a through TC-4.1c
- TC-4.2a through TC-4.2c
- Plus 2 regression checks from test plan (included in story estimate)

## Files

**Create/Modify:**
- `server/providers/codex/codex-acp-provider.ts`
- `server/providers/codex/codex-event-normalizer.ts`
- `server/acp/acp-client.ts`
- `tests/server/providers/codex-acp-provider.test.ts`

## Test Breakdown
- `tests/server/providers/codex-acp-provider.test.ts`: 8 tests
- Story total: 8
- Running total: 68

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-5.1-skeleton-red.md` | Add codex provider stubs and failing tests |
| Green | `prompt-5.2-green.md` | Implement adapter mapping and lifecycle behavior |
| Verify | `prompt-5.R-verify.md` | Validate no behavioral drift and contract compliance |
