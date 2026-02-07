# Cross-Document Coherence Audit — Liminal Builder MVP

**Date:** 2026-02-07
**Auditor:** Fresh validation agent (Opus 4.6)
**Scope:** Feature spec, tech design, overview, all 8 story docs, all 23 prompt files
**Methodology references loaded:** SKILL.md + 8 reference docs (all present, none missing)

---

## 1) Verdict

**READY WITH ISSUES** — 3 Critical, 5 Major, 8 Minor

Execution can proceed on most stories, but the test-count chain split (COH-001) must be resolved first to prevent cascading confusion during TDD phases. The Story 2b phantom test scope (COH-002) must be resolved to establish whether the MVP target is 79 or 84 tests.

---

## 2) Findings

### Critical

---

#### COH-001 — Running total chain split across story docs
**Severity:** Critical
**Evidence:**
- Tech design body (`tech-design-mvp.md:2094`): Story 2a = **8 tests** in `acp-client.test.ts`
- Handoff-02 Fix 2a.1 added a 9th test (`sessionCancel` notification), updating story-2a docs to **9 tests**
- Tech design self-review (`tech-design-mvp.md:2322`): says `0 → 9 → 18 → 28 → 45 → 58 → 72 → 79` (reflecting 9 tests for 2a)
- Tech design body was NOT updated — still says 8 tests at line 2094
- This created two competing running-total chains:

| Story | Chain A (body/stale) | Chain B (overview/self-review) |
|-------|---------------------|-------------------------------|
| 2a | 8 → cumul 17 | 9 → cumul 18 |
| 2b | 10 → cumul 27 | 10 → cumul 28 |
| 3 | 17 → cumul 44 | 17 → cumul 45 |
| 4 | 13 → cumul 57 | 13 → cumul 58 |
| 5 | 14 → cumul 71 | 14 → cumul 72 |
| 6 | 7 → cumul 78 | 7 → cumul 79 |

- Story docs using Chain A (stale): `story-3/story.md` (Story 2b cumul = 27, Story 3 cumul = 44), `story-5/story.md` (prev = 57, cumul = 71), `story-6/story.md` (prev = 71)
- Story docs using Chain B (correct): `overview.md`, `story-4/story.md` (cumul = 28, 45, 58), verify prompts (prompt-6.R uses 72, 79)

**Why it matters:** Executing agents use these running totals as pass/fail gates. A Story 3 agent seeing "28 existing tests pass" in the overview but "27 tests pass" in the Story 3 story.md will be confused about expected counts. Mismatched expectations cause unnecessary debugging during TDD phases.

**Recommended fix:** Update tech design line 2094 from 8 to 9. Update Story 3 story.md: prereq "Story 2b: 28 tests pass", cumulative table 2b=28, Story 3=45. Update Story 5 story.md: prev=58, cumul=72. Update Story 6 story.md: prev=72 (arithmetic then works: 72+7=79).

**Effort:** Low | **Value:** High

---

#### COH-002 — Story 2b phantom WS bridge tests: 15 tests documented, 10 counted
**Severity:** Critical
**Evidence:**
- `story-2b/story.md` test breakdown table: `agent-manager.test.ts` (10 tests) + `websocket.test.ts` (5 tests) = **15 tests**
- Explicit statement: "Story 2b test scope: 10 AgentManager lifecycle tests plus 5 WS bridge routing/forwarding tests"
- Overview: Story 2b = **10 tests**, running total 28
- Tech design TDD Red (`tech-design-mvp.md:2119-2121`): only lists `agent-manager.test.ts | 10`
- All downstream story.md files count Story 2b as contributing 10 tests
- The 5 WS bridge tests partially overlap with Story 6's 6 websocket.test.ts tests (both test session:create, session:send, session:cancel round-trips at different levels)

**Why it matters:** If Story 2b is executed with 15 tests, the running total diverges by +5 from every downstream reference. If executed with 10 tests, the story.md is misleading. Either way, the execution agent will face contradictory instructions.

**Recommended fix:** Decide: (a) Count the 5 WS bridge tests in Story 2b and update all running totals to target 84 total, OR (b) Move the 5 WS bridge tests to Story 6 (where similar integration tests already live) and update Story 2b's story.md to remove them. Option (b) is recommended — it keeps Story 2b focused on the AgentManager unit and avoids overlap with Story 6.

**Effort:** Medium | **Value:** High

---

#### COH-003 — Story 3 prerequisites self-contradiction
**Severity:** Critical
**Evidence:**
- `story-3/story.md` prerequisites:
  - Line: "Story 2a complete (ACP client protocol layer, **18** tests pass)"
  - Line: "Story 2b complete (agent manager + WebSocket bridge, **27** tests pass)"
  - Line: "All **28** existing tests pass"
