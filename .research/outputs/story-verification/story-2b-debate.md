1. **Point 1 (`Record<CliType, T>` typecheck): DEFEND**  
`Record<'claude-code' | 'codex', T>` with only `'claude-code'` **does** type-error.  
Citations:
- `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:70`
- `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:161`
- `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:70`
- `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:92`  
Both prompts also require zero type errors:
- `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:527`
- `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:552`  
I also rechecked with TypeScript compiler API:  
`Property 'codex' is missing ... but required in type 'Record<CliType, Cmd>'`.  
Severity stays **Critical**.

2. **Point 2 (Story 1 dependency gating): PARTIALLY CONCEDE**  
You’re right that Story 1 is not a functional dependency in the graph:
- `docs/stories/overview.md:10`
- `docs/stories/overview.md:14`  
But Story 2b docs do gate on Story 1 test baseline:
- `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:19`
- `docs/stories/story-2b-agent-manager/story.md:14`  
So this is wording/gating inconsistency, not hard dependency break.  
Revised severity: **Minor** (from Major).

3. **Point 3 (`AgentState` mismatch re: `reconnectTimer`): PARTIALLY CONCEDE**  
Mismatch is real:
- No timer in 2b.1: `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:84`
- Timer added in 2b.2: `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:80`
- Timer behavior required in green template: `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:337`
- Verify expects timer: `docs/stories/story-2b-agent-manager/prompt-2b.R-verify.md:98`  
This looks like intended red→green evolution, but it is not explicitly called out as a contract change.  
Revised severity: **Minor**.

4. **Point 4 (`requestId` absent in Story 2b prompts): CONCEDE**  
Feature spec makes `requestId` a cross-cutting WS contract:
- `docs/feature-spec-mvp.md:596`
- `docs/feature-spec-mvp.md:617`
- `docs/feature-spec-mvp.md:621`
- `docs/feature-spec-mvp.md:630`
- `docs/feature-spec-mvp.md:649`
- `docs/feature-spec-mvp.md:655`
- `docs/feature-spec-mvp.md:666`  
Story 2b prompt WS routing/forwarding requirements omit it:
- `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md:469`
- `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md:235`  
`prompt-2b.R-verify.md` also has no `requestId` checks.  
Revised severity: **Major**.

**REVISED VERDICT for Story 2b: NOT READY**.