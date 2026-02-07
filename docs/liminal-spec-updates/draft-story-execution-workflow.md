# Story Execution Workflow: Implementation + Self-Review + Dual Verification

> **DRAFT** — Captured from Liminal Builder Story 1 execution (2026-02-07). Candidate for inclusion in `liminal-spec/references/` as a companion to `phase-execution.md` and `execution-orchestration.md`.

This reference documents the per-story implementation workflow used during Phase 5 execution. It defines how implementation agents execute each TDD phase, self-review their own work, and undergo dual verification before a story is considered complete.

## When to Use This

Use this workflow for every story during Phase 5 execution. It applies to the standard story execution cycle (Skeleton/Red, Green, Verify) and adds:

- **Self-review pass** after each implementation phase
- **Dual verification** with two independent models
- **Human-gated fix cycles** between verification rounds

For pre-execution story *doc* validation (verifying stories and prompts before implementation), see `draft-validation-process-reference.md`.

---

## The Full Workflow

```
┌──────────────────────────────────────────────────────────────────────┐
│  SKELETON + TDD RED                                                  │
│  Codex A (gpt-5.3-codex, high) executes skeleton+red prompt         │
│  Same session: self-review + readiness assessment                    │
│  If issues → Codex A fixes in-session                               │
│  Commit checkpoint at Red completion                                 │
├──────────────────────────────────────────────────────────────────────┤
│  TDD GREEN                                                           │
│  Codex B (fresh session, gpt-5.3-codex, high) executes green prompt │
│  Same session: self-review + readiness assessment                    │
│  If issues → Codex B fixes in-session                               │
│  Commit checkpoint at Green completion                               │
├──────────────────────────────────────────────────────────────────────┤
│  DUAL VERIFICATION (parallel)                                        │
│  Codex C (fresh session) runs verify prompt                          │
│  Senior Engineer (Opus subagent) runs same verify prompt             │
│  Both report → Orchestrator consolidates → Human reviews             │
├──────────────────────────────────────────────────────────────────────┤
│  FIX CYCLE (1-3 rounds, human-gated)                                 │
│  Human decides: fix agent (Opus or GPT) + scope                      │
│  After fixes → dual verify again                                     │
│  Repeat until last round's changes are minor/non-structural          │
│  Human is the gate for moving to next story                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Skeleton + TDD Red

### Implementation

Launch a Codex agent with the skeleton+red prompt pack.

| Setting | Value | Why |
|---------|-------|-----|
| Model | gpt-5.3-codex | Strong reasoning for test design |
| Reasoning effort | High | Tests must precisely encode AC/TC intent |
| Sandbox | workspace-write | Needs to create test files and stubs |

```bash
codex exec \
  -C /path/to/project \
  --sandbox workspace-write \
  -m gpt-5.3-codex \
  -c model_reasoning_effort=high \
  <<'EOF'
[skeleton+red prompt contents]
EOF
```

### Self-Review (Same Session)

After implementation completes, resume the same Codex session for a critical self-review:

```bash
codex exec resume <SESSION_ID> \
  <<'EOF'
You just completed the Skeleton + TDD Red phase. Now do a thorough critical
review of your own implementation:

1. Re-read each test against its corresponding AC and TC in the story doc.
2. Check that assertions verify behavior, not implementation details.
3. Check test isolation — no shared mutable state between tests.
4. Check that stubs throw NotImplementedError (skeleton contract).
5. Run all quality gates: typecheck, lint, test.
6. Provide a thorough assessment of readiness for TDD Green.
7. If you find issues, fix them before reporting.

