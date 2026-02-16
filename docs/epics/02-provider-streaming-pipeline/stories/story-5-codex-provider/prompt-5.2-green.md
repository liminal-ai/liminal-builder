# Prompt 5.2: Story 5 Green

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Bring Story 5 to green for Codex provider behavior and canonical mapping while preserving red-test contracts.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 5 red baseline exists.
- `TC-2.1c` is activated in `provider-interface.test.ts`.
- Story 0 through Story 4 suites remain green.

## Reference Documents
(For human traceability only. Execution details are inlined.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-5-codex-provider/story.md`

## Inlined Implementation Contract

### Required Codex provider behavior
- `createSession` preserves ACP `session/new` behavior.
- `loadSession` preserves ACP `session/load` replay behavior.
- `sendMessage` preserves ACP `session/prompt` behavior.
- `cancelTurn`, `killSession`, `isAlive`, and `onEvent` remain contract-compliant.

### ACP -> canonical mapping table
| ACP signal | Canonical output |
|---|---|
| `session/update` with `agent_message_chunk` | `item_delta` (`itemType: "message"`) |
| `session/update` with `tool_call` | `item_start` (`itemType: "function_call"`, `name`, `callId`) |
| `session/update` with `tool_call_update` (completed) | `item_done` completion correlated by `callId` |
| ACP/adapter fatal failure | `response_error` preferred; `response_done(status:"error", error)` supported |

### Normalization semantics
- Invocation starts may carry partial arguments.
- Finalized argument completeness is authoritative at completion phase.
- Correlation identifiers remain stable across invocation and completion.

### ProviderError usage expectations
- `SESSION_CREATE_FAILED`: create path cannot establish ACP session.
- `SESSION_NOT_FOUND`: unknown session for load/send/cancel/kill.
- `PROCESS_CRASH`: ACP process unexpectedly unavailable.
- `PROTOCOL_ERROR`: invalid ACP sequence or malformed update semantics.
- `INVALID_STREAM_EVENT`: cannot map ACP update to canonical contract.
- `INTERRUPT_FAILED`: cancel operation cannot be completed.

### File responsibility boundary
- `codex-acp-provider.ts`: provider lifecycle and ACP orchestration.
- `codex-event-normalizer.ts`: notification normalization and correlation.
- `acp-client.ts`: adapter-facing updates only; keep behavior-compatible request surface.

## Files to Modify
- `server/providers/codex/codex-acp-provider.ts`
- `server/providers/codex/codex-event-normalizer.ts`
- `server/acp/acp-client.ts`

## Optional Files (only if red contract is objectively wrong)
- `tests/server/providers/provider-interface.test.ts`
- `tests/server/providers/codex-acp-provider.test.ts`

If this is needed, document exact contract mismatch before editing tests.

## Non-Goals
- No Session API route/service changes.
- No Claude provider changes.
- No websocket/pipeline/browser migration work.
- No legacy message-family removal.

## Constraints
- Do NOT modify tests in green unless there is a proven contract inconsistency.
- Do NOT add new dependencies.
- Do NOT modify files outside scoped list.
- Preserve red test intent and TC naming.
- Keep canonical error signaling wording consistent: `response_error` preferred, `response_done(status:"error", error)` supported.

## If Blocked or Uncertain
- If ACP behavior preservation conflicts with provider interface constraints, stop and report exact mismatch.
- If a test can only pass by weakening assertions, stop and report.
- Do NOT silently reinterpret mapping semantics.

## Verification
When complete:
1. Run `bun run green-verify`
2. Run `bun run test -- tests/server/providers/provider-interface.test.ts tests/server/providers/claude-sdk-provider.test.ts tests/server/providers/codex-acp-provider.test.ts`

Expected:
- 8 Story 5 tests pass in `codex-acp-provider.test.ts` (6 TC-mapped + 2 regression guards).
- `TC-2.1c` passes as active conformance test.
- Running traceability total remains 68.
- Executable total after Story 5 is 68.

## Done When
- [ ] Story 5 scoped tests are green.
- [ ] `TC-2.1c` active conformance check is green.
- [ ] No unapproved test rewrites in green.
- [ ] `green-verify` passes.
- [ ] No out-of-scope files changed.

## Handoff Output Contract
Return:
- Files changed
- Story 5 test pass counts
- `TC-2.1c` status confirmation
- Any unresolved risks or deferred decisions
