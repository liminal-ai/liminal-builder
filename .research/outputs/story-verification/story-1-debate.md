1. **TC-1.3b not tested**: **CONCEDE** (downgrade to **Minor / Deferred**).  
   Evidence supports intentional deferral in Story 1 scope:
   - TC maps TC-1.3b to integration `websocket.test.ts` (`docs/tech-design-mvp.md:624`, `docs/tech-design-mvp.md:1714`).
   - Story 1 Red table only defines 9 tests in `project-store.test.ts` + `sidebar.test.ts` (`docs/tech-design-mvp.md:2060`, `docs/tech-design-mvp.md:2063`).
   - Story 1 explicitly excludes tabs (`docs/stories/story-1-project-sidebar/prompt-1.2-green.md:529`) and tab management is Story 5 (`docs/tech-design-mvp.md:2271`).

2. **TC-1.3a session mappings**: **PARTIALLY CONCEDE** (downgrade to **Minor**).  
   - The test comment explicitly states separation of stores and defers full re-add behavior to Story 4 (`docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:207`, `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:211`).
   - Green requirements also say project removal must not touch `sessions.json` (`docs/stories/story-1-project-sidebar/prompt-1.2-green.md:141`).
   - But feature spec TC-1.3a includes the stronger “re-add and sessions reappear” behavior (`docs/feature-spec-mvp.md:153`).  
   So: acceptable deferral for Story 1, but test name/TC phrasing overstates what is actually asserted.

3. **Path strategy inconsistency**: **CONCEDE** (downgrade to **Minor**).  
   - Green prompt pre-declares this and gives exact remediation (`docs/stories/story-1-project-sidebar/prompt-1.2-green.md:487`, `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:519`).
   - It also explicitly allows minor test modifications (`docs/stories/story-1-project-sidebar/prompt-1.2-green.md:117`).
   - Red prompt already targeted real temp dirs (`docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md:116`).  
   This is expected Red→Green stabilization, not a major defect.

4. **Error contract mismatch**: **PARTIALLY CONCEDE** (downgrade to **Minor**).  
   - Feature spec contract for `error` has no `code` (`docs/feature-spec-mvp.md:630`).
   - Story 1 Green prompt examples follow that (`docs/stories/story-1-project-sidebar/prompt-1.2-green.md:236`, `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:267`).
   - Tech design introduces codes later under “Error Contract Additions” (`docs/tech-design-mvp.md:1949`, `docs/tech-design-mvp.md:1952`).  
   So not a Story 1 compliance failure, but still a cross-doc alignment debt.

5. **`server/index.ts` wiring gap**: **DEFEND** (keep **Major**).  
   - Green design requires dependency-injected websocket handler (`docs/stories/story-1-project-sidebar/prompt-1.2-green.md:209`, `docs/stories/story-1-project-sidebar/prompt-1.2-green.md:223`).
   - Verify prompt explicitly expects `server/index.ts` project-store wiring (`docs/stories/story-1-project-sidebar/prompt-1.R-verify.md:18`).
   - Current code still calls `handleWebSocket(socket)` without deps (`server/index.ts:24`), and websocket remains a not-implemented stub (`server/websocket.ts:19`, `server/websocket.ts:25`).

**REVISED VERDICT: READY WITH ISSUES**  
Severity profile revised to: **1 Major (wiring), rest Minor/Deferred**.