Report your findings and final verdict: READY or NOT READY for Green.
EOF
```

### Why Same-Session Self-Review

- The implementer has full context of what they built and why
- Catching issues here is cheaper than catching them in verification
- Forces the agent to re-examine its own work with critical eyes
- The "fix before reporting" instruction means issues get resolved immediately
- Reduces the load on the dual verification phase

### Exit Criteria

- All tests exist and fail against stubs (Red confirmation)
- Typecheck passes
- Self-review verdict: READY
- **Commit checkpoint created** (before Green begins)

---

## Phase 2: TDD Green

### Implementation

Launch a **fresh** Codex session with the green prompt pack. Fresh session ensures the Green implementer reads the tests cold — no assumptions carried from the Red author.

```bash
codex exec \
  -C /path/to/project \
  --sandbox workspace-write \
  -m gpt-5.3-codex \
  -c model_reasoning_effort=high \
  <<'EOF'
[green prompt contents]
EOF
```

### Self-Review (Same Session)

Resume for critical self-review, same pattern as Red:

```bash
codex exec resume <SESSION_ID> \
  <<'EOF'
You just completed the TDD Green phase. Now do a thorough critical review
of your own implementation:

1. Re-read each test and verify it passes for the right reasons.
2. Check that implementation matches the tech design interfaces and contracts.
3. Check for production bugs (edge cases, error handling, resource cleanup).
4. Verify no test files were modified in ways that weaken AC/TC intent.
5. Run all quality gates: typecheck, lint, test, verify.
6. Provide a thorough assessment of readiness for Verification.
7. If you find issues, fix them before reporting.

Report your findings and final verdict: READY or NOT READY for Verification.
EOF
```

### Test Modification Policy

**Green should NOT modify test files.** If Green needs to change tests:

1. Environmental fixes (runtime shims, import compatibility) — acceptable but must be flagged
2. Assertion changes — **not acceptable**. Escalate to orchestrator
3. New test additions — not in scope for Green

The self-review must explicitly check for test modifications and assess whether they preserved AC/TC intent. This is a critical guardrail against implementation gaming tests.

> **Gap identified:** Green prompts should include an explicit constraint: "Do NOT modify test files unless absolutely necessary for environmental compatibility. If you must modify tests, document every change and justify it against the original AC/TC." Current prompts are too permissive.

### Exit Criteria

- All tests pass (Green confirmation)
- Typecheck, lint, verify all pass
- Self-review verdict: READY
- **Commit checkpoint created** (before verification begins)

---

## Phase 3: Dual Verification

Two independent verifiers run the same verification prompt in parallel. Different models catch different issues.

### Topology

```
Orchestrator (Opus 4.6)
├── Codex C (gpt-5.3-codex, fresh session) → verify prompt
└── Senior Engineer (Opus subagent)         → same verify prompt
```

Both run simultaneously. Neither sees the other's output.

### Codex C Configuration

| Setting | Value | Why |
|---------|-------|-----|
| Model | gpt-5.3-codex | Can run tools (compiler, tests) for evidence |
| Reasoning effort | High | Thorough verification |
| Sandbox | workspace-write | May need to run tests, typecheck, start server |

```bash
codex exec \
  -C /path/to/project \
  --sandbox workspace-write \
  -m gpt-5.3-codex \
  -c model_reasoning_effort=high \
  -o /path/to/verification-output.md \
  <<'EOF'
[verify prompt contents]
EOF
```

### Senior Engineer Configuration

Launched as a Claude Code subagent (senior-engineer type) with the same verify prompt. Has access to all local tools — file reads, grep, bash for running tests and typecheck.

### What Each Verifier Checks

The verify prompt typically covers:

1. **Test execution** — All test suites pass
2. **Typecheck** — `tsc --noEmit` clean
3. **Verify gate** — Full format + lint + typecheck + test pipeline
4. **Regression** — Previous stories still work
5. **Integration** — Module APIs work as specified
6. **Exports** — All expected public APIs are exported
7. **Smoke test** — Server starts, key endpoints respond

### Why Two Verifiers

| Verifier | Strength | Weakness |
|----------|----------|----------|
| Codex C (GPT-5.3) | Runs actual tools (compiler, tests), literal spec reading | Severity inflation, phantom line references, sandbox limitations |
| Senior Engineer (Opus) | Holistic understanding, catches design intent issues, full local access | May miss issues that tool execution would catch |

Neither alone is sufficient. The dual pattern catches what each model's blind spots miss.

### Consolidated Report

The orchestrator produces a single consolidated report:

```markdown
## Dual Verification Report: Story N

