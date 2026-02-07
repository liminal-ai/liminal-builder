# Story/Prompt Fix Handoff (Zero-Context Agent)

## Mission
Update story and prompt documentation for Liminal Builder so it is consistent with the current tech design and package verification workflow.

All assigned agents should **apply edits now** (not just suggest).

---

## Project Summary (for a brand-new agent)
Liminal Builder is a local, session-based interface for AI coding CLIs (Claude Code and Codex). It uses a Bun + Fastify server, vanilla HTML/JS client, ACP protocol integration, and story-driven implementation docs under `docs/stories/`.

This handoff is strictly a **documentation alignment pass**: fix story/prompt files so they match the latest design and verification contract.

---

## Current Stage
We are in execution prep and doc hygiene:
- Story and prompt docs were authored earlier.
- Tech design and package scripts have since changed.
- We must align story/prompt docs before using them for implementation.

---

## Source of Truth
Use these as canonical for this pass:
- `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md`
- `/Users/leemoore/code/liminal-builder/package.json`
- `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md`

Use these prior analyses as input (do not ignore):
- `/tmp/lb-subagents/sub1-story0.md`
- `/tmp/lb-subagents/sub2-story1-2a.md`
- `/tmp/lb-subagents/sub3-story2b-3.md`
- `/tmp/lb-subagents/sub4-story4-5.md`
- `/tmp/lb-subagents/sub5-story6-overview.md`
- `/tmp/lb-subagents/sub6-global-consistency.md`

---

## Non-Goals
- Do not modify app code under `server/`, `client/`, `shared/`, or tests for this task.
- Do not modify liminal-spec skill source files under `/Users/leemoore/.claude/skills/liminal-spec/*`.
- Do not re-run broad gap discovery from scratch.

---

## Key Decisions Already Made
1. Verification contract is script-based in `package.json`:
   - `verify`
   - `verify-all`
2. Test runner/tooling is Vitest-based in package scripts.
3. Story/prompt docs should align command examples and verification sections with current scripts.
4. Edits should be minimal, localized, and traceable.

---

## Permissions / Execution Settings
For subagents that edit docs:
- Use `--sandbox workspace-write`.
- Working directory must be `-C /Users/leemoore/code/liminal-builder`.
- Use model `gpt-5.3-codex` with `model_reasoning_effort=medium` for change agents.
- Use `gpt-5.3-codex` with `model_reasoning_effort=high` for validation agents.
- Wrap each run with a 15-minute timeout:
  - `perl -e 'alarm 900; exec @ARGV' codex exec ...`

---

## Agent Partitioning (One Story per Change Agent)
Launch in parallel where practical. Each change agent edits only its assigned story set.

### Change Agent S0
Files:
- `docs/stories/story-0-infrastructure/story.md`
- `docs/stories/story-0-infrastructure/prompt-0.1-setup.md`
- `docs/stories/story-0-infrastructure/prompt-0.R-verify.md`

### Change Agent S1
Files:
- `docs/stories/story-1-project-sidebar/story.md`
- `docs/stories/story-1-project-sidebar/prompt-1.1-skeleton-red.md`
- `docs/stories/story-1-project-sidebar/prompt-1.2-green.md`
- `docs/stories/story-1-project-sidebar/prompt-1.R-verify.md`

### Change Agent S2A
Files:
- `docs/stories/story-2a-acp-client/story.md`
- `docs/stories/story-2a-acp-client/prompt-2a.1-skeleton-red.md`
- `docs/stories/story-2a-acp-client/prompt-2a.2-green.md`
- `docs/stories/story-2a-acp-client/prompt-2a.R-verify.md`

### Change Agent S2B
Files:
- `docs/stories/story-2b-agent-manager/story.md`
- `docs/stories/story-2b-agent-manager/prompt-2b.1-skeleton-red.md`
- `docs/stories/story-2b-agent-manager/prompt-2b.2-green.md`
- `docs/stories/story-2b-agent-manager/prompt-2b.R-verify.md`

