1. **Pushback on Major Issue 3 (archive tab close)**
- **Decision:** **CONCEDE**
- **Evidence:**
  - `docs/stories/overview.md:18` to `docs/stories/overview.md:20` shows Story 4 runs before Story 5.
  - `docs/tech-design-mvp.md:2275` says “Story 5 depends on Story 4.”
  - `client/shell/tabs.js:1` to `client/shell/tabs.js:4` explicitly says tabs is a stub “Will be implemented in Story 5.”
  - `docs/stories/story-4-session-management/prompt-4.2-green.md:298` allows “if not wired yet, just remove from sidebar.”
- **Revised severity:** **Minor** (wording should still be tightened to avoid implying TC-2.4b can be skipped).

2. **Prerequisite test count phrasing ambiguity**
- **Decision:** **CONCEDE**
- **Evidence:**
  - `docs/stories/story-4-session-management/story.md:16` says Story 2a has “17 tests pass.”
  - `docs/stories/story-4-session-management/story.md:17` says Story 2b has “27 tests pass.”
  - `docs/stories/overview.md:33` and `docs/stories/overview.md:34` show those are running totals; Story 2a is 8 tests, Story 2b is 10 tests.
- **Revised severity:** **Minor**.

3. **Tech design TC range overclaim**
- **Decision:** **PARTIALLY CONCEDE**
- **Evidence:**
  - `docs/tech-design-mvp.md:2176` claims Story 4 TCs include `TC-2.2a-f` and `TC-2.3a-b`.
  - Story 4’s own test breakdown only lists subset TCs in `docs/tech-design-mvp.md:2182` to `docs/tech-design-mvp.md:2183` and `docs/stories/story-4-session-management/story.md:53` to `docs/stories/story-4-session-management/story.md:54`.
  - `TC-2.3b` appears in Story 5 at `docs/stories/story-5-tab-management/story.md:73`.
  - `TC-2.2d/e` are manual/gorilla at `docs/tech-design-mvp.md:1725` to `docs/tech-design-mvp.md:1726` and mapped under Story 6 in `docs/feature-spec-mvp.md:844` to `docs/feature-spec-mvp.md:845`.
- **Revised severity:** If tracked as a separate issue, **Minor** documentation overclaim; root cause remains covered by the existing traceability major issue.

**REVISED VERDICT for Story 4:** **READY WITH ISSUES** (with Issue 3 downgraded to Minor).