### Step-by-Step Comparison
| Step | Codex C | Senior Engineer |
|------|---------|-----------------|
| Tests | PASS/FAIL | PASS/FAIL |
| ...  | ...     | ...             |

### TC-by-TC Status
| TC | Status | Evidence |
|----|--------|----------|

### Issues Found
[Merged from both verifiers, noting source]

### Discrepancies
[Where verifiers disagreed, with analysis]

### Overall Verdicts
| Verifier | Verdict | Confidence |
```

---

## Phase 4: Fix Cycle

### Human as Gate

After dual verification, the orchestrator presents findings to the human. The human decides:

1. **Which issues to fix** (typically: all of them)
2. **Which agent fixes them** (Opus subagent or new Codex session)
3. **Whether to move on** or do another verification round

### Fix → Re-Verify Loop

```
Dual Verification Report
    ↓
Human reviews findings
    ↓
Human decides: fix agent + scope
    ↓
Fix agent addresses issues
    ↓
Another round of dual verification
    ↓
Repeat 1-3 rounds
    ↓
Last round's changes were minor/non-structural → Move on
```

### When to Stop

- At least 1 full verification round has passed
- Last round of changes were minor (naming, nits, small adjustments)
- No structural or behavioral issues remain
- Human says "move on"

Typically 1-3 rounds. If verification consistently finds substantial issues after 3 rounds, something is wrong upstream (spec or design quality, prompt quality, or implementation approach).

### Fix Agent Selection

| Situation | Recommended Agent | Why |
|-----------|-------------------|-----|
| Small fixes, typing, naming | Opus subagent | Fast, understands intent |
| Production bug fix | New Codex (high) | Can run tools to verify fix |
| Structural refactor | New Codex (high) | Needs fresh context + tool access |
| Cross-file consistency | Opus subagent | Better at holistic coherence |

The human makes this call each round based on the nature of the findings.

---

## Session Management

### Session ID Tracking

Track Codex session IDs for each phase:

| Phase | Agent | Session ID | Purpose |
|-------|-------|------------|---------|
| Skeleton+Red | Codex A | `<id>` | Resume for self-review |
| Green | Codex B | `<id>` | Resume for self-review |
| Verify | Codex C | `<id>` | Reference only (no resume needed) |

Session IDs come from the `codex exec` output. Capture them immediately after launch.

### Resume Syntax

```bash
codex exec resume <SESSION_ID> <<'EOF'
[follow-up prompt]
EOF
```

Note: `resume` does not accept `-C`, `--sandbox`, `-m`, or `-c` flags — it inherits all settings from the original session. The `-o` flag is also not available on resume; redirect stdout if needed.

### Fresh vs Resume Decision

| Use Fresh Session | Use Resume |
|-------------------|------------|
| Different TDD phase (Red → Green) | Self-review of own work |
| Verification (independent perspective) | Follow-up fixes in same phase |
| Fix cycle after verification | Continuing interrupted work |

---

## Commit Boundary Protocol

### Required Commits

1. **After Red self-review** — Captures failing tests and stubs. This is the Red checkpoint.
2. **After Green self-review** — Captures passing implementation. This is the Green checkpoint.
3. **After each fix round** — Captures verification-driven improvements.

### Why Boundaries Matter

- Git diff between Red and Green commits shows exactly what the implementation changed
- If Green modified test files, the diff makes it visible for review
- Enables rollback to any clean phase boundary
- Provides audit trail: requirement → test → implementation

### Commit Messages

Follow the project's existing commit convention. Typical pattern:

```
feat(story-N): TDD Red phase — N tests for [feature]
feat(story-N): TDD Green phase — implement [feature]
fix(story-N): verification round 1 — [summary of fixes]
```

---

## Anti-Patterns

### Skipping Self-Review

"Tests pass, let's go straight to verification."

Why it's bad:
- Self-review catches 60-70% of issues the implementer introduced
- Verification is more expensive (two agents instead of one in-session resume)
- Issues caught in self-review are cheaper to fix (full implementation context)

### Same Agent for Red and Green

Using the same Codex session for both Red and Green.

Why it's bad:
- Green implementer may unconsciously write to match their own test patterns
- Fresh context forces Green to read tests cold, as a real implementer would
- Reduces the chance of "writing tests that pass for the wrong reasons"

### Single Verifier

Running only Codex or only Senior Engineer for verification.

Why it's bad:
- Codex can run tools but inflates severity and hallucinates line references
- Opus catches intent issues but may miss what tool execution would find
- The dual pattern is what makes verification trustworthy

### Autonomous Fix Cycles

Letting the orchestrator decide when to move on without human input.

Why it's bad:
- Verification findings require judgment about severity and relevance
- "Minor" to a model may be "important" to the human (or vice versa)
- The human has context about project priorities and deadlines
- Human gate prevents infinite fix loops on diminishing returns

### Modifying Tests in Green Without Flagging

Allowing Green to silently change test assertions.

Why it's bad:
- Breaks the TDD contract (tests drove implementation, not the reverse)
- Can mask implementation deficiencies by weakening test expectations
- Makes the Red commit checkpoint meaningless if tests change in Green
- Environmental fixes are acceptable but must be explicitly flagged

---

## Checklist: Per-Story Execution

```markdown
## Story N: [name]

