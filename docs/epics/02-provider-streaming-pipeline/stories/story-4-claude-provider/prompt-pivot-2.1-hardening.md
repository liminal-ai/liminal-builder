# Prompt Pivot-2.1: Claude Provider Constrained Hardening

## Model Context
Autonomous non-interactive GPT-5.3-Codex execution. Complete the task fully unless blocked.

## Context

**Product:** Liminal Builder — agentic IDE wrapping AI coding CLIs via provider adapters.

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Story 4 — Claude SDK Provider follow-up hardening.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Branch:** `arc-pivot-story-4`

**Baseline state:**
- Story 4 provider green pass exists.
- Story 3 stubs (`provider-registry`, `session-routes`) are intentionally red and out of scope.
- Existing Story 4 behavior must be preserved unless changes are required to remove timing hacks safely.

## Objective

Harden the provider implementation to remove brittle timing/gating logic while keeping existing Story 4 contract behavior intact.

## Scope

Primary target file:
- `server/providers/claude/claude-sdk-provider.ts`

Avoid touching other files unless absolutely required for compile/lint correctness.

## Required Hardening Work

1. Remove event-loop timing hack in `sendMessage`
- Remove artificial delay (`setTimeout(..., 0)` / equivalent).
- Replace with deterministic synchronization tied to provider state.
- `sendMessage` must still return `{ turnId }` and preserve ordering guarantees.

2. Remove output-consumer gating on `pendingTurnIds`
- Do not block iterator consumption waiting for pending turns.
- Consume SDK output continuously and handle unmatched events safely.

3. Keep protocol-safe turn handling
- `turn_error` must always include: `turnId`, `sessionId`, `errorCode`, `errorMessage`.
- Preserve duplicate-terminal prevention.
- Preserve FIFO turn correlation semantics.

4. Preserve existing tool-result behavior unless tests force change
- Keep JSON parse fallback for tool args.
- Unknown `toolUseId` behavior may remain as currently implemented if required to keep Story 4 passing.
- If you change this behavior, call it out explicitly in handoff with reason.

## Constraints

- Do NOT modify tests unless blocked by impossible constraints.
- Do NOT add dependencies.
- Do NOT alter `provider-types.ts`, `upsert-types.ts`, `provider-errors.ts` contracts.
- Minimize behavioral drift: this is a hardening patch, not redesign.

## Acceptance Criteria

1. `server/providers/claude/claude-sdk-provider.ts` no longer uses event-loop sleep hacks.
2. Output consumption no longer pauses on empty `pendingTurnIds`.
3. Story 4 tests remain green.
4. Story 0-2 regression checks listed below remain green.
5. Red Story 3 suites remain untouched/out of scope.

## Verification (run in order)

1. `bun run red-verify`
2. `bunx vitest run tests/server/providers/claude-sdk-provider.test.ts`
3. `bunx vitest run tests/server/providers/provider-interface.test.ts`
4. `bunx vitest run tests/server/streaming/upsert-stream-processor.test.ts`
5. `bunx vitest run tests/server/contracts/`
6. `bunx vitest run tests/server/websocket.test.ts`
7. Optional: `bun run green-verify`
   - Expected failure only in known Story 3 red suites.

## Handoff Output Contract

Return:
- Files changed
- Exactly what was removed/replaced for:
  - `sendMessage` timing
  - output-consumer gating
- Verification results (pass/fail per command)
- Any intentional behavior changes and why
- Any unresolved risks