### Change Agent S3
Files:
- `docs/stories/story-3-chat-ui/story.md`
- `docs/stories/story-3-chat-ui/prompt-3.1-skeleton-red.md`
- `docs/stories/story-3-chat-ui/prompt-3.2-green.md`
- `docs/stories/story-3-chat-ui/prompt-3.R-verify.md`

### Change Agent S4
Files:
- `docs/stories/story-4-session-management/story.md`
- `docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md`
- `docs/stories/story-4-session-management/prompt-4.2-green.md`
- `docs/stories/story-4-session-management/prompt-4.R-verify.md`

### Change Agent S5
Files:
- `docs/stories/story-5-tab-management/story.md`
- `docs/stories/story-5-tab-management/prompt-5.1-skeleton-red.md`
- `docs/stories/story-5-tab-management/prompt-5.2-green.md`
- `docs/stories/story-5-tab-management/prompt-5.R-verify.md`

### Change Agent S6
Files:
- `docs/stories/story-6-codex-status-integration/story.md`
- `docs/stories/story-6-codex-status-integration/prompt-6.1-skeleton-red.md`
- `docs/stories/story-6-codex-status-integration/prompt-6.2-green.md`
- `docs/stories/story-6-codex-status-integration/prompt-6.R-verify.md`

### Change Agent O (Overview, single dedicated agent)
Files:
- `docs/stories/overview.md`

Only this agent should edit `overview.md`.

---

## Hard Scope Restrictions (Mandatory)
- Each change agent may edit only the files listed in its section above.
- Validators must use the exact same scope boundaries as their paired change agent.
- No cross-story edits under any condition.
- No “helpful” spillover edits into adjacent stories.
- `docs/stories/overview.md` is owned exclusively by Change Agent O.

## Required Change Themes (apply where relevant)
1. Align commands with current package scripts and tooling.
2. Update verification sections to include canonical `verify` and, when applicable, `verify-all`.
3. Remove or correct stale runner assumptions and command examples.
4. Ensure story scope matches current tech design scope.
5. Fix internal inconsistencies (counts, wording mismatches, stale signatures) where identified.

---

## Per-Story Validation (Required)
After each change agent finishes a story set, launch a paired validation agent (high reasoning).

Validator must read:
- `/Users/leemoore/code/liminal-builder/docs/feature-spec-mvp.md`
- `/Users/leemoore/code/liminal-builder/docs/tech-design-mvp.md`
- `/Users/leemoore/code/liminal-builder/package.json`
- The updated story/prompt files for that story set

Validator output requirements:
- PASS/FAIL
- Findings table: `file | issue | severity | required fix`
- If FAIL: exact minimal fixes required

---

## Post-Parallel Coherence Pass (Single Agent, After All Story Agents)
After all story change agents and per-story validators complete:
- Run one dedicated coherence reviewer agent over all updated story docs + `overview.md`.
- This agent identifies cross-story consistency issues and reports them.
- If follow-up edits are needed, apply them in a controlled, explicit final pass (not by reopening broad parallel edits).

---

## Reporting Requirements
Do not stop after partial completion. Report only when all change and validation agents finish.

Final report must include:
1. Agent run status matrix (change + validator per story, with success/fail)
2. Files changed (absolute paths)
3. Validator verdicts (PASS/FAIL per story)
4. Remaining blockers or required follow-up edits
5. Overall readiness verdict for story prompt pack

---

## Suggested Launch Command Pattern
```bash
perl -e 'alarm 900; exec @ARGV' codex exec \
  -C /Users/leemoore/code/liminal-builder \
  --sandbox workspace-write \
  -m gpt-5.3-codex \
  -c model_reasoning_effort=medium \
  "<change-agent prompt>"
```

Validator pattern:
```bash
perl -e 'alarm 900; exec @ARGV' codex exec \
  -C /Users/leemoore/code/liminal-builder \
  --sandbox read-only \
  -m gpt-5.3-codex \
  -c model_reasoning_effort=high \
  "<validator prompt>"
```
