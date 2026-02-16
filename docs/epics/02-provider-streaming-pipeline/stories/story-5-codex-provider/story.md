# Story 5: Codex ACP Provider Refactor (Chunk 4)

## Overview
Refactor the Codex ACP path behind the provider abstraction without behavioral drift.
Normalization preserves tool invocation/completion correlation when arguments finalize at completion and emits structured terminal errors through canonical signaling.

This story also activates the deferred Codex interface conformance placeholder from Story 1.

## Prerequisites
- Story 0 through Story 4 are green.
- Provider registry and Session API support multi-provider routing.
- Story 1 placeholder strategy is intact before this story starts:
  - `TC-2.1c` placeholder exists and is pending activation in this story.

## ACs Covered
- AC-2.1 (Codex conformance: TC-2.1c)
- AC-4.1
- AC-4.2

## TCs Covered
- TC-2.1c (activate Story 1 placeholder)
- TC-4.1a through TC-4.1c
- TC-4.2a through TC-4.2c

## Non-TC Regression Checks
- Session/process liveness and callback delivery regression guard.
- Behavioral parity guard for ACP terminal/error normalization path.

## Files

**Create/Modify:**
- `server/providers/codex/codex-acp-provider.ts`
- `server/providers/codex/codex-event-normalizer.ts`
- `server/acp/acp-client.ts`
- `tests/server/providers/codex-acp-provider.test.ts`
- `tests/server/providers/provider-interface.test.ts` (activate `TC-2.1c`)

## Test Breakdown
- `tests/server/providers/codex-acp-provider.test.ts`: 8 Story 5 tests (6 TC-mapped + 2 non-TC regression guards)
- `tests/server/providers/provider-interface.test.ts`: activate existing `TC-2.1c` placeholder (no new traceability entry)
- Story traceability total contribution: 8
- Running traceability total: 68
- Executable test delta in this story: +9 (8 new Story 5 tests + activated `TC-2.1c`)

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-5.1-skeleton-red.md` | Add Codex provider/normalizer skeleton, create 8 red tests, and activate `TC-2.1c` placeholder |
| Green | `prompt-5.2-green.md` | Implement ACP-backed provider behavior + canonical mapping without changing red tests |
| Verify | `prompt-5.R-verify.md` | Audit conformance activation, behavior preservation, mapping fidelity, and regression safety |
