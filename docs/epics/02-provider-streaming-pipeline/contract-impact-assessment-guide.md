# Epic 02 Contract Impact Assessment and Update Guide

## Purpose
This guide captures Decision 002 assessment scope: all Epic 02 documents and story packs potentially impacted by two contract clarifications:

1. `tool_call` invocation `create` emissions may carry partial/empty `toolArguments` until invocation is finalized.
2. `response_done(status: "error")` currently lacks structured error payload parity with `response_error`.

## Decision Scope

Decision 002 ratification result (executed in this update set):
- Selected option: **B2** (`response_done` supports structured optional `error` payload when `status === "error"`), with `response_error` retained and preferred when available.

### Change A (clarification)
- Keep existing emission timing for tool invocation `create`.
- Clarify that `create.toolArguments` may be partial/empty; completed invocation/result paths are authoritative.

### Change B (contract strengthening)
- Add explicit structured error semantics for error terminal turns.
- Ratified direction:
  - Extend `response_done` with optional `error: { code: string; message: string }` when `status === "error"`.
  - Keep `response_error` as valid/preferred explicit terminal fault signaling.

## Impact Matrix (Docs + Story Packs)

### Epic-level docs

1. `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- Impact: Required
- Updates:
  - Canonical payload type definition for `ResponseDonePayload`.
  - Turn lifecycle mapping note (`response_done(error)` vs `response_error` behavior).
  - AC/TC wording where tool invocation currently implies parsed arguments at `create` time.
  - Any examples that imply `create.toolArguments` is always complete.

2. `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- Impact: Required
- Updates:
  - Canonical stream contract schema snippet (`response_done` payload shape).
  - Provider-to-processor terminal error sequence expectations.
  - Add explicit note on tool invocation argument completeness at `item_start`/`create`.

