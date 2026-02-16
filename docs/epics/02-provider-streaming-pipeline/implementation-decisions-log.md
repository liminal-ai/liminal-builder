# Epic 02 Implementation Decisions Log

## Decision 001
- Date: 2026-02-16
- Status: Accepted
- Title: Keep tool invocation `create` emission timing; clarify argument completeness semantics
- Decision:
  - Keep current processor behavior where tool-call invocation emits a `tool_call` upsert at `status: "create"` on invocation start.
  - `toolArguments` in the `create` emission may be empty/partial when the provider has not yet produced finalized invocation arguments.
  - Treat finalized arguments from `item_done(function_call)` as the authoritative invocation-argument state for correlation/completion paths.
- Rationale:
  - Preserves Story 2 red/green behavioral contract and existing emission cadence.
  - Avoids introducing additional buffering/latency coupling into invocation rendering.
  - Keeps correlation guarantees (`callId` -> original invocation `itemId`) intact.
- Consequences:
  - Contracts/docs must explicitly state partial-argument allowance for `tool_call` `create`.
  - Downstream consumers should not assume `create.toolArguments` is complete.

## Decision 002
- Date: 2026-02-16
- Status: Accepted
- Title: Add structured error parity for `response_done(status: "error")`
- Decision:
  - Extend canonical `response_done` payload with optional `error: { code: string; message: string }`.
  - When `response_done.status === "error"`, providers should include the structured `error` object.
  - `response_error` remains valid and preferred for explicit terminal fault signaling.
  - Processor/error-mapping precedence is:
    1. `response_error.error`
    2. `response_done.error` when present
    3. compatibility fallback from `finishReason` + synthesized message when structured error is absent.
- Rationale:
  - Eliminates ambiguity in failed-turn terminal semantics.
  - Preserves backward compatibility with existing sources that may only provide `status: "error"` + `finishReason`.
  - Keeps error observability strong without forcing a breaking one-shot migration.
- Consequences:
  - Canonical schema/docs/prompts must be updated to describe the new payload shape and precedence.
  - Provider normalization stories must explicitly cover structured error emission behavior.