- 18 for Story 2a implies 2a has 9 tests (Chain B). 27 for Story 2b implies 2b added 9 tests (18+9=27), but Story 2b adds 10. The "All 28 existing tests" line uses Chain B (18+10=28) but contradicts the "27" line directly above it.

**Why it matters:** An execution agent reading these prereqs will see contradictory numbers in the same section and cannot determine the correct expected baseline. This will trigger an unnecessary "stop and ask" per the methodology's inconsistency protocol.

**Recommended fix:** Change to: "Story 2b complete (agent manager + WebSocket bridge, 10 tests; running total: 28)" and "All 28 existing tests pass". Matches Chain B consistently.

**Effort:** Low | **Value:** High

---

### Major

---

#### COH-004 — `verify` script in docs misses `lint:eslint` and `test:eslint-plugin`
**Severity:** Major
**Evidence:**
- `package.json:22`: `"verify": "bun run format:check && bun run lint && bun run lint:eslint && bun run test:eslint-plugin && bun run typecheck && bun run test"`
- `story-0/story.md`: `verify: bun run format:check && bun run lint && bun run typecheck && bun run test` (missing 2 steps)
- `overview.md:65-66`: same omission
- `tech-design-mvp.md:2042`: same omission
- Verify PROMPTS correctly describe all steps: "format:check, biome lint, eslint, eslint-plugin tests, typecheck, server tests"

**Why it matters:** Story 0's setup prompt may not install the eslint dependencies or create the eslint config because the story.md doesn't mention them. If `bun run verify` is the gate, missing eslint will cause failures that look like bugs but are actually missing setup.

**Recommended fix:** Update story-0 story.md, overview.md, and tech-design-mvp.md verify script descriptions to include `lint:eslint` and `test:eslint-plugin`.

**Effort:** Low | **Value:** High

---

#### COH-005 — Story 0 `verify-all` missing `test:client`
**Severity:** Major
**Evidence:**
- `story-0/story.md`: `verify-all: bun run verify && bun run test:integration && bun run test:e2e` (missing `test:client`)
- `package.json:23`: `"verify-all": "bun run verify && bun run test:client && bun run test:integration && bun run test:e2e"`
- `overview.md:66`: correctly includes `test:client`
- `tech-design-mvp.md:2043`: omits `test:client`

**Why it matters:** If Story 0 setup follows story.md's script definition, `verify-all` will NOT run client tests. Client tests (sidebar, tabs, chat, input, portlet) won't be caught by the full gate, breaking the verification guarantee for Stories 1, 3, 4, 5, 6.

**Recommended fix:** Update story-0/story.md and tech-design-mvp.md verify-all definitions to include `test:client`.

**Effort:** Low | **Value:** High

---

#### COH-006 — Story 6 dependency graph conflict (3-way)
**Severity:** Major
**Evidence:**
- `overview.md:25`: "Story 6 starts only after Story 5 (Stories 0-5 complete)"
- `tech-design-mvp.md:2272`: dependency graph shows Story 6 branching from Story 2b only
- `tech-design-mvp.md:2275`: "Story 6 depends on Story 2b (agent manager must exist)"
- `story-6/story.md:15-16`: "Operational prerequisite: Stories 0-5 complete. Architectural dependency: Story 2b"
- Story 6 modifies files from Stories 1 (sidebar.js), 3 (portlet.js/portlet.css), 5 (tabs.test.ts) — proving it needs code from multiple earlier stories

**Why it matters:** The tech design's dependency graph suggests Story 6 could run in parallel with Stories 3-5, which would fail because it modifies files those stories create. The story.md correctly reconciles this but the tech design graph is misleading.

**Recommended fix:** Update tech-design-mvp.md dependency graph (line 2272) to show Story 6 depending on Story 5 (sequential after all stories). Update line 2275 to: "Story 6 executes after Story 5 (operationally sequential). Its architectural dependency is Story 2b, but it modifies files created by Stories 1, 3, and 5."

**Effort:** Low | **Value:** Medium

---

#### COH-007 — Story 6 arithmetic error in story.md cumulative table
**Severity:** Major
**Evidence:**
- `story-6/story.md` cumulative table: Previous (Stories 0-5) = 71, Story 6 = 7, Cumulative = **79**
- 71 + 7 = 78, not 79
- The "71" is the stale Chain A value (should be 72 per Chain B)
- With corrected previous = 72: 72 + 7 = 79 ✓

**Why it matters:** The story.md will either confuse the execution agent (wrong arithmetic) or cause it to expect 79 tests when only 78 exist (if the stale previous of 71 is correct). Fixing COH-001 fixes this automatically.

**Recommended fix:** Fix as part of COH-001 — update previous to 72, then 72+7=79 is correct.

**Effort:** Low (part of COH-001) | **Value:** High

---

#### COH-008 — `shared/types.ts` missing from tech design module architecture
**Severity:** Major
**Evidence:**
- `shared/types.ts` exists in the repo and is referenced at `tech-design-mvp.md:1635`
- Story 0 story.md correctly lists it under "Shared" files
- Story 0 prompt-0.1-setup.md includes it in the file creation list
- Tech design Module Architecture (lines 298-339) does NOT show a `shared/` directory at project root
- Tech design Story 0 deliverables table (lines 1982-2013) does NOT list `shared/types.ts`
- `package.json` eslint scope: `server shared tests` — confirms `shared/` is a first-class directory
- Multiple story docs reference it (story-1 prereqs, story-2a prereqs, story-2b existing files, etc.)

**Why it matters:** A developer reading the tech design's module architecture gets an incomplete picture of the codebase. The `shared/` directory is a key architectural element (shared types between server TS and client JS) that's invisible in the design doc.

**Recommended fix:** Add `shared/` to the tech design's module architecture section. Add `shared/types.ts` to the Story 0 deliverables table.

**Effort:** Low | **Value:** Medium

---

### Minor

---

#### COH-009 — Tech design body Story 2a test count stale (8 vs 9)
**Severity:** Minor
**Evidence:**
- `tech-design-mvp.md:2094`: `tests/server/acp-client.test.ts | **8**`
- Tech design self-review checklist says 18 for 2a cumulative (implies 9 tests)
- Story-2a docs, prompts, and overview all say 9
- Root cause: Handoff-02 Fix 2a.1 added a 9th test but the tech design body was never updated

**Why it matters:** Tech design body is a reference document. The stale count could mislead future audits. Low severity because downstream consumers (story docs, prompts) have the correct count.

**Recommended fix:** Change line 2094 from `| 8 |` to `| 9 |`. Update exit criteria on line 2104 from "17 tests PASS" to "18 tests PASS".

**Effort:** Low | **Value:** Low

---

#### COH-010 — Story 5 TDD Red lists 13 TCs for 14 tests
**Severity:** Minor
**Evidence:**
- `tech-design-mvp.md:2212`: Story 5 TDD Red = `tabs.test.ts | 14 | TC-4.1a-b, TC-4.2a, TC-4.3a-b, TC-4.4a-c, TC-4.5a-b, TC-4.6a-b, TC-4.7a`
- Counting: 4.1a, 4.1b, 4.2a, 4.3a, 4.3b, 4.4a, 4.4b, 4.4c, 4.5a, 4.5b, 4.6a, 4.6b, 4.7a = **13 TCs**
- But the test count is **14** — the 14th test is TC-2.3b ("open already-tabbed session activates existing tab") which appears in the TC mapping table but not in the Story 5 TDD Red TC list
- Story 5 story.md correctly includes TC-2.3b in its test breakdown table

**Why it matters:** Minor discrepancy between tech design TC list notation and actual test coverage. Story docs are correct.

**Recommended fix:** Add TC-2.3b to the tech design Story 5 TDD Red TC list.

**Effort:** Low | **Value:** Low

---

#### COH-011 — Feature spec Story 6 lists TCs as ACs
**Severity:** Minor
**Evidence:**
- `feature-spec-mvp.md:844-845`: Story 6 "ACs covered" includes `TC-2.2d` and `TC-2.2e`
- These are Test Conditions, not Acceptance Criteria. They belong to AC-2.2.

**Why it matters:** Labeling TCs as ACs in the traceability section creates mild confusion. The feature spec's traceability matrix (line 859) correctly maps these.

**Recommended fix:** Change Story 6 description to: "ACs covered: AC-5.2, AC-5.6. TCs also verified: TC-2.2d, TC-2.2e."

**Effort:** Low | **Value:** Low

---

#### COH-012 — websocket.test.ts in `tests/server/` but labeled "Integration"
**Severity:** Minor
**Evidence:**
- `tech-design-mvp.md:1710`: "`tests/server/websocket.test.ts` — Integration: WebSocket message routing"
- File path is `tests/server/`, not `tests/integration/`
- `bun run test` runs `vitest run tests/server` — so websocket.test.ts runs with server tests
- `bun run test:integration` runs `vitest run tests/integration` — websocket.test.ts is NOT included

**Why it matters:** The "Integration" label could mislead someone into thinking these tests run under `bun run test:integration`. They actually run under `bun run test`.

