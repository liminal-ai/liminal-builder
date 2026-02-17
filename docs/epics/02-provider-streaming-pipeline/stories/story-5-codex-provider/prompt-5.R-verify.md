# Prompt 5.R: Story 5 Verification

## Model Context
This prompt targets a fresh `gpt-5.3-codex` execution context operating as an auditor.

## Context
Audit Story 5 for AC/TC traceability, Codex behavior preservation, pivot-contract fidelity, and regression safety.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Reference Documents
(For traceability.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-5-codex-provider/story.md`

## Verification Checklist

### Approved correction note (2026-02-17, user-approved)
- A single Story 5 test timing correction is allowed in `TC-4.2a`:
  - File: `tests/server/providers/codex-acp-provider.test.ts`
  - Change intent: wait for async terminal microtask delivery before asserting final `message` `status: "complete"`.
  - Constraint: TC semantics and assertions remain unchanged (`create` -> `update` -> `complete` with full accumulated content).

### 1) File and scope audit
- Confirm Story 5 changes are limited to:
  - `server/providers/codex/codex-acp-provider.ts`
  - `server/acp/acp-client.ts`
  - `tests/server/providers/codex-acp-provider.test.ts`
  - `tests/server/providers/provider-interface.test.ts` (for `TC-2.1c` activation only)
- Fail verification if out-of-scope files are modified without explicit justification.

### 2) Test inventory and counts
- Confirm `tests/server/providers/codex-acp-provider.test.ts` contains exactly 8 Story 5 tests:
  - 6 TC-mapped tests with TC IDs in names.
  - 2 non-TC regression guard tests.
- Confirm `tests/server/providers/provider-interface.test.ts` has active/passable `TC-2.1c`.
- Running traceability total matches the current story-ledger baseline in `docs/epics/02-provider-streaming-pipeline/stories/README.md`.

### 3) TC coverage audit
- `TC-2.1c` provider conformance is active and passing.
- `TC-4.1a..TC-4.1c` ACP behavior parity checks are represented.
- `TC-4.2a..TC-4.2c` output-mapping checks are represented.

### 4) Pivot-contract fidelity checks
- Provider implements `onUpsert` and `onTurn` callbacks (not `onEvent`).
- `sendMessage` resolves after deterministic turn-start bind, not terminal completion.
- Output consumer starts on `createSession`/`loadSession`.
- `agent_message_chunk` maps to message upserts.
- `tool_call` maps to tool_call create with stable `callId`.
- `tool_call_update` completion maps to tool_call complete with stable correlation.
- Terminal failures map to `turn_error` with structured error fields.

### 5) Lifecycle and error correctness
- Provider lifecycle methods remain contract-compliant.
- Failure paths surface typed `ProviderError` codes.
- No ACP-direct websocket bridge behavior is reintroduced.

### 6) Regression and immutability checks
- Confirm Story 0-2 + Story 4 suites remain green.
- Confirm green phase did not rewrite Story 5 tests except the user-approved `TC-4.2a` async wait correction above and any separately approved pivot-contract corrections.
- If `green-verify` fails, confirm failures are only known Story 3 red suites unless Story 3 was in scope.
- Story 3 intentionally-red allowance is temporary and must be resolved before Story 6+ delivery/release gates.

## Commands
Primary Story 5 gates:
1. `bunx vitest run tests/server/providers/codex-acp-provider.test.ts`
2. `bunx vitest run tests/server/providers/provider-interface.test.ts`
3. `git status --porcelain`

Regression sampling (post-primary gates):
4. `bun run red-verify`
5. `bunx vitest run tests/server/providers/claude-sdk-provider.test.ts`
6. `bunx vitest run tests/server/streaming/upsert-stream-processor.test.ts`
7. `bunx vitest run tests/server/contracts/`
8. `bunx vitest run tests/server/websocket.test.ts`
9. `bun run green-verify`

## Expected Results
- Story 5 provider suite: 8 passing tests.
- `TC-2.1c` is active and passing.
- Story 0-2 + Story 4 suites remain green (no regression).
- `green-verify` fails only on known out-of-scope Story 3 reds, unless Story 3 was completed.
- No unexplained out-of-scope diffs.

## If Blocked or Uncertain
- If test counts or TC mappings conflict, stop and report exact mismatch.
- If conformance activation state is ambiguous, report with file/line evidence.
- Do NOT infer missing requirements.

## Done When
- [ ] Story 5 is green and audit-complete.
- [ ] `TC-2.1c` activation is verified.
- [ ] Pivot-contract fidelity checks pass.
- [ ] Regression safety checks pass.
- [ ] Scope discipline is confirmed.

## Auditor Output Contract
Return:
- Findings list (ordered by severity)
- Pass/fail per checklist section
- Exact blockers (if any)
- Go/No-Go recommendation