### Skeleton + TDD Red
- [ ] Codex A launched with skeleton+red prompt (gpt-5.3-codex, high)
- [ ] Implementation complete — tests exist and fail against stubs
- [ ] Same-session self-review completed
- [ ] Self-review issues fixed (if any)
- [ ] Quality gates pass (typecheck, lint)
- [ ] Self-review verdict: READY for Green
- [ ] Red commit checkpoint created

### TDD Green
- [ ] Codex B launched with green prompt (fresh session, gpt-5.3-codex, high)
- [ ] Implementation complete — all tests pass
- [ ] Test modifications flagged and justified (if any)
- [ ] Same-session self-review completed
- [ ] Self-review issues fixed (if any)
- [ ] Quality gates pass (typecheck, lint, verify)
- [ ] Self-review verdict: READY for Verification
- [ ] Green commit checkpoint created

### Dual Verification
- [ ] Codex C launched with verify prompt (fresh session)
- [ ] Senior Engineer launched with same verify prompt (parallel)
- [ ] Both reports received
- [ ] Consolidated report produced
- [ ] Discrepancies analyzed

### Fix Cycle (repeat as needed)
- [ ] Round N: Human reviewed findings
- [ ] Round N: Fix agent selected and dispatched
- [ ] Round N: Fixes applied
- [ ] Round N: Re-verification (if changes were substantial)
- [ ] Final round: Changes minor/non-structural
- [ ] Human approved: move to next story
```

---

## Relationship to Other References

| Reference | Scope | This Document Adds |
|-----------|-------|-------------------|
| `phase-execution.md` | Story cycle phases (Skeleton → Red → Green → Gorilla → Verify) | Self-review pass, dual verification details, fix cycle protocol |
| `execution-orchestration.md` | Agent coordination, dual-validator pattern, pipeline | Specific implementation workflow, session management, commit boundaries |
| `draft-validation-process-reference.md` | Pre-execution story *doc* validation | This covers *implementation* validation during execution |

This workflow slots into the existing Phase 5 guidance. `phase-execution.md` defines *what* happens in each phase. `execution-orchestration.md` defines *how* agents coordinate. This document defines the *specific operational workflow* for running each story through implementation and verification.
