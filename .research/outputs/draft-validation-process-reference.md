# Story Validation Process: Multi-Agent Adversarial Pattern

> **DRAFT** — Captured from Liminal Builder Phase 4 execution (2026-02-07). Candidate for inclusion in `liminal-spec/references/`.

Detailed patterns for validating story artifacts at scale before Phase 5 execution. Execution-orchestration.md defines the dual-validator pattern and pipeline flow; this reference covers the full adversarial validation process: parallel agent topology, Codex verification, Opus cross-validation, adversarial debate, and fix list generation.

## When to Use This

Use the full adversarial pattern when:
- Multiple stories need validation simultaneously
- Story artifacts have undergone significant revision
- You want high confidence before committing to execution
- The project has enough stories to justify parallel infrastructure

For single-story validation, the dual-validator pattern in `execution-orchestration.md` is sufficient.

---

## The Process

```
Phase 1: Codex Verification    — Parallel sweep, structured reports
Phase 2: Opus Cross-Validation — Every claim checked against source
Phase 3: Adversarial Debate    — Disagreements resolved with evidence
Phase 4: Fix List Generation   — Single consolidated handoff document
```

Each phase catches what the previous one missed. The adversarial structure means no single model's blind spots survive unchallenged.

---

## Phase 1: Codex Verification

Parallel read-only sweep across all stories using high-reasoning Codex agents.

### Topology

```
Orchestrator (Opus 4.6)
├── Teammate A (Opus) → Codex Agent 1 (Story 1)
│                     → Codex Agent 2 (Story 2a)
├── Teammate B (Opus) → Codex Agent 3 (Story 2b)
│                     → Codex Agent 4 (Story 3)
├── Teammate C (Opus) → Codex Agent 5 (Story 4)
│                     → Codex Agent 6 (Story 5)
└── Teammate D (Opus) → Codex Agent 7 (Story 6)
```

4 teammates, 7 Codex subagents. Each teammate manages 1-2 parallel Codex sessions. The orchestrator coordinates via `SendMessage`, not by reading pane output.

### Codex Agent Configuration

| Setting | Value | Why |
|---------|-------|-----|
| Model | gpt-5.3-codex | High reasoning for spec analysis |
| Reasoning effort | High | Thorough line-by-line checking |
| Sandbox | Read-only | Verification only, no writes |
| Output | `-o` flag to file | Keeps execution logs out of orchestrator context |

### What Each Codex Agent Reads

Every agent reads the full context for its assigned story:
- Feature spec (`docs/feature-spec-mvp.md`)
- Tech design (`docs/tech-design-mvp.md`)
- Story overview (`docs/stories/overview.md`)
- Story file (`docs/stories/story-N-{name}/story.md`)
- All prompts (`prompt-N.1-skeleton-red.md`, `prompt-N.2-green.md`, `prompt-N.R-verify.md`)

### Scope Containment

Each Codex agent prompt **must** include an explicit scope constraint:

```
STAY FOCUSED ON STORY N ONLY. Do not evaluate adjacent stories,
cross-story dependencies beyond what this story declares as prerequisites,
or issues in shared documents that don't directly affect this story.
```

Without this, agents drift into evaluating neighboring stories — especially when they read the story overview or shared specs. This wastes tokens and produces noise that pollutes the cross-validation phase. Scope containment is a prompt engineering requirement, not a suggestion.

### Output File Discipline

Each Codex agent writes to a predetermined path agreed upon before launch:

```
.research/outputs/story-verification/story-N-verification.md    (Phase 1)
.research/outputs/story-verification/story-N-review.md           (Phase 2)
.research/outputs/story-verification/story-N-debate.md           (Phase 3)
```

The orchestrator and teammates agree on file paths upfront. This prevents file collisions when multiple agents run in parallel and makes the compression chain predictable — each teammate knows exactly where to find their Codex output without searching.

### Report Structure

Each Codex agent produces a structured verification report:

