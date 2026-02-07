# Claude Code Agent Teams: tmux Split-Pane Mode Research

**Date:** 2026-02-07
**Environment:** Claude Code v2.1.34, macOS, iTerm2, tmux -CC control mode

---

## Summary

The behavior you are seeing -- teammates appearing in-process (in the status bar) rather than as actual tmux split panes despite having `teammateMode: "tmux"` in settings -- is a **known, multi-faceted bug** that was actively reported and partially fixed between Feb 5-7, 2026. There are at least three separate root causes that can produce this symptom, and your specific setup (iTerm2 + `tmux -CC` control mode) hits the most problematic combination. The good news: one critical fix was just merged (issue #23784), and the `it2` CLI upstream bug was fixed in v0.1.9. The bad news: the silent fallback behavior means you get zero diagnostic output when it fails.

---

## Key Findings

### 1. `teammateMode: "tmux"` in settings.json was broken until today (FIXED)

**Issue #23784** (closed as COMPLETED on Feb 7, 2026): Setting `"teammateMode": "tmux"` in `settings.json` at any scope (user, project, or local) had **no effect**. Teammates spawned in-process regardless. The CLI flag `--teammate-mode tmux` worked correctly.

**Root cause:** The setting was read from config but not wired through to the teammate spawning logic.

**Fix:** Use the CLI flag as a workaround (or update Claude Code if a new release drops):
```bash
claude --teammate-mode tmux
```

### 2. iTerm2 detection silently falls back to in-process (OPEN)

**Issue #23572** (still open): When `teammateMode: "tmux"` is set, Claude Code auto-detects whether to use tmux or iTerm2 as the backend. If iTerm2 detection fails, **there is no error, warning, or log output** -- it silently falls back to in-process mode. The user sees "tmux pane" labels in the output but no actual panes are created.

**Root causes identified in this issue:**
- The `it2` CLI v0.1.8 had a Python Click parameter naming bug where `it2 split --vertical` failed silently (fixed in it2 v0.1.9)
- Claude Code's `[ITermBackend] isAvailable` check can return `false` even when running in iTerm2 (debug string found: `[ITermBackend] isAvailable: false (not in iTerm2)`)
- **Detection may be cached** -- even after fixing the it2 CLI and restarting Claude Code, the iTerm2 backend was not used until further steps were taken

**Critical detail for your setup:** When running inside `tmux -CC` (iTerm2 control mode), the `TERM_PROGRAM` environment variable may not be set to `iTerm2.app` inside the tmux session, which would cause the iTerm2 backend detection to fail. The tmux process sets its own `TERM` variable, potentially masking the iTerm2 environment.

### 3. tmux split-pane mode has multiple active bugs (v2.1.32-2.1.34)

Even when tmux pane creation works, several issues affect reliability:

| Issue | Description | Status |
|-------|-------------|--------|
| **#23615** | Panes split current window instead of creating new window, destroying user layout | Open |
| **#23527** | `pane-base-index` != 0 causes instructions to be sent to wrong pane | Closed (dup of #23415) |
| **#23437** | `--teammate-mode in-process` flag ignored when inside tmux (always uses tmux) | Open |
| **#23456** | Tmux-based agents spawn but never receive initial prompt | Open |
| **#23513** | `send-keys` race condition when multiple agents start simultaneously | Open |

### 4. How the detection actually works

The `teammateMode` setting accepts three values:
- **`"auto"` (default):** Uses split panes if already running inside a tmux session, in-process otherwise
- **`"tmux"`:** Enables split-pane mode, auto-detects whether to use tmux or iTerm2 based on terminal
- **`"in-process"`:** Forces all teammates into the main terminal

When set to `"tmux"`, Claude Code runs a detection sequence:
1. Check if running inside iTerm2 (via `TERM_PROGRAM` or similar env var)
2. If iTerm2 detected, try to use the `it2` CLI for pane creation
3. If not iTerm2 (or if it2 fails), check if `tmux` is available
4. If tmux available and already in a tmux session, use `tmux split-window` to create panes
5. **If all backends fail, silently fall back to in-process** (this is the bug -- no error is surfaced)

### 5. `tmux -CC` control mode is a special case

iTerm2's `tmux -CC` control mode creates a hybrid environment:
- iTerm2 renders tmux panes as native iTerm2 tabs/split panes
- The shell session runs inside tmux (so `TMUX` env var is set)
- But `TERM_PROGRAM` inside the tmux session is typically `tmux`, not `iTerm2.app`
- This means the iTerm2 backend detection likely fails
- The tmux backend should detect the `TMUX` env var, but if `teammateMode` from settings.json is broken (#23784), neither backend gets activated

The official docs actually recommend `tmux -CC` as the entry point:
> "Using `tmux -CC` in iTerm2 is the suggested entrypoint into tmux."

But the detection logic does not appear to handle this case well.

### 6. The feature DOES create actual tmux panes (when working)

"tmux pane" in the output is NOT a misnomer. When the feature works correctly:
- Claude Code runs `tmux split-window` to create new panes in the current tmux window
- Each teammate gets its own physical tmux pane
- `claude --resume <session-id> --teammate` is launched in each pane
- The panes are real, interactive Claude Code sessions

The YouTube demonstrations and blog posts (Addy Osmani, Better Stack) confirm this creates visible, interactive split panes. The feature is real -- it just has multiple failure modes that cause silent fallback.

### 7. No explicit minimum version beyond 2.1.32

Agent teams shipped with Claude Code v2.1.32 (Feb 5, 2026 -- Opus 4.6 launch day). Your v2.1.34 is current. The `settings.json` bug (#23784) was just closed as COMPLETED, so a new patch release likely includes the fix. All reported issues span v2.1.32 through v2.1.34.

### 8. iTerm2 Python API must be enabled

Yes, the iTerm2 Python API must be explicitly enabled for the iTerm2 backend to work:
- **Path:** iTerm2 -> Settings -> General -> Magic -> Enable Python API
- The `it2` CLI (from https://github.com/mkusaka/it2) must also be installed
- **it2 v0.1.9+** is required (v0.1.8 had the Click parameter bug)

---

## Detailed Analysis

### Your Specific Setup: iTerm2 + tmux -CC

Your combination of iTerm2 with `tmux -CC` control mode is particularly problematic because:

1. **settings.json was broken** (#23784) -- `teammateMode: "tmux"` was ignored. Only the CLI flag worked. This was just fixed.

2. **iTerm2 detection fails inside tmux -CC** (#23572) -- The `ITermBackend.isAvailable` check returns false because inside `tmux -CC`, the environment looks like tmux, not iTerm2.

3. **Silent fallback** (#23572) -- When both backends fail detection, you get no error. The agents show "tmux pane" in their labels but actually run in-process.

### Recommended Fix Sequence

**Step 1: Use the CLI flag (bypass settings.json bug)**
```bash
claude --teammate-mode tmux
```

**Step 2: Ensure you are running inside a tmux session**
Since you use `tmux -CC`, your Claude Code session IS inside tmux. The `TMUX` environment variable should be set. Verify:
```bash
echo $TMUX
```

**Step 3: Update it2 CLI to v0.1.9+**
```bash
pip install --upgrade it2
it2 --version  # should be >= 0.1.9
```

**Step 4: Enable iTerm2 Python API**
iTerm2 -> Settings -> General -> Magic -> Enable Python API

**Step 5: If panes still don't appear, try running outside tmux -CC**
Launch Claude Code in a regular iTerm2 tab (not inside tmux), then let Claude Code create its own tmux session for teammates:
```bash
# Outside tmux:
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --teammate-mode tmux
```

**Step 6: Alternative -- launch tmux directly (not -CC mode)**
```bash
tmux new-session -s claude-teams
# Inside the tmux session:
claude --teammate-mode tmux
```
This ensures the tmux backend detects a valid tmux session without the `tmux -CC` control mode complications.

### If using tmux pane-base-index != 0

If your tmux config has `set -g pane-base-index 1` (common in tmux-sensible), teammates may spawn but never receive their initial instructions. Temporarily set it to 0:
```bash
tmux set pane-base-index 0
```

---

## All Related GitHub Issues

| Issue | Title | Status | Impact |
|-------|-------|--------|--------|
| [#23784](https://github.com/anthropics/claude-code/issues/23784) | `teammateMode: "tmux"` in settings.json ignored | **CLOSED (FIXED)** | Settings not wired to spawning logic |
| [#23572](https://github.com/anthropics/claude-code/issues/23572) | Silent fallback to in-process when it2 CLI broken | **OPEN** | No error when backend detection fails |
| [#23615](https://github.com/anthropics/claude-code/issues/23615) | Panes split current window, not new window | **OPEN** | Layout destruction, send-keys corruption |
| [#23527](https://github.com/anthropics/claude-code/issues/23527) | pane-base-index != 0 breaks instruction delivery | **CLOSED (dup)** | Instructions sent to wrong pane |
| [#23437](https://github.com/anthropics/claude-code/issues/23437) | in-process flag ignored when inside tmux | **OPEN** | Can't force in-process from tmux |
| [#23456](https://github.com/anthropics/claude-code/issues/23456) | Agents spawn but never receive initial prompt | **OPEN** | Teammates idle at welcome screen |
| [#23513](https://github.com/anthropics/claude-code/issues/23513) | send-keys race condition with multiple agents | **OPEN** | Command garbling, agent failures |
| [#23415](https://github.com/anthropics/claude-code/issues/23415) | Teammates don't poll inbox, messages never delivered | **OPEN** | Core messaging bug |
| [#23574](https://github.com/anthropics/claude-code/issues/23574) | Feature: Add WezTerm backend | **OPEN** | Not applicable to your setup |

---

## Sources

- [Official Agent Teams Documentation](https://code.claude.com/docs/en/agent-teams) -- Anthropic official docs, authoritative
- [Issue #23572: Silent fallback bug](https://github.com/anthropics/claude-code/issues/23572) -- Direct match to your problem, filed Feb 6 2026
- [Issue #23784: settings.json ignored](https://github.com/anthropics/claude-code/issues/23784) -- Your exact config issue, FIXED Feb 7 2026
- [Issue #23615: Panes split current window](https://github.com/anthropics/claude-code/issues/23615) -- Layout issues, filed Feb 6 2026
- [Issue #23527: pane-base-index bug](https://github.com/anthropics/claude-code/issues/23527) -- Closed as dup, filed Feb 6 2026
- [Issue #23437: CLI flag ignored](https://github.com/anthropics/claude-code/issues/23437) -- Related detection bug, filed Feb 5 2026
- [Issue #23574: WezTerm feature request](https://github.com/anthropics/claude-code/issues/23574) -- Reveals detection mechanism details
- [Addy Osmani: Claude Code Swarms](https://addyosmani.com/blog/claude-code-agent-teams/) -- Well-sourced overview, Feb 5 2026
- [Paddo: Agent Teams Switch Got Flipped](https://paddo.dev/blog/agent-teams-the-switch-got-flipped/) -- Community analysis, Feb 6 2026
- [it2 v0.1.9 Release](https://github.com/mkusaka/it2/releases/tag/v0.1.9) -- Upstream fix for Click parameter bug

---

## Confidence Assessment

- **Overall confidence: HIGH** -- Multiple GitHub issues with reproduction steps directly match the reported behavior
- **Root cause identification: HIGH** -- Three distinct bugs identified that each independently cause the symptom
- **tmux -CC specific behavior: MEDIUM** -- Inferred from detection logic details; no issue specifically mentions `tmux -CC` control mode, but the environment variable masking is a well-understood consequence
- **Fix effectiveness: MEDIUM** -- The settings.json bug is confirmed fixed, but the silent fallback and detection issues remain open. The CLI flag workaround is reliable.
- **Recommendation for further investigation:** If the CLI flag workaround + regular tmux (not -CC) does not resolve the issue, file a new GitHub issue specifically describing the `tmux -CC` control mode scenario, as no existing issue covers this exact combination.
