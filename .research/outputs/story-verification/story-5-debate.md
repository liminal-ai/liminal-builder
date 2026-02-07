1. **`tabMeta` localStorage inconsistency (Major -> Minor)**  
**PARTIALLY CONCEDE**.  
`prompt-5.2-green.md` is explicit that persisted state includes `tabMeta` (`docs/stories/story-5-tab-management/prompt-5.2-green.md:331`) and calls it required “for restore” (`docs/stories/story-5-tab-management/prompt-5.2-green.md:536`).  
The lag is in other docs: skeleton format omits it (`docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md:197`), verify spot check omits it (`docs/stories/story-5-tab-management/prompt-5.R-verify.md:82`), and tech design omits it (`docs/tech-design-mvp.md:1024`).  
**Revised severity: Minor** (documentation/verification drift, not core implementation direction).

2. **TC-4.2b (<100ms) excluded from automation (Major -> Minor)**  
**CONCEDE**.  
It is intentionally manual/performance by spec: `docs/stories/story-5-tab-management/story.md:31`, `docs/tech-design-mvp.md:1033`.  
Verify also has manual smoke for instant switching (`docs/stories/story-5-tab-management/prompt-5.R-verify.md:95`).  
**Revised severity: Minor** (traceability wording clarity only).

3. **API-level vs UI-event-level tab tests (Major -> Minor)**  
**PARTIALLY CONCEDE**.  
The test strategy is intentionally public-API + DOM in jsdom (`docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md:235`, `docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md:495`), and TC-4.6a directly calls `reorderTabs` (`docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md:432`).  
There is still supplemental UI wiring verification via spot checks (`docs/stories/story-5-tab-management/prompt-5.R-verify.md:84`).  
**Revised severity: Minor** (coverage style tradeoff, not a blocker).

4. **New: TC-2.3b deferral undocumented in Story 4 scope**  
**CONCEDE**.  
Feature spec defines TC-2.3b (`docs/feature-spec-mvp.md:235`). Story 4 coverage omits it (`docs/stories/story-4-session-management/story.md:53`) and Story 4 verify table omits it (`docs/stories/story-4-session-management/prompt-4.R-verify.md:74`).  
Deferral appears only later in Story 5 (`docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md:471`, `docs/stories/story-5-tab-management/prompt-5.R-verify.md:68`).  
**Revised severity: Minor** (scope/traceability documentation gap).

5. **New: `tabMeta` optional in places but effectively required**  
**DEFEND**.  
Green restore path tolerates missing metadata (`docs/stories/story-5-tab-management/prompt-5.2-green.md:355`) but falls back to defaults (`docs/stories/story-5-tab-management/prompt-5.2-green.md:361`), which can silently mislabel restored tabs (especially Codex) unless `tabMeta` exists.  
Later stories consistently include `tabMeta` in restore fixtures (`docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md:308`, `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md:511`).  
This is a real data-contract ambiguity with behavioral impact, not just wording lag.

**REVISED VERDICT for Story 5:** **FAIL / not ready to mark complete yet.**  
The **Critical `initTabs` integration issue** still stands (shell still calls zero-arg `initTabs()` at `client/shell/shell.js:71` while Story 5 contract uses DOM-arg `init(...)` alias at `docs/stories/story-5-tab-management/prompt-5.2-green.md:40` and `docs/stories/story-5-tab-management/prompt-5.2-green.md:73`), and there is still one **Major** contract issue (`tabMeta` optional-vs-required ambiguity).