```
## Verdict: READY / READY WITH ISSUES / NOT READY

### Issues Found
For each issue:
- Severity: Critical / Major / Minor
- Category: (spec drift, missing content, inconsistency, etc.)
- Location: File + line reference
- Description: What's wrong
- Evidence: Quoted text showing the problem
- Suggested fix: How to resolve

### Summary
- Total issues by severity
- Confidence level with reasoning
```

### Why `-o` Output Matters

The Codex `-o` flag writes the final response to a file. This is critical for context management:
- Execution logs (tool calls, reasoning traces) stay in the Codex session
- Only the structured report flows to the teammate
- The teammate summarizes for the orchestrator
- The orchestrator never sees raw Codex output

Each layer compresses. 7 full verification runs reduce to a manageable set of findings.

---

## Phase 2: Opus Cross-Validation

Each teammate (Opus) validates every claim in their Codex reports against the actual source files.

### Why This Phase Exists

Codex makes mistakes. Common failure modes:
- **Phantom line references** — Cites line numbers that don't match actual content
- **Severity inflation** — Calls minor formatting issues "Critical"
- **Hallucinated inconsistencies** — Claims files disagree when they actually align
- **Missed context** — Flags something as missing that exists in a different section

**Calibration data:** In practice, Codex overstated severity on ~40% of issues. Expect roughly half of Codex findings to need severity adjustment during cross-validation. This is not Codex being bad — it's expected behavior you design around. Budget cross-validation time accordingly and don't be surprised when a large portion of "Critical" and "Major" findings get downgraded.

Opus reads the actual files and checks each claim.

### Validation Report Format

For each Codex finding:

```
### Finding: [original description]
- Codex claim: [what Codex said]
- Source check: [what the file actually says]
- Verdict: TRUE / FALSE / PARTIALLY TRUE
- Reasoning: [why]
- Adjusted severity: [if different from Codex]
```

### What Opus Catches

| Codex Pattern | Opus Correction |
|---------------|-----------------|
| "Line 42 says X" but line 42 says Y | FALSE — phantom reference |
| "Critical: missing type export" but it's in a different file | FALSE — missed context |
| "Major: inconsistent naming" but it's a 2-second rename | TRUE but Minor severity |
| "Minor: could add comment" | Withdrawn — not a real issue |

---

## Phase 3: Adversarial Debate

When Opus disputes a Codex finding, the dispute goes back to Codex for response. This is not rubber-stamping — Codex can defend with evidence.

### Debate Protocol

1. Teammate launches a Codex session with the disputed findings
2. Presents the Opus pushback with specific evidence
3. Codex responds with one of:
   - **CONCEDE** — Withdraws the finding
   - **PARTIALLY CONCEDE** — Adjusts severity or scope
   - **DEFEND** — Provides counter-evidence

### Session Strategy: Resume vs Fresh

Two options for the debate Codex session:

| Approach | Pros | Cons |
|----------|------|------|
| `codex exec resume` (original session) | Full context of original findings, can reference own reasoning | Session ID management overhead, may hit context limits |
| Fresh session with dispute summary | Clean context, no management overhead, simpler orchestration | Must re-explain the original findings |

In practice, fresh sessions worked well. The dispute summary provides enough context for Codex to evaluate the pushback, and the simpler orchestration (no session ID tracking) reduces coordination complexity across multiple teammates. Use resume only when the original finding was particularly nuanced and re-explanation would lose important context.

### Why Adversarial Debate Works

Different models have different strengths:

| Model | Strength | Weakness |
|-------|----------|----------|
| Codex (GPT-5.3) | Can run actual tools (TS compiler, grep), literal spec reading | Prone to severity inflation, phantom references |
| Opus (Claude 4.6) | Holistic understanding, catches overstatements | Can miss technical details Codex finds by running tools |

The adversarial structure forces each model to justify its position with evidence. The model that can cite specific file content wins.

### Notable Pattern: Tool-Backed Evidence

