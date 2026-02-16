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
- `Story 1` for contract/interface test implementation (12 tests closing AC-1.1/1.2/1.3, plus 2 placeholder conformance tests for AC-2.1b/c that activate in Stories 4-5).

This preserves the methodology rule that Story 0 is infrastructure-only while keeping full coverage from the tech design and test plan. Story 0 delivers the AC type surface; Story 1 closes the ACs with validation tests.

Note: TC-2.1b (Claude provider conformance) and TC-2.1c (Codex provider conformance) are mapped to Story 1 in the test plan but can only fully execute after Stories 4 and 5 create the providers. Story 1 may include compile-time `satisfies` stubs or defer these 2 TCs. Effective Story 1 test count: 12-14 depending on stub approach.

## Story List
1. `story-0-infrastructure` (setup only, 0 tests)
2. `story-1-contracts` (14 tests)
3. `story-2-upsert-processor` (18 tests)
4. `story-3-session-api-registry` (14 tests)
5. `story-4-claude-provider` (14 tests)
6. `story-5-codex-provider` (8 tests)
7. `story-6-pipeline-browser-migration` (11 tests)
8. `story-7-e2e-cleanup-nfr` (13 tests: 8 TC + 5 NFR)

## Running Totals
- Story 0: 0
- Story 1: 14
- Story 2: 32
- Story 3: 46
- Story 4: 60
- Story 5: 68
- Story 6: 79
- Story 7: 92

## Orchestration Sequence
1. Execute Story 0 setup prompt, then Story 0 verify prompt.
2. For each Story 1-7: run `Skeleton+Red` -> `Green` -> human gorilla checks (where applicable) -> `Verify`.
3. Do not begin the next story until `green-verify` and story verify prompt pass.
4. Story 7 is the release gate: includes legacy-removal sequencing checks and required NFR checks.
