1. **Codex adapter dependency blocker**: **CONCEDE**  
Evidence: `docs/tech-design-mvp.md:2286` marks adapter stability as an open question, but Story 6 test design explicitly mocks ACP (`docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:49`) and real CLI validation is already deferred (`docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:220`).  
Revised severity: **Minor**.

2. **Codex path not tested**: **PARTIALLY CONCEDE**  
Evidence: Story 6 snippets use `cliType: 'claude-code'` (`docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:200`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:381`), while Codex E2E is manual (`docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:97`).  
Revised severity: **Minor** (real gap, but low risk at mocked ACP layer).

3. **TC-1.3b misrepresented**: **DEFEND**  
Evidence: TC-1.3b requires tab closure (`docs/feature-spec-mvp.md:154-157`), but the Story 6 WS test only checks `project:removed` (`docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:453`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:464-470`), and traceability maps TC-1.3b to that server test (`docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:82`).  
Severity unchanged: **Major**.

4. **`tabMeta` contract mismatch**: **CONCEDE**  
Evidence: Tech design summary omits `tabMeta` (`docs/tech-design-mvp.md:264`), but Story 5 already introduced it (`docs/stories/story-5-tab-management/prompt-5.2-green.md:318-331`, `docs/stories/story-5-tab-management/prompt-5.2-green.md:536`), and Story 6 follows that (`docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:511-515`).  
Revised severity: **Minor** (doc staleness).

5. **Backoff distinction confusion risk**: **PARTIALLY CONCEDE**  
Evidence: WS backoff is documented as `500ms..5s`, no retry cap (`docs/tech-design-mvp.md:237-241`), while agent reconnect is `1s..16s`, cap 30s, 5 retries (`docs/stories/story-2b-agent-manager/story.md:7`).  
Revised severity: **Minor** (documented, but easy to misread across stories).

6. **TC-2.2f dual ownership undocumented**: **PARTIALLY CONCEDE**  
Evidence: It is listed in both test files (`docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:38-39`), but flow mapping only points to websocket (`docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:98`).  
Revised severity: **Minor** (inconsistency, not blocker).

7. **TC-2.3b allocation/test-count confirmation**: **CONCEDE**  
Evidence: Story 5 includes TC-2.3b in its 14 tests (`docs/stories/story-5-tab-management/story.md:73-75`), Story 6 verify shows 15 tabs tests including TC-2.3b + TC-5.6a (`docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md:44`), while Story 5 tech-design summary omits TC-2.3b in its TCs list (`docs/tech-design-mvp.md:2206`, `docs/tech-design-mvp.md:2212`).  
Revised severity: **Minor**.

**REVISED VERDICT for Story 6: NOT READY.**  
Reason: even after downgrading 1/2/4 and accepting 5/6/7 as minor, the TC-1.3b traceability/coverage issue remains major; plus previously undisputed major issues (AC-5.2 UI test traceability, reconnect/resync completeness, prompt self-containedness) still stand in the existing reports.