Codex can run actual tools in its sandbox. In practice:
- Codex claimed a type error existed
- Opus said the types were fine based on reading the code
- Codex ran the TypeScript compiler and produced the actual error output
- Codex was right

**When a model can demonstrate a claim with tool output, that claim wins regardless of the other model's reading of the code.**

### Tie-Breaking

When debate doesn't resolve (rare — happened twice in 7 stories):
- The orchestrator reads the disputed files directly
- Makes a judgment call based on the evidence presented
- Documents the reasoning in the fix list

---

## Phase 4: Fix List Generation

All validated issues consolidate into a single handoff document.

### What Goes In

- Every issue where Codex was validated as correct (TRUE)
- Every issue where Codex partially conceded (adjusted scope/severity)
- Every issue Codex successfully defended in debate

### What Gets Dropped

- Issues Opus proved false (phantom references, hallucinations)
- Issues Codex conceded during debate
- Non-issues (suggestions, preferences, style opinions)

### Fix List Format

```markdown
## Story N: {name}

### Issue 1: [description]
- Severity: Major
- File: docs/stories/story-N-{name}/story.md
- Line: 42
- Current: [what it says now]
- Expected: [what it should say]
- Source: [which spec/design section is authoritative]
```

### The Standard: Fix Everything

Severity tiers (Critical / Major / Minor) describe understanding, not skip criteria.

The only valid reason to skip a fix: "not important AND very difficult." This almost never applies to doc fixes — most take 20 seconds to 2 minutes. The severity distribution helps you understand the landscape. It does not give you permission to ignore Minors.

Why:
- Minor issues at the spec level compound downstream
- A "Minor" naming inconsistency becomes a Major confusion during implementation
- Zero debt before code exists is cheap; zero debt after code exists is expensive
- You already found the issue. Fixing it is almost always faster than deciding to skip it

---

## Infrastructure

### Orchestrator Setup

```
Claude Code Opus 4.6 in tmux -CC control mode (iTerm2)
├── 4 Claude Code teammates in tmux split panes
├── Each teammate loads: liminal-spec + codex-subagent skills
└── Orchestrator coordinates via SendMessage
```