**Recommended fix:** Either rename the tech design header to "WebSocket message routing" (dropping "Integration") or move the test file to `tests/integration/` if true integration isolation is desired.

**Effort:** Low | **Value:** Low

---

#### COH-013 — Story 2b WS tests overlap with Story 6 WS tests
**Severity:** Minor (dependent on COH-002 resolution)
**Evidence:**
- Story 2b websocket.test.ts tests: session:create routing, session:send routing, session:cancel routing
- Story 6 websocket.test.ts tests: session:create round-trip, session:send streams response, cancel round-trip
- Three overlapping subjects tested at different levels (unit vs integration)
- Both stories add tests to the same file without acknowledging the overlap

**Why it matters:** If both are implemented, websocket.test.ts has overlapping test names that could confuse coverage analysis. If COH-002 resolves by moving Story 2b's WS tests to Story 6, this becomes moot.

**Recommended fix:** If both stay, add comments distinguishing unit routing tests (2b) from integration round-trip tests (6). If COH-002 moves tests, this resolves automatically.

**Effort:** Low | **Value:** Low

---

#### COH-014 — Handoff-02 Fix 3.8 uses stale count (8 for Story 2a)
**Severity:** Minor
**Evidence:**
- `handoff/02-story-verification-fixes.md:320`: Fix 3.8 says change to "Story 2a complete (8 tests, running total: 17)"
- But Fix 2a.1 (line 88-92) changes Story 2a from 8 to 9 tests
- These fixes in the same handoff document contradict each other

**Why it matters:** If someone applies Fix 3.8 literally, they'll revert the Fix 2a.1 count. The handoff is a historical record but could mislead future fix passes.

**Recommended fix:** Note in handoff doc that Fix 3.8's count should be "9 tests, running total: 18" after Fix 2a.1.

**Effort:** Low | **Value:** Low

---

#### COH-015 — Tech design dependency baseline packages differ from package.json
**Severity:** Minor
**Evidence:**
- Tech design (lines 1867-1886) recommends specific version ranges: `fastify ^5.7.4`, `@fastify/static ^9.0.0`, `marked ^17.0.1`, `typescript ^5.9.3`, etc.
- `package.json` has different ranges: `fastify ^5.0.0`, `@fastify/static ^8.0.0`, `marked ^15.0.0`, `typescript ^5.7.0`
- Tech design adds packages not in package.json: `@fastify/sensible`, `zod`, `fastify-type-provider-zod`
- Story 0 story.md baseline reference includes these: "@fastify/sensible, zod, fastify-type-provider-zod"

**Why it matters:** Story 0 setup prompt will need to resolve which version baselines to use. The package.json is the actual state; the tech design lists aspirational versions. The missing packages (sensible, zod, type-provider-zod) may not get installed if the execution agent follows package.json instead of the tech design.

**Recommended fix:** Either update package.json to include the missing packages, or note in the Story 0 setup prompt that these packages must be added. The version ranges in tech design should match the actual package.json or vice versa.

**Effort:** Low | **Value:** Medium

---

#### COH-016 — TC-2.2f dual ownership not acknowledged
**Severity:** Minor
**Evidence:**
- `handoff/02-story-verification-fixes.md:462`: "TC-2.2f appears in both `tests/server/session-manager.test.ts` (Story 4) and `tests/server/websocket.test.ts` (Story 6). This dual ownership is valid (unit + integration) but not explicitly acknowledged."
- Tech design TC mapping lists TC-2.2f in both files
- No story doc mentions this dual ownership

**Why it matters:** Counting TC-2.2f twice could inflate perceived coverage. Dual ownership is fine but should be documented.

**Recommended fix:** Add a note in Story 6's test breakdown: "TC-2.2f also unit-tested in Story 4's session-manager.test.ts."

**Effort:** Low | **Value:** Low

---

## 3) Low-Effort Patch Set

All findings below are Low effort. Listed with one-line change summary:

| ID | Severity | Value | File(s) | Change |
|----|----------|-------|---------|--------|
| COH-001 | Critical | High | `tech-design-mvp.md:2094,2104`; `story-3/story.md` prereqs + cumul table; `story-5/story.md` cumul table; `story-6/story.md` cumul table | Update all running totals to Chain B: 0,9,18,28,45,58,72,79 |
| COH-003 | Critical | High | `story-3/story.md` prerequisites | Change "27 tests pass" to "10 tests; running total: 28" |
| COH-004 | Major | High | `story-0/story.md`, `overview.md`, `tech-design-mvp.md` | Add `lint:eslint` and `test:eslint-plugin` to verify script description |
| COH-005 | Major | High | `story-0/story.md`, `tech-design-mvp.md` | Add `test:client` to verify-all script description |
| COH-006 | Major | Medium | `tech-design-mvp.md:2272-2275` | Update dependency graph to show Story 6 after Story 5 |
| COH-007 | Major | High | (fixed by COH-001) | Previous=72, 72+7=79 ✓ |
| COH-008 | Major | Medium | `tech-design-mvp.md` module arch + Story 0 table | Add `shared/types.ts` to architecture diagram and deliverables |
| COH-009 | Minor | Low | `tech-design-mvp.md:2094` | Change 8 to 9 |
| COH-010 | Minor | Low | `tech-design-mvp.md:2212` | Add TC-2.3b to Story 5 TDD Red TC list |
| COH-011 | Minor | Low | `feature-spec-mvp.md:844-845` | Relabel TC-2.2d/TC-2.2e as TCs not ACs |
| COH-012 | Minor | Low | `tech-design-mvp.md:1710` | Remove "Integration:" from section header |
| COH-014 | Minor | Low | `handoff/02-story-verification-fixes.md:320` | Note Fix 3.8 count should be 9 after Fix 2a.1 |
| COH-015 | Minor | Medium | `package.json` or `story-0/prompt-0.1-setup.md` | Reconcile missing packages (sensible, zod, type-provider-zod) |
| COH-016 | Minor | Low | `story-6/story.md` test breakdown | Add note about TC-2.2f dual ownership |

---

## 4) Medium/High-Effort Backlog

| ID | Severity | Value | Effort | Tradeoff | Suggested Sequence |
|----|----------|-------|--------|----------|-------------------|
| COH-002 | Critical | High | Medium | Story 2b's 5 WS bridge tests must either be counted (changing target to 84) or relocated to Story 6 (maintaining 79 target). Relocating is cleaner but requires updating Story 2b story.md, Story 6 story.md, and all prompts that reference websocket test counts. | Fix BEFORE Story 2b execution. Must decide 79 vs 84 target first. |
| COH-013 | Minor | Low | Low-Medium | Depends on COH-002 resolution. If both story WS tests remain, add distinguishing comments. | Fix AFTER COH-002 is decided. |

---

## 5) Consistency Matrix

| Story | Internally Coherent? | Coherent with Feature Spec? | Coherent with Tech Design? | Coherent with Overview/Deps? | Notes |
|-------|---------------------|-----------------------------|---------------------------|------------------------------|-------|
| 0 | N | Y | N | N | verify/verify-all script definitions miss lint:eslint, test:eslint-plugin, test:client (COH-004, COH-005). shared/types.ts missing from tech design (COH-008). Package baselines diverge (COH-015). |
| 1 | Y | Y | Y | Y | Clean after handoff-02 fixes. TC-1.3b deferral documented. |
| 2a | Y | Y | N | Y | Story docs updated to 9 tests. Tech design body still says 8 (COH-009). |
| 2b | N | Y | N | N | 15 tests documented in story.md but 10 counted everywhere else (COH-002). Cumulative totals in downstream stories don't include the 5 WS bridge tests. |
| 3 | N | Y | Y | N | Prerequisites self-contradict: 27 vs 28 (COH-003). Cumulative table uses stale Chain A (COH-001). |
| 4 | Y | Y | Y | Y | Clean. All counts match Chain B. |
| 5 | N | Y | Y | N | Cumulative table uses stale Chain A: 57/71 instead of 58/72 (COH-001). |
| 6 | N | Y | N | N | Stale previous (71 not 72), arithmetic error (71+7≠79) (COH-007). Dependency graph conflict (COH-006). |

---

## 6) Final Readiness Statement

Execution **can proceed** on Stories 0 and 1 immediately — these have no test-count dependencies on the chain split. Story 2a can also proceed (its own test count of 9 is internally consistent). However, **three items must be resolved before executing Story 2b and beyond:**

1. **COH-002** (Story 2b test scope): Decide whether the MVP target is 79 or 84 tests. This determines whether Story 2b's 5 WS bridge tests are in scope or deferred. Recommendation: relocate them to Story 6, keeping the 79 target.

2. **COH-001/003/007** (running total chain): Align all story.md files to Chain B (0, 9, 18, 28, 45, 58, 72, 79). This is a mechanical text update across 4 files.

3. **COH-004/005** (verify script): Ensure Story 0's setup prompt installs eslint dependencies and configures the verify/verify-all scripts correctly. The package.json is already correct; the docs must match.

These three groups are all low-to-medium effort and can be resolved in a single focused patch pass. After that, the doc suite is execution-ready.
