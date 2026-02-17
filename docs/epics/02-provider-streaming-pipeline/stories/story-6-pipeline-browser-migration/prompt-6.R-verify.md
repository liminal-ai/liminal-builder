# Prompt 6.R: Story 6 Verification (Revised — No Compatibility Window)

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context operating as an auditor.

## Context
Audit Story 6 for upsert-only pipeline correctness, callback-to-delivery integration fidelity, browser rendering behavior, and regression safety after the pivot that removed the compatibility window.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Reference Documents
(For traceability.)
- `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/story-6-pivot-addendum.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/prompt-6.1b-pivot-red.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/prompt-6.2-green.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`

## Verification Checklist

### 1) File and scope audit
- Confirm Story 6 implementation changes are primarily in scoped files from `prompt-6.2-green.md`.
- Legacy-assertion test updates are expected in:
  - `tests/server/websocket.test.ts`
  - `tests/client/portlet.test.ts`
  - `tests/client/tabs.test.ts`
- Additional adjacent file changes are acceptable only when mechanically required by the same Story 6 contract shift (for example shared helpers/types/wiring), with explicit justification.
- Fail verification if changed files indicate scope expansion, behavioral drift, or missing justification.

### 2) Test inventory and counts
- Confirm Story 6 suite totals **9 tests**:
  - WebSocket delivery cleanup: 1 (`TC-7.4a`)
  - Pipeline integration: 3 (`TC-7.1a`, `TC-7.1b`, `TC-7.1c`)
  - Session history pipeline: 2 (`TC-7.3a`, `TC-7.3b`)
  - Client upsert rendering: 3 (`TC-7.2a`, `TC-7.2b`, `TC-7.2c`)

### 3) TC coverage audit
- `TC-7.1a..TC-7.1c`: provider streaming reaches browser as upserts.
- `TC-7.2a..TC-7.2c`: browser rendering updates in place and preserves item isolation.
- `TC-7.3a..TC-7.3b`: history load works through upsert pipeline.
- `TC-7.4a`: legacy message emissions (`session:update`, `session:chunk`, `session:complete`, `session:cancelled`) are absent from active streaming flow.
- `TC-6.4a` / `TC-6.4c`: removed by pivot; do not require compatibility-window behavior.

### 4) Upsert-only protocol checks
- No `session:hello` / `session:hello:ack` handling in active server/client flow.
- No compatibility gateway artifacts remain (`compatibility-gateway.ts`, compatibility types).
- Active streaming uses `session:upsert`, `session:turn`, `session:history`.

### 5) Pipeline and rendering correctness checks
- `sessionManager.sendMessage(sessionId, content, onEvent)` callback path is used.
- `AcpUpdateEvent` is translated to upserts/turns and delivered via `stream-delivery`.
- `createPromptBridgeMessages` is not invoked from `session:send` flow.
- Session load emits `session:history` with `UpsertObject[]`.

### 6) Regression checks
- Story 4/5 provider suites remain green.
- If `green-verify` fails, failure set must be analyzed.
- `green-verify` is expected to pass with no failures.

## Commands
1. `bun run red-verify`
2. `bunx vitest run tests/server/websocket/websocket-compatibility.test.ts`
3. `bunx vitest run tests/server/pipeline/pipeline-integration.test.ts`
4. `bunx vitest run tests/server/pipeline/session-history-pipeline.test.ts`
5. `bunx vitest run tests/client/upsert/portlet-upsert-rendering.test.ts`
6. `bunx vitest run tests/server/providers/claude-sdk-provider.test.ts`
7. `bunx vitest run tests/server/providers/codex-acp-provider.test.ts`
8. `bunx vitest run tests/server/providers/provider-interface.test.ts`
9. `git diff --name-only`
10. If any test files changed: `bun run guard:test-baseline-record`
11. `bun run green-verify`
12. `git status --porcelain`

## Expected Results
- Story 6 suites: **9 passing tests**.
- Story 4/5 provider suites: passing.
- No compatibility-window behavior required.
- `green-verify` passes.

## If Blocked or Uncertain
- If TC mappings conflict with pivot docs, stop and report exact mismatch with file/line evidence.
- If legacy message types are still emitted from active flow, report exact emission site.
- Do NOT apply pre-pivot compatibility-window expectations.

## Done When
- [ ] Story 6 pivoted contract is verified (9 tests, upsert-only path).
- [ ] Pipeline + rendering checks pass.
- [ ] Legacy emission removal is confirmed.
- [ ] Scope discipline is confirmed.
- [ ] `green-verify` passes with no failures.

## Auditor Output Contract
Return:
- Findings list (ordered by severity)
- Pass/fail per checklist section
- Exact blockers (if any)
- Go/No-Go recommendation
- Explicit note on any observed regressions (if present)