**Requirements:**
- `--teammate-mode tmux` CLI flag (not settings.json — that path is broken)
- `it2` CLI installed (`pipx install it2`)
- iTerm2 Python API enabled
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` environment variable
- Start `tmux -CC` first, then launch Claude inside it

### Skill Pre-Loading

Teammates must load required skills **before** receiving task assignments. The orchestrator should confirm skill availability as part of teammate setup, not as part of task dispatch.

```
1. Spawn teammate in tmux pane
2. Teammate loads skills (liminal-spec, codex-subagent, etc.)
3. Orchestrator confirms teammate is ready
4. THEN assign stories and dispatch prompts
```

Why: When teammates build Codex prompts, they need the skill context (prompt templates, model configuration, CLI syntax) already loaded. If skills load mid-task, the teammate may construct prompts without the skill's guidance, producing inconsistent Codex invocations across the team.

### Parallel Capacity

| Teammates | Codex Agents Each | Total Parallel | Sweet Spot |
|-----------|-------------------|----------------|------------|
| 2 | 2 | 4 | Small projects (≤4 stories) |
| 4 | 1-2 | 4-8 | Medium projects (5-8 stories) |
| 6 | 2 | 12 | Large projects (9+ stories) |

Balance teammate count against context management overhead. More teammates = more coordination messages for the orchestrator.

### Timing

With the 4-teammate, 7-agent topology:

| Phase | Wall-Clock | Why |
|-------|-----------|-----|
| Phase 1: Codex Verification | ~3-5 min | 7 parallel agents, bounded by slowest |
| Phase 2: Opus Cross-Validation | ~2-3 min | Each teammate validates their own reports |
| Phase 3: Adversarial Debate | ~2-4 min | Only disputed items, parallel across teammates |
| Phase 4: Fix List Generation | ~1-2 min | Orchestrator consolidates |
| **Total** | **~8-14 min** | Sequential would be 1-2 hours |

### Token Usage Benchmarks

Approximate token consumption per story per phase, useful for cost estimation:

| Phase | Tokens per Story | Notes |
|-------|-----------------|-------|
| Codex Verification (Phase 1) | 50-135K | Varies with story complexity; stories with more prompts and cross-references trend higher |
| Codex Debate (Phase 3) | 38-120K | Proportional to dispute count; stories with few disputes are cheap |

**Planning math:** For a 7-story run, budget ~350-950K Codex tokens for Phase 1 and ~250-850K for Phase 3. Actual costs depend on model pricing at time of execution. Opus teammate tokens (Phases 2, 4) are harder to isolate but are dominated by file reads during cross-validation.

---

## Anti-Patterns

### Single-Model Validation

Using only Codex or only Opus.

Problems:
- Codex alone: severity inflation, phantom references go unchecked
- Opus alone: misses issues that tool execution would catch
- False confidence in either direction

### Skipping the Debate

Accepting Opus corrections without Codex pushback.

Problems:
- Opus makes mistakes too (the TS compiler example)
- Loses legitimate findings that Opus incorrectly dismissed
- Asymmetric trust creates blind spots

### Severity-Based Triage to Skip Fixes

"Let's skip the Minors, they're not important."

Problems:
- Minor spec issues compound into Major implementation confusion
- You already found the issue — fixing is faster than deciding to skip
- Creates tech debt before code even exists
- Violates the "fix everything" standard

### Orchestrator Reading Raw Output

Having the orchestrator read full Codex verification reports directly.

Problems:
- Context window bloat (7 full reports can exceed useful context)
- Execution logs mixed with findings
- Orchestrator loses ability to coordinate effectively

Use the compression chain: Codex → file → teammate summary → orchestrator.

### Missing Scope Containment

Not including "STAY FOCUSED ON STORY X ONLY" in Codex prompts.

Problems:
- Agents drift into evaluating adjacent stories
- Token waste on irrelevant findings
- Noise in cross-validation phase (false issues from wrong story)
- Especially bad when agents read shared documents (overview, feature spec)

### Sequential Execution

Running verification stories one at a time.

Problems:
- 7× wall-clock time for the same result
- Teammates sit idle
- No reason not to parallelize read-only verification

---

## Checklist: Full Adversarial Validation

```markdown
## Pre-Execution Validation — [Project Name]

### Setup
- [ ] Orchestrator running in tmux -CC control mode
- [ ] N teammates spawned in split panes
- [ ] Each teammate has required skills loaded (pre-task, not mid-task)
- [ ] Output file paths agreed upon (`.research/outputs/story-verification/`)
- [ ] Story-to-teammate assignment documented

### Phase 1: Codex Verification
- [ ] All Codex agents launched in parallel
- [ ] Each agent has full context (spec, design, story, prompts)
- [ ] Each agent prompt includes scope containment constraint
- [ ] Reports written to predetermined file paths via `-o` flag
- [ ] All agents completed with verdicts

### Phase 2: Opus Cross-Validation
- [ ] Each teammate validated their Codex reports
- [ ] Every claim checked against actual source files
- [ ] Validation reports produced (TRUE/FALSE/PARTIALLY TRUE)
- [ ] Disputed items identified

### Phase 3: Adversarial Debate
- [ ] Disputed items sent back to Codex
- [ ] Codex responses received (CONCEDE/PARTIALLY CONCEDE/DEFEND)
- [ ] Remaining disputes tie-broken by orchestrator
- [ ] All disputes resolved

### Phase 4: Fix List
- [ ] All valid issues consolidated
- [ ] Invalid issues dropped with reasoning
- [ ] Fix list organized by story
- [ ] Standard applied: fix everything

### Ready for Fixes
- [ ] Fix list handed off to execution agents
- [ ] Orchestrator context clear for coordination
```
