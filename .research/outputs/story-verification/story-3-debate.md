1. **Major Issue 2 severity (skeleton conflicting instructions): PARTIALLY CONCEDE**  
`docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md:196` and `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md:299` explicitly require stub functions to throw `NotImplementedError`, while `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md:197` and `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md:198` describe `sendMessage`/`cancelResponse` behavior. In context, this reads as ambiguous traceability intent rather than a hard execution blocker.  
**Revised severity:** **Minor**.

2. **“Story 3 changes `server/websocket.ts` with zero server tests”: PARTIALLY CONCEDE**  
Story 3 does require server changes (`docs/stories/story-3-chat-ui/prompt-3.2-green.md:107`, `docs/stories/story-3-chat-ui/story.md:40`) and Story 3 adds only client tests (`docs/stories/story-3-chat-ui/story.md:50`, `docs/stories/story-3-chat-ui/story.md:53`; also `docs/stories/story-3-chat-ui/prompt-3.2-green.md:369`).  
But it is not “zero server coverage overall”: prior websocket integration coverage is already documented (`docs/stories/story-2b-agent-manager/story.md:71`, `docs/tech-design-mvp.md:1718`, `docs/tech-design-mvp.md:1719`).  
So the real issue is missing Story-3-specific server assertions (especially contract-field/runtime checks), not complete absence.  
**Revised severity:** **Minor**.

3. **`session:history` implemented in portlet but untested in Story 3: PARTIALLY CONCEDE**  
`session:history` handling is explicitly required (`docs/stories/story-3-chat-ui/prompt-3.2-green.md:125`; also shown in pseudocode at `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md:113`). Story 3’s explicit TC matrix has no `session:history` case (`docs/stories/story-3-chat-ui/prompt-3.R-verify.md:92`, `docs/stories/story-3-chat-ui/prompt-3.R-verify.md:109`; `docs/stories/story-3-chat-ui/story.md:60`).  
This is partly deferred to session-management scope (`docs/feature-spec-mvp.md:655`, `docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:265`, `docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:281`), but the Story 3 portlet branch itself remains unverified by its own tests.  
**Revised severity:** **Minor**.

**REVISED VERDICT (Story 3): NOT READY.**  
The critical AC-3.1 optimistic-render conflict still stands, and major consistency/verification issues remain despite the severity downgrades above.