# Story 4: Claude SDK Provider (Chunk 3)

## Overview
Implement the Claude provider session lifecycle, streaming input handling, canonical event normalization, and process-state handling behind `CliProvider`.

This is the highest-risk provider story and includes activation of the deferred interface conformance test from Story 1.

## Prerequisites
- Story 0 through Story 3 are green.
- Provider registry and Session API already route through provider contracts.
- Story 1 placeholder strategy is intact before this story starts:
  - `TC-2.1b` placeholder exists and is pending activation in this story.
  - `TC-2.1c` remains deferred for Story 5.

## ACs Covered
- AC-2.1 (Claude conformance: TC-2.1b)
- AC-3.1
- AC-3.2
- AC-3.3
- AC-3.4

## TCs Covered
- TC-2.1b (activate Story 1 placeholder)
- TC-3.1a through TC-3.1c
- TC-3.2a through TC-3.2b
- TC-3.3a through TC-3.3f
- TC-3.4a through TC-3.4c

## Files

**Create/Modify:**
- `server/providers/claude/claude-sdk-provider.ts`
- `server/providers/claude/claude-event-normalizer.ts`
- `tests/server/providers/claude-sdk-provider.test.ts`
- `tests/server/providers/provider-interface.test.ts` (activate `TC-2.1b`; keep `TC-2.1c` deferred)

## Test Breakdown
- `tests/server/providers/claude-sdk-provider.test.ts`: 14 Story 4 tests
- `tests/server/providers/provider-interface.test.ts`: activate existing `TC-2.1b` placeholder (no new traceability entry)
- Story traceability total contribution: 14
- Running traceability total: 60
- Executable test delta in this story: +15 (14 new Story 4 tests + activated `TC-2.1b`)

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-4.1-skeleton-red.md` | Create provider/normalizer skeleton, add 14 TC-traceable red tests, and activate `TC-2.1b` placeholder |
| Green | `prompt-4.2-green.md` | Implement Claude lifecycle + SDK normalization + typed errors without changing red tests |
| Verify | `prompt-4.R-verify.md` | Audit AC/TC coverage, normalization fidelity, placeholder activation, and regression safety |
