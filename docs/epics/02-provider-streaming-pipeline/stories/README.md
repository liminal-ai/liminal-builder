# Story Sharding: Provider Streaming Pipeline

## Input Artifacts
- Feature spec: `/Users/leemoore/liminal/apps/liminal-builder/docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- Tech design: `/Users/leemoore/liminal/apps/liminal-builder/docs/epics/02-provider-streaming-pipeline/tech-design.md`
- Test plan: `/Users/leemoore/liminal/apps/liminal-builder/docs/epics/02-provider-streaming-pipeline/test-plan.md`

## Validation Before Sharding
- Design chunks map cleanly to executable stories.
- Interfaces are explicit enough for skeleton/red/green prompts.
- TC mapping is complete (85/85), plus 7 non-TC verification checks.
- Verification commands are defined (`red-verify`, `verify`, `green-verify`, `verify-all`).

## Sharding Decision
Chunk 0 is split across:
- `Story 0` for pure setup (no tests, no TDD cycle): types, Zod schemas, error classes, fixtures, helpers, barrel exports, dependency installation.
- `Story 1` for contract/interface test implementation:
  - 12 executable tests closing AC-1.1/1.2/1.3 plus AC-2.1a
  - 2 explicit placeholder tests for AC-2.1b/c that activate in Stories 4-5

This preserves the methodology rule that Story 0 is infrastructure-only while keeping full coverage from the tech design and test plan. Story 0 delivers the AC type surface; Story 1 closes executable contract ACs and carries deferred conformance placeholders with explicit activation points.

Resolved execution rule:
- TC-2.1b (Claude provider conformance) is placeholder-only in Story 1 and activates in Story 4.
- TC-2.1c (Codex provider conformance) is placeholder-only in Story 1 and activates in Story 5.

## Story List
1. `story-0-infrastructure` (setup only, 0 tests)
2. `story-1-contracts` (14 traceability tests: 12 executable + 2 placeholders)
3. `story-2-upsert-processor` (18 tests)
4. `story-3-session-api-registry` (14 tests)
5. `story-4-claude-provider` (14 tests)
6. `story-5-codex-provider` (8 tests)
7. `story-6-pipeline-browser-migration` (9 tests — post-pivot; compatibility window removed)
8. `story-7-e2e-cleanup-nfr` (12 tests: 7 TC + 5 NFR — post-pivot; TC-6.4b absorbed by Story 6)

## Running Totals
These totals are the execution ledger for story-pack gate checks in this `stories/` folder.
If other epic artifacts temporarily show different aggregate counts (for example from additional hardening TCs), use this ledger as the source of truth for story-level prompt verification.

- Story 0: 0
- Story 1: 14 (12 executable + 2 placeholders)
- Story 2: 32
- Story 3: 46
- Story 4: 60
- Story 5: 68
- Story 6: 77 (post-pivot: 9 tests, compatibility window removed)
- Story 7: 89 (post-pivot: 12 tests, TC-6.4b absorbed by Story 6)

## Orchestration Sequence
1. Execute Story 0 setup prompt, then Story 0 verify prompt.
2. For each Story 1-7: run `Skeleton+Red` -> `Green` -> human gorilla checks (where applicable) -> `Verify`.
3. Do not begin the next story until `green-verify` and story verify prompt pass.
4. Story 7 is the release gate: includes E2E verification, NFR checks, and dead code cleanup.
   Note: Legacy removal was moved to Story 6 (compatibility window pivot). Story 7 no longer owns legacy-family removal.