3. `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- Impact: Required
- Updates:
  - TC descriptions for response lifecycle/error parity.
  - TC descriptions for tool-call invocation/completion argument expectations.
  - Add/adjust planned tests where schema behavior changes (Story 1, Story 2, provider stories).

4. `docs/epics/02-provider-streaming-pipeline/implementation-decisions-log.md`
- Impact: Required
- Updates:
  - Add Decision 002 outcome once ratified.

### Story sharding index

5. `docs/epics/02-provider-streaming-pipeline/stories/README.md`
- Impact: Conditional
- Update only if:
  - TC counts change, or
  - activation timing shifts between stories.

### Story 0 pack (contracts source pack)

6. `docs/epics/02-provider-streaming-pipeline/stories/story-0-infrastructure/story.md`
- Impact: Conditional
- Update only if Story 0-delivered contract surface changes materially.

7. `docs/epics/02-provider-streaming-pipeline/stories/story-0-infrastructure/prompt-0.1-setup.md`
- Impact: Required (if Change B accepted), Recommended (for Change A clarity)
- Updates:
  - Embedded `stream-event-schema.ts` snippet for `response_done` shape/rules.
  - Embedded `upsert-types.ts` snippet comment for `ToolCallUpsert.toolArguments` completeness semantics.
  - Embedded fixture snippets reflecting revised response error contract (if adopted).

8. `docs/epics/02-provider-streaming-pipeline/stories/story-0-infrastructure/prompt-0.R-verify.md`
- Impact: Required (if Change B accepted), Recommended (for Change A clarity)
- Updates:
  - Schema coherence checklist for `response_done` error payload invariants.
  - Naming/contract checks around tool invocation arguments completeness expectations.

### Story 1 pack (contract validation tests)

9. `docs/epics/02-provider-streaming-pipeline/stories/story-1-contracts/story.md`
- Impact: Conditional
- Update if TC inventory changes.

10. `docs/epics/02-provider-streaming-pipeline/stories/story-1-contracts/prompt-1.1-skeleton-red.md`
- Impact: Required
- Updates:
  - Inlined contract snapshot for response lifecycle error semantics.
  - TC expectation map wording for tool lifecycle and response lifecycle.
  - Add/adjust required strictness tests for error terminal contract.

11. `docs/epics/02-provider-streaming-pipeline/stories/story-1-contracts/prompt-1.2-green.md`
- Impact: Required
- Updates:
  - Green requirements to enforce the revised schema behavior.

12. `docs/epics/02-provider-streaming-pipeline/stories/story-1-contracts/prompt-1.R-verify.md`
- Impact: Required
- Updates:
  - Verification checklist for new/changed schema assertions.

### Story 2 pack (processor behavior)

13. `docs/epics/02-provider-streaming-pipeline/stories/story-2-upsert-processor/story.md`
- Impact: Conditional
- Update if TC wording/scope changes.

14. `docs/epics/02-provider-streaming-pipeline/stories/story-2-upsert-processor/prompt-2.1-skeleton-red.md`
- Impact: Required
- Updates:
  - Upsert semantics wording for tool invocation argument completeness.
  - Turn lifecycle error mapping wording for `response_done(status="error")`.

15. `docs/epics/02-provider-streaming-pipeline/stories/story-2-upsert-processor/prompt-2.2-green.md`
- Impact: Required
- Updates:
  - Required behavior section for tool argument completeness expectation.
  - Terminal error rule specificity (source event precedence and payload expectations).

16. `docs/epics/02-provider-streaming-pipeline/stories/story-2-upsert-processor/prompt-2.R-verify.md`
- Impact: Required
- Updates:
  - TC audit lines and algorithm/contract checks for revised terminal and tool semantics.

### Story 3 pack

17. `docs/epics/02-provider-streaming-pipeline/stories/story-3-session-api-registry/*`
- Impact: None expected
- Reason:
  - Story 3 scope is registry/session API boundary and does not define stream payload schema semantics.

### Story 4/5 packs (provider normalization)

18. `docs/epics/02-provider-streaming-pipeline/stories/story-4-claude-provider/story.md`
19. `docs/epics/02-provider-streaming-pipeline/stories/story-4-claude-provider/prompt-4.1-skeleton-red.md`
20. `docs/epics/02-provider-streaming-pipeline/stories/story-4-claude-provider/prompt-4.2-green.md`
21. `docs/epics/02-provider-streaming-pipeline/stories/story-4-claude-provider/prompt-4.R-verify.md`
22. `docs/epics/02-provider-streaming-pipeline/stories/story-5-codex-provider/story.md`
23. `docs/epics/02-provider-streaming-pipeline/stories/story-5-codex-provider/prompt-5.1-skeleton-red.md`
24. `docs/epics/02-provider-streaming-pipeline/stories/story-5-codex-provider/prompt-5.2-green.md`
25. `docs/epics/02-provider-streaming-pipeline/stories/story-5-codex-provider/prompt-5.R-verify.md`
- Impact: Recommended
- Updates:
  - Add explicit normalization obligations for error terminal event emission.
  - Clarify provider expectations for partial argument streaming and finalized argument emission.

### Story 6/7 packs

26. `docs/epics/02-provider-streaming-pipeline/stories/story-6-pipeline-browser-migration/*`
- Impact: Conditional
- Update only if new turn/error payload contracts affect pipeline integration assertions.

27. `docs/epics/02-provider-streaming-pipeline/stories/story-7-e2e-cleanup-nfr/*`
- Impact: Conditional
- Update only if end-to-end error-path expectations are revised.

## Recommended Update Sequence

1. Ratify Decision 002
- Confirm which Change B option is accepted:
  - Option B1: require `response_error` on all error terminals.
  - Option B2: extend `response_done` with structured `error` object.

2. Update source-of-truth docs first
- `feature-spec.md`
- `tech-design.md`
- `test-plan.md`
- append Decision 002 to `implementation-decisions-log.md`

3. Update story packs in dependency order
- Story 0 -> Story 1 -> Story 2 -> Story 4/5 -> Story 6/7 (only if impacted)
- Keep Story 3 unchanged unless scope broadens.

4. Reconcile TC and test-count impacts
- If new TCs are added or split, update:
  - Story-level counts in each `story.md`
  - running totals in `stories/README.md`
  - total mapping counts in `test-plan.md`

5. Run consistency pass before implementation work
- Validate that all prompt inlined contracts match updated feature/design specs.
- Ensure no contradictory terminal-error guidance remains across packs.

## Suggested Acceptance Checks for the Documentation Update

- No contradiction between:
  - stream-event schema definitions,
  - processor behavior rules,
  - provider normalization expectations,
  - and verification prompts.
- TC wording in story prompts aligns exactly with `test-plan.md`.
- Story running totals remain mathematically consistent after any TC changes.
