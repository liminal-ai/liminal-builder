Overall readiness verdict: **NOT READY**

**Critical Issues**
1. **Core external dependency is still unresolved for Story 6’s primary goal (Codex support).**
   - Evidence: `docs/tech-design-mvp.md:2286` (Codex adapter stability is still an open question with fallback to skipping Codex), while Story 6 requires Codex integration in `docs/stories/story-6-codex-status-integration/story.md:7` and `docs/stories/story-6-codex-status-integration/story.md:31`.

**Major Issues**
1. **AC-5.2 UI traceability is weak/incomplete.**
   - Feature spec defines UI-visible behaviors (status icon, disabled input, reconnect button): `docs/feature-spec-mvp.md:496`, `docs/feature-spec-mvp.md:505`, `docs/feature-spec-mvp.md:513`.
   - Story 6 says TC-5.2a-d were already tested in Story 2b: `docs/stories/story-6-codex-status-integration/story.md:28`.
   - Story 6 new tests do not include portlet/sidebar UI tests: `docs/stories/story-6-codex-status-integration/story.md:73`, `docs/stories/story-6-codex-status-integration/story.md:84`.
   - Verify prompt maps AC-5.2 only to server agent-manager tests: `docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:153`.

2. **Codex path is not exercised in Story 6 automated tests.**
   - Story scope includes TC-2.2e (Codex end-to-end): `docs/tech-design-mvp.md:2232`, `docs/tech-design-mvp.md:2233`.
   - Story 6 test snippets use `cliType: 'claude-code'` only: `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:200`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:381`.
   - TC-2.2e is left manual/Gorilla in verify: `docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:97`.

3. **TC-1.3b is misrepresented in Story 6 integration test coverage.**
   - TC-1.3b requires “remove project with open tabs” and associated tabs closed: `docs/feature-spec-mvp.md:155`.
   - Story 6 test only asserts `project:removed`: `docs/stories/story-6-codex-status-integration/story.md:81`, `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:256`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:453`.

4. **`liminal:tabs` contract mismatch between prompts and design.**
   - Design contract: `{ openTabs, activeTab, tabOrder }`: `docs/tech-design-mvp.md:264`.
   - Story 6 prompts add `tabMeta` in test state: `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:308`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:511`.

5. **Reconnect/resync behavior is incompletely specified in Green prompt code.**
   - Design requires re-send `project:list` and `session:list` on reconnect, and reopen sessions on refresh: `docs/tech-design-mvp.md:240`, `docs/tech-design-mvp.md:243`.
   - Prompt sample only explicitly sends `project:list`; `session:list/session:open` is left implicit/comments: `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:155`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:162`.

6. **Prompt implementation guidance is not fully self-contained for a fresh-context engineer.**
   - Key integration setup is left as placeholders (`...`, “import your server setup modules”): `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:153`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:307`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:323`.

**Minor Issues**
1. **Dependency sequencing is inconsistent across artifacts.**
   - Overview says Story 6 starts only after Story 5: `docs/stories/overview.md:25`.
   - Tech design says Story 6 depends on Story 2b: `docs/tech-design-mvp.md:2275`.
   - Story 6 prerequisites require Stories 0–5 complete: `docs/stories/story-6-codex-status-integration/story.md:16`.

2. **Reference line pointers in prompt are stale.**
   - Prompt cites Story 6 tech design at `~2086-2115`: `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:28`.
   - Actual Story 6 section is around `docs/tech-design-mvp.md:2228`.

**Recommendations**
1. Resolve Codex adapter dependency explicitly (lock adapter/version, install path, fallback decision) before execution.
2. Add Story 6 automated coverage for AC-5.2 UI behavior (`portlet` status dot/input disable + sidebar reconnect button).
3. Add at least one Codex-specific integration test path (`session:create` + `session:send` with `cliType: 'codex'`).
4. Fix TC-1.3b mapping: either test actual tab-closure behavior in client tests or remove TC-1.3b claim from websocket integration.
5. Align `liminal:tabs` test fixtures with canonical contract (or update design/spec contract if `tabMeta` is required).
6. Make prompts executable without ambiguity: provide concrete server test harness setup and exact mock ACP wiring steps.