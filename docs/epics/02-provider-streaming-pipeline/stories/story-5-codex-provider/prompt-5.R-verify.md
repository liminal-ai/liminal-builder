# Prompt 5.R: Story 5 Verification

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context operating as an auditor.

## Context
Audit Story 5 for AC/TC traceability, Codex behavior preservation, canonical mapping fidelity, and regression safety.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Reference Documents
(For traceability.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-5-codex-provider/story.md`

## Verification Checklist

### 1) File and scope audit
- Confirm Story 5 changes are limited to:
  - `server/providers/codex/codex-acp-provider.ts`
  - `server/providers/codex/codex-event-normalizer.ts`
  - `server/acp/acp-client.ts`
  - `tests/server/providers/codex-acp-provider.test.ts`
  - `tests/server/providers/provider-interface.test.ts` (for `TC-2.1c` activation only)
- Fail verification if out-of-scope files are modified without explicit justification.

### 2) Test inventory and counts
- Confirm `tests/server/providers/codex-acp-provider.test.ts` contains exactly 8 Story 5 tests:
  - 6 TC-mapped tests with TC IDs in names.
  - 2 non-TC regression guard tests.
- Confirm `tests/server/providers/provider-interface.test.ts` has active/passable `TC-2.1c`.
- Running traceability total remains 68.

### 3) TC coverage audit
- `TC-2.1c` provider conformance is active and passing.
- `TC-4.1a..TC-4.1c` ACP behavior parity checks are represented.
- `TC-4.2a..TC-4.2c` mapping checks are represented.

### 4) Mapping fidelity checks
- `agent_message_chunk` maps to canonical message delta.
- `tool_call` maps to canonical function_call start with `name` and `callId`.
- `tool_call_update` completion maps to canonical done/completion event semantics.
- Tool invocation/completion correlation is preserved even when start-time arguments are partial.
- Terminal errors follow canonical signaling contract (`response_error` preferred, `response_done(status:"error", error)` supported).

### 5) Lifecycle and error correctness
- Provider lifecycle methods remain contract-compliant.
- Failure paths surface typed `ProviderError` codes.
- No ACP-direct websocket bridge behavior is reintroduced.

### 6) Regression and immutability checks
- Confirm Story 1-4 suites remain green.
- Confirm green phase did not rewrite Story 5 tests except approved contract corrections.

## Commands
1. `bun run green-verify`
2. `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts tests/server/streaming/upsert-stream-processor.test.ts tests/server/providers/provider-registry.test.ts tests/server/api/session-routes.test.ts tests/server/providers/claude-sdk-provider.test.ts tests/server/providers/codex-acp-provider.test.ts`
3. `git status --porcelain`

## Expected Results
- Story 5 provider suite: 8 passing tests.
- `TC-2.1c` is active and passing.
- Story 1-4 suites remain green (no regression).
- No unexplained out-of-scope diffs.

## If Blocked or Uncertain
- If test counts or TC mappings conflict, stop and report exact mismatch.
- If conformance activation state is ambiguous, report with file/line evidence.
- Do NOT infer missing requirements.

## Done When
- [ ] Story 5 is green and audit-complete.
- [ ] `TC-2.1c` activation is verified.
- [ ] Mapping fidelity checks pass.
- [ ] Regression safety checks pass.
- [ ] Scope discipline is confirmed.

## Auditor Output Contract
Return:
- Findings list (ordered by severity)
- Pass/fail per checklist section
- Exact blockers (if any)
- Go/No-Go recommendation
