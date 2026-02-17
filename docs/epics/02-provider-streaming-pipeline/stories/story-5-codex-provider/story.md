# Story 5: Codex ACP Provider Refactor (Chunk 4)

## Overview
Refactor the Codex ACP path behind the provider abstraction without behavioral drift.
Codex provider output must follow the Story 4 pivot contract: emit `UpsertObject`/`TurnEvent` via `onUpsert`/`onTurn` directly (no provider-level canonical envelope callback surface).

This story also activates the deferred Codex interface conformance placeholder from Story 1.

## Prerequisites
- Story 0-2 are green.
- Story 4 pivot is green with provider contract:
  - `onUpsert`/`onTurn` listener callbacks.
  - `sendMessage` waits for deterministic turn-start bind (not turn completion).
  - output consumer starts in `createSession`/`loadSession`.
- Story 3 suites (`provider-registry`, `session-routes`) may still be intentionally red and are out of scope unless explicitly pulled in.
- Story 3 intentionally-red allowance is temporary and must be resolved before Story 6+ delivery/release gates.
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
- Provider terminal/error shaping parity guard.

## Files

**Create/Modify:**
- `server/providers/codex/codex-acp-provider.ts`
- `server/acp/acp-client.ts`
- `tests/server/providers/codex-acp-provider.test.ts`
- `tests/server/providers/provider-interface.test.ts` (activate `TC-2.1c`)

## Test Breakdown
- `tests/server/providers/codex-acp-provider.test.ts`: 8 Story 5 tests (6 TC-mapped + 2 non-TC regression guards)
- `tests/server/providers/provider-interface.test.ts`: activate existing `TC-2.1c` placeholder (no new traceability entry)
- Story traceability total contribution: 8
- Running traceability total: must match the current story-ledger baseline in `docs/epics/02-provider-streaming-pipeline/stories/README.md`
- Executable test delta in this story: +9 (8 new Story 5 tests + activated `TC-2.1c`)

## Prompts
| Phase | File | Purpose |
|---|---|---|
| Skeleton+Red | `prompt-5.1-skeleton-red.md` | Add Codex provider skeleton, define 8 red tests, and activate `TC-2.1c` placeholder |
| Green | `prompt-5.2-green.md` | Implement ACP-backed provider behavior + direct upsert/turn mapping without changing red tests unless pivot contract mismatch is proven |
| Verify | `prompt-5.R-verify.md` | Audit conformance activation, behavior preservation, pivot-contract fidelity, and regression safety |
