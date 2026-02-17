# Prompt 5.2: Story 5 Green

## Model Context
This prompt targets a fresh `gpt-5.3-codex` execution context.

## Context

**Product/Project/Feature:** Liminal Builder, Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Bring Story 5 to green for Codex provider behavior and pivot-contract output semantics while preserving red-test intent.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 5 red baseline exists.
- `TC-2.1c` is activated in `provider-interface.test.ts`.
- Story 0-2 and Story 4 pivot suites remain green.
- Story 3 suites may still be intentionally red and are out of scope.
- Story 3 intentionally-red allowance is temporary and must be resolved before Story 6+ delivery/release gates.

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
- `sendMessage` preserves ACP `session/prompt` behavior and resolves after deterministic turn-start bind.
- `cancelTurn`, `killSession`, `isAlive`, `onUpsert`, and `onTurn` remain contract-compliant.
- Output consumer starts during `createSession`/`loadSession`, not on first send.

### ACP -> provider output mapping table
| ACP signal | Provider output |
|---|---|
| `session/update` with `agent_message_chunk` | `MessageUpsert` (`create`/`update`/`complete`) |
| `session/update` with `tool_call` | `ToolCallUpsert` (`status: "create"`) |
| `session/update` with `tool_call_update` (completed) | `ToolCallUpsert` (`status: "complete"`) correlated by `callId` |
| ACP fatal/terminal error | `TurnEvent` (`type: "turn_error"`) with structured `errorCode`/`errorMessage` |
| terminal success | `TurnEvent` (`type: "turn_complete"`) |

### ACP notification shapes (inlined)
Use these shapes as the normalization contract input (field names must match ACP notifications consumed by `acp-client.ts`):
- `session/update` + `sessionUpdate: "agent_message_chunk"` includes message chunk text content.
- `session/update` + `sessionUpdate: "tool_call"` includes tool invocation metadata (`toolName`, `callId`, and invocation argument content when present).
- `session/update` + `sessionUpdate: "tool_call_update"` includes tool progress/completion updates; completed state includes final tool result content for the same `callId`.

### Normalization semantics
- Invocation starts may carry partial arguments.
- Finalized argument completeness is authoritative at completion phase.
- Correlation identifiers remain stable across invocation and completion.
- Defensive handling must not crash on unknown tool-result correlation IDs.

### Message accumulation and emission policy
- Accumulate message content across `agent_message_chunk` notifications per active message item.
- First chunk emits `MessageUpsert` with `status: "create"` and full accumulated content at that point.
- Subsequent chunks emit `status: "update"` with full accumulated content (never raw delta-only payloads).
- Terminal turn success/failure emits final message state with `status: "complete"`/`"error"` as applicable.
- Provider-side token batching is **not** applied in Story 5; emit once per relevant ACP notification/terminal transition.

### ProviderError usage expectations
- `SESSION_CREATE_FAILED`: create path cannot establish ACP session.
- `SESSION_NOT_FOUND`: unknown session for load/send/cancel/kill.
- `PROCESS_CRASH`: ACP process unexpectedly unavailable.
- `PROTOCOL_ERROR`: invalid ACP sequence or malformed update semantics.
- `INVALID_STREAM_EVENT`: cannot map ACP update to provider output contract.
- `INTERRUPT_FAILED`: cancel operation cannot be completed.

### File responsibility boundary
- `codex-acp-provider.ts`: provider lifecycle, ACP orchestration, output mapping, and callback emission.
- `acp-client.ts`: adapter-facing updates only; keep behavior-compatible request surface.

## Files to Modify
- `server/providers/codex/codex-acp-provider.ts`
- `server/acp/acp-client.ts`

## Optional Files (only if red contract is objectively wrong)
- `tests/server/providers/provider-interface.test.ts`
- `tests/server/providers/codex-acp-provider.test.ts`
- `server/providers/index.ts` (export wiring only if required for typecheck/import resolution)

If this is needed, document exact contract mismatch before editing tests.

## Non-Goals
- No Session API route/service changes.
- No Claude provider changes.
- No websocket/pipeline/browser migration work.
- No legacy message-family removal.

## Constraints
- Do NOT rewrite tests casually in green.
- If pivot contract alignment requires test updates, keep TC intent unchanged and document why.
- If test edits appear required, stop and report the exact mismatch for orchestrator approval before editing test files.
- Do NOT add new dependencies.
- Do NOT modify files outside scoped list.
- Preserve red test intent and TC naming.

## If Blocked or Uncertain
- If ACP behavior preservation conflicts with provider interface constraints, stop and report exact mismatch.
- If a test can only pass by weakening assertions, stop and report.
- Do NOT silently reinterpret mapping semantics.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bunx vitest run tests/server/providers/codex-acp-provider.test.ts`
3. Run `bunx vitest run tests/server/providers/provider-interface.test.ts`
4. Run `bunx vitest run tests/server/providers/claude-sdk-provider.test.ts`
5. Run `bunx vitest run tests/server/streaming/upsert-stream-processor.test.ts`
6. Run `bunx vitest run tests/server/contracts/`
7. Run `bunx vitest run tests/server/websocket.test.ts`
8. Run `bun run green-verify` (expected to fail only on known Story 3 red suites unless those were fixed in this branch)

Expected:
- 8 Story 5 tests pass in `codex-acp-provider.test.ts` (6 TC-mapped + 2 regression guards).
- `TC-2.1c` passes as active conformance test.
- Running traceability total matches the current story-ledger baseline in `docs/epics/02-provider-streaming-pipeline/stories/README.md`.

## Done When
- [ ] Story 5 scoped tests are green.
- [ ] `TC-2.1c` active conformance check is green.
- [ ] No unapproved test rewrites in green.
- [ ] Verification commands pass with only allowed known-red suites failing.
- [ ] No out-of-scope files changed.

## Handoff Output Contract
Return:
- Files changed
- Story 5 test pass counts
- `TC-2.1c` status confirmation
- Any unresolved risks or deferred decisions
