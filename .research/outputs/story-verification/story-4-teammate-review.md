# Story 4 — Teammate Validation of Codex Report

## Codex Verdict: READY WITH ISSUES
## Teammate Verdict: AGREE — READY WITH ISSUES

The Codex report is largely accurate. All major issues verified with minor nuances on severity. One missed issue identified.

---

### Issue 1: Core contract inconsistency (local-only listing vs ACP join)

- **Codex claim:** Tech design line 634 says "session lists come from combining local metadata with ACP agent data," while line 638 says "listing is entirely local." Lines 2173 and 2191 still describe a "join" algorithm. This conflicts with story.md and feature spec (local-only).
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - `docs/tech-design-mvp.md:634` — Reads: "Session lists come from combining local metadata with ACP agent data." This is indeed contradictory phrasing.
  - `docs/tech-design-mvp.md:638` — Reads: "Since ACP has no `session/list` method, session listing is entirely local." This is the correct, authoritative statement.
  - `docs/tech-design-mvp.md:2173` — Reads: "Session CRUD via ACP, session listing with metadata join." The word "join" is ambiguous — it could mean "joining local metadata fields together" (assembling a list from local SessionMeta), not necessarily "joining with ACP data." However, read alongside line 634, it creates a misleading impression.
  - `docs/tech-design-mvp.md:2191` — Reads: "Join algorithm: local mappings + ACP list." This is clearly wrong — there IS no ACP list. This is the most problematic reference.
  - `docs/stories/story-4-session-management/story.md:5` and `:9` — Both clearly say local-only. Correct.
  - `docs/feature-spec-mvp.md:176` — Says "Session lists are maintained entirely locally by Liminal Builder." Correct.
- **Severity adjustment:** KEEP at Major. Lines 634 and 2191 are genuinely contradictory with the authoritative local-only design. Line 2191 ("Join algorithm: local mappings + ACP list") is the worst offender and could mislead a fresh-context engineer in the Green phase. The story prompts themselves override this correctly, but the tech design should be consistent.
- **Nuance Codex missed:** Line 634 is slightly more ambiguous than claimed — "combining local metadata with ACP agent data" could theoretically refer to the `openSession` flow (which DOES call ACP for history replay). The issue is that in the listing context, no ACP call happens. The sentence's placement under "Session list assembly" makes it misleading regardless.

---

### Issue 2: Traceability gap — 3 TCs missing from Story 4 test plan

- **Codex claim:** TC-2.2d, TC-2.2e, TC-2.3b exist in the feature spec but are excluded from Story 4's test breakdown. The verify prompt only lists 13 TCs.
- **Validated:** TRUE
- **Evidence:**
  - `docs/feature-spec-mvp.md:216-223` — TC-2.2d (Claude Code end-to-end) and TC-2.2e (Codex end-to-end) exist. These are integration/gorilla tests requiring full agent connectivity.
  - `docs/feature-spec-mvp.md:235-238` — TC-2.3b (Open session that is already tabbed → activates existing tab) exists.
  - `docs/stories/story-4-session-management/story.md:51-54` — Test breakdown lists only TC-2.1a-c, TC-2.2a, TC-2.2b-c, TC-2.2f, TC-2.3a, TC-2.4a-c, TC-2.5a-b. No TC-2.2d, TC-2.2e, or TC-2.3b.
  - `docs/stories/story-4-session-management/prompt-4.R-verify.md:72-86` — Verify TC table has exactly 13 entries, none of the 3 missing TCs.
  - **However:** TC-2.3b IS in Story 5's test breakdown (`docs/stories/story-5-tab-management/story.md:73`). TC-2.2d and TC-2.2e are labeled "Manual / Gorilla" in the tech design (`docs/tech-design-mvp.md:1725-1726`).
  - The tech design story section (`docs/tech-design-mvp.md:2176`) claims Story 4 covers "TC-2.2a-f, TC-2.3a-b" — i.e., ALL of them. This is the inconsistency: the tech design story section claims broader TC coverage than the actual story delivers.
- **Severity adjustment:** KEEP at Major. The missing TCs are legitimately deferred (TC-2.2d/e to gorilla, TC-2.3b to Story 5), but there's no explicit deferral documentation in Story 4. The tech design claims TC-2.2a-f and TC-2.3a-b for Story 4, creating a false impression of full coverage. A TC ownership table is needed.

---

### Issue 3: AC weakening in Green prompt for archive behavior

- **Codex claim:** Feature spec requires archive to close associated tab (TC-2.4b), but Green prompt line 298 says "if not wired yet, just remove from sidebar."
- **Validated:** TRUE
- **Evidence:**
  - `docs/feature-spec-mvp.md:248-251` — TC-2.4b: "Given: A session is open in a tab / When: User archives the session / Then: The tab is closed and the session disappears from the sidebar." Clear requirement.
  - `docs/stories/story-4-session-management/prompt-4.2-green.md:298` — "Close any associated tab (coordinate with tabs.js if available; if not wired yet, just remove from sidebar)." This hedges the requirement.
  - Story 4 test breakdown (`story.md:54`) includes TC-2.4b in `tests/client/sidebar.test.ts`. So the test IS written for Story 4.
  - The hedge makes sense architecturally: Story 5 implements tabs.js, so in Story 4, tabs.js is a stub. The sidebar test for TC-2.4b would need to mock or stub the tab interaction.
- **Severity adjustment:** DOWNGRADE to Minor. The hedge is pragmatic — Story 4 executes before Story 5, so tabs.js isn't implemented yet. The test is still written and included. The implementation just needs to call into tabs.js when available. The recommendation should be: clarify in the prompt that the implementation should call `closeTab()` (which will be a no-op stub in Story 4's context) rather than conditionally skipping it.

---

### Issue 4 (Minor): Red prompt verification commands internally inconsistent

- **Codex claim:** Prompt asks to run full suites (line 377) while expecting prior tests pass and new tests fail (lines 387-389).
- **Validated:** PARTIALLY TRUE
- **Evidence:**
  - `prompt-4.1-skeleton-red.md:377` — Runs `bun run test && bun run test:client` (full suites).
  - `prompt-4.1-skeleton-red.md:380-382` — Then also runs individual `vitest run` commands for new test files specifically.
  - `prompt-4.1-skeleton-red.md:387-389` — Expectations: prior tests pass (44), new tests fail.
  - The "inconsistency" is mild. The full suite run (`bun run test && bun run test:client`) will include both old and new tests. Some new tests will fail/error as expected. The separate `vitest run` commands isolate the new tests. This is a reasonable verification pattern, though it could be clearer about expected mixed results from the full suite run.
- **Severity adjustment:** KEEP at Minor. The commands work, but the expected outcomes paragraph doesn't explicitly say "the full suite will have 13 errors from new tests alongside 44 passes." A fresh engineer might be confused.

---

### Issue 5 (Minor): Dependency narrative mismatch for Story 6

- **Codex claim:** `overview.md:25` says Story 6 starts only after Story 5, but `tech-design-mvp.md:2275` says Story 6 depends on Story 2b.
- **Validated:** TRUE
- **Evidence:**
  - `docs/stories/overview.md:25` — "Story 6 starts only after Story 5 (Stories 0-5 complete)."
  - `docs/tech-design-mvp.md:2275` — "Story 6 depends on Story 2b (agent manager must exist)."
  - The tech design dependency graph diagram (`tech-design-mvp.md:2272`) shows Story 6 branching from Story 2b, not from Story 5. But the prose at 2275 says "Story 6 depends on Story 2b."
  - overview.md is more conservative (requires all prior stories). The tech design is more permissive (only needs 2b).
- **Severity adjustment:** KEEP at Minor. Not a Story 4 blocker. But the inconsistency could cause confusion about when Story 6 can start executing, which affects pipeline planning.

---

## Missed Issues

### Missed Issue 1 (Minor): Story 4 prerequisite test count for Story 2a is wrong

- `docs/stories/story-4-session-management/story.md:16` says "Story 2a complete (ACP client protocol layer, 17 tests pass)."
- According to `docs/stories/overview.md:33-34`, Story 2a has 8 tests (running total 17). The 17 is the RUNNING total, not Story 2a's count.
- The phrasing "ACP client protocol layer, 17 tests pass" implies 17 tests belong to Story 2a. It should say "running total 17 tests pass" or "8 tests pass."
- Same issue on line 17: "Story 2b complete (agent manager + WebSocket bridge, 27 tests pass)" — 27 is the running total, not Story 2b's count (which is 10).
- This is confusing but not blocking since all the stated running totals are correct.

### Missed Issue 2 (Minor): Tech design line 2176 claims TC-2.2a-f but Story 4 only tests TC-2.2a, TC-2.2b, TC-2.2c, TC-2.2f

- `docs/tech-design-mvp.md:2176` lists "TC-2.2a-f" (implying all 6).
- Story 4 actually tests 4 of 6 (TC-2.2a, b, c, f). Missing: TC-2.2d, TC-2.2e.
- This overlaps with Issue 2 but is specifically a tech design claim accuracy problem, not just a traceability gap in the story docs.

---

## Summary

The Codex report for Story 4 is **high quality**. All 5 issues are verified as legitimate findings. One severity adjustment recommended (Issue 3 downgraded from Major to Minor due to pragmatic Story 4 → Story 5 ordering). Two minor missed issues identified (prerequisite test count phrasing and tech design TC range overclaim).

**Final Verdict: READY WITH ISSUES** — 2 Major (contract inconsistency + traceability gap), 4 Minor. No Critical blockers. Story 4 can proceed to execution with the understanding that the tech design "join" language and TC ownership need cleanup, ideally before but acceptably during execution.
