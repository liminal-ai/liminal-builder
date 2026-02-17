# Prompt 6.R: Story 6 Verification

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context operating as an auditor.

## Context
Audit Story 6 for compatibility-window correctness, callback-to-delivery integration fidelity, browser rendering behavior, and regression safety.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Reference Documents
(For traceability.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/story.md`

## Verification Checklist

### 1) File and scope audit
- Confirm Story 6 changes are limited to declared files in story scope.
- Fail verification if out-of-scope files were modified without explicit justification.

### 2) Test inventory and counts
- Confirm Story 6 suite totals 11 tests:
  - websocket compatibility: 3
  - pipeline integration: 3
  - session history pipeline: 2
  - client upsert rendering: 3
- Running traceability total remains 81.

### 3) TC coverage audit
- `TC-6.4a`: compatibility window behavior present.
- `TC-6.4c`: single-family-per-connection routing enforced.
- `TC-7.1a..TC-7.1c`: provider streaming reaches browser as upserts.
- `TC-7.2a..TC-7.2c`: browser rendering updates in place and preserves item isolation.
- `TC-7.3a..TC-7.3b`: history load works through pipeline.
- `TC-7.4a`: no direct ACP-to-websocket active flow path remains.

### 4) Compatibility and routing fidelity checks
- Negotiation handshake behavior is deterministic.
- Connection receives exactly one family for its lifetime.
- No duplicate processing on a single connection.
- Story 6 does not remove legacy family globally (deferred to Story 7).

### 5) Pipeline and rendering correctness checks
- Provider callback outputs (`onUpsert`/`onTurn`) reach delivery layer.
- Upsert messages carry progressive accumulated-content semantics.
- Tool-call create/complete render transitions are stable.

### 6) Regression and immutability checks
- Confirm no regressions in Story 0-2 + Story 4-5 suites.
- Confirm green phase did not rewrite Story 6 tests except approved pivot-contract corrections.
- If `green-verify` fails, confirm failures are only known Story 3 red suites unless Story 3 was in scope.

## Commands
1. `bun run red-verify`
2. `bunx vitest run tests/server/websocket/websocket-compatibility.test.ts tests/server/pipeline/pipeline-integration.test.ts tests/server/pipeline/session-history-pipeline.test.ts tests/client/upsert/portlet-upsert-rendering.test.ts`
3. `bunx vitest run tests/server/providers/claude-sdk-provider.test.ts`
4. `bunx vitest run tests/server/providers/codex-acp-provider.test.ts`
5. `bunx vitest run tests/server/providers/provider-interface.test.ts`
6. `bun run green-verify`
7. `git status --porcelain`

## Expected Results
- Story 6 suites: 11 passing tests.
- Running traceability total remains 81.
- One-family-per-connection rule enforced and stable.
- `green-verify` fails only on known out-of-scope Story 3 reds, unless Story 3 was completed.
- No unexplained out-of-scope diffs.

## If Blocked or Uncertain
- If TC mappings or test counts conflict, stop and report exact mismatch.
- If migration boundary between Story 6 and Story 7 is blurred, report with file/line evidence.
- Do NOT infer missing requirements.

## Done When
- [ ] Story 6 is green and audit-complete.
- [ ] Compatibility-window behavior is verified.
- [ ] Pipeline and rendering fidelity checks pass.
- [ ] Regression safety checks pass.
- [ ] Scope discipline is confirmed.

## Auditor Output Contract
Return:
- Findings list (ordered by severity)
- Pass/fail per checklist section
- Exact blockers (if any)
- Go/No-Go recommendation
