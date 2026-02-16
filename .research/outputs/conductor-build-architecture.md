# Conductor.build Architecture Analysis

**Date**: 2026-02-15
**Version Analyzed**: v0.35.3 (current as of research date)
**Confidence**: High on process model and agent integration; Medium on native app framework specifics (closed source)

---

## Summary

Conductor is a closed-source macOS-native desktop application (YC S24, $2.8M raised) that orchestrates multiple Claude Code and OpenAI Codex agent instances in parallel. Its core architectural insight is using **git worktrees** for filesystem isolation combined with **Anthropic's Claude Agent SDK (TypeScript)** for agent lifecycle management. It does NOT use ACP. It spawns agents through the SDK, injects custom tools via in-process MCP servers (`createSdkMcpServer`), and manages the full lifecycle from workspace creation through PR merge. The app is local-first -- all code stays on the user's machine, no cloud containers.

---

## 1. Agent Instance Management

### How it spawns agents

Conductor uses **Anthropic's Claude Agent SDK (TypeScript)** -- not raw CLI spawning, not ACP. Evidence:

- Changelog v0.29.5 explicitly references "Claude Agent SDK when using async subagents"
- Changelog v0.32.2 references "a bug in the Claude Agent SDK" for MCP pickup
- Changelog v0.33.2 links to `github.com/anthropics/claude-agent-sdk-typescript/issues/153`
- Blog post on questions feature: "instead of waiting for Anthropic to support it in the SDK, we built our own version"
- Blog post on diff tools: "We built these tools with an in-process MCP server using `createSdkMcpServer` via the Claude Code SDK"

### For Codex (OpenAI)

Codex appears to be integrated as a selectable model via a "model picker" UI, added November 2025. The changelog (v0.24.0) shows "MCP tool calls in the chat" for Codex, suggesting Codex is also managed through a similar SDK/process boundary.

### Isolation mechanism

Each workspace = one git worktree = one branch = one agent instance. Key constraints:

- "A branch can only be checked out in one workspace at a time"
- When you press Cmd+N, Conductor creates a new git worktree and branch
- The agent names the branch based on the task after its first response
- Untracked files (`.env`, etc.) require setup scripts since worktrees don't copy them

---

## 2. Process Lifecycle

### Creation

1. User presses Cmd+N (or Cmd+Shift+N for branch-specific)
2. Conductor creates a git worktree from the repo
3. Setup script runs (zsh): copies `.env` files, installs dependencies, initializes DB, etc.
4. Agent (Claude Code or Codex) starts in the worktree directory
5. Conductor injects custom tools via in-process MCP server

### Runtime

- Multiple chat tabs per workspace (Cmd+T, added v0.17.0)
- Agent hooks into lifecycle for checkpointing (captures state at start/end of each turn)
- Conductor configures Claude Code hooks to commit working branch state to private git refs
- Agent can access custom tools: `GetWorkspaceDiff`, terminal reading, inline commenting
- Shell commands always use zsh internally (v0.13.8)
- Environment variables exposed: `$CONDUCTOR_ROOT_PATH`, `$CONDUCTOR_PORT`, `$CONDUCTOR_WORKSPACE_NAME`

### Termination

- "Claude Code now stops when you archive a workspace" (v0.11.6)
- Archive script runs on workspace deletion for cleanup
- Resource leak fixes suggest OS-level process management (v0.7.0: "fixed a resource leak that would happen when a terminal shut down")
- Agents only run while the app is active (no background execution)

---

## 3. Checkpointing Architecture

This is their most architecturally sophisticated subsystem. From the blog post "How we built checkpointing":

### State captured per checkpoint

1. Current commit HEAD
2. Index (staged changes)
3. Worktree state (all files including untracked)

### Implementation

- Converts index and worktree to tree objects using `git write-tree`
- For worktree, writes to a temporary index via `GIT_INDEX_FILE`
- Bundles all three SHA-1s into a commit message stored as a private ref at `.git/refs/conductor-checkpoints/<id>`
- Hooks into agent lifecycle to run at start and end of each turn

### API surface

```
checkpointId = capture()
revert(checkpointId)
diff(id1, id2) or diff(id1, 'current')
```

### Why this matters

Unlike Claude Code's native checkpointing (which only captures files touched by the file editing tool), Conductor captures ALL changes -- including those from linters, package managers, code generators, etc. This is a genuine architectural advantage.

---

## 4. Tool Injection via In-Process MCP

Conductor extends agent capabilities by injecting custom tools through `createSdkMcpServer` (Anthropic's lightweight in-process MCP server API). Confirmed tools:

| Tool | Version | Purpose |
|------|---------|---------|
| `GetWorkspaceDiff` | v0.28.4 | Full diff, file diff, or `--stat` summary |
| Terminal reader | v0.29.5 | Agent can read terminal output |
| Inline commenting | v0.29.0 | Comment on specific diff lines |
| Ask-question | v0.24+ | Multiple-choice questions to user |
| Diff reading variants | v0.29.0 | Full, per-file, and summary modes |

This is NOT external MCP server processes -- it is in-process tool injection, meaning the tools run inside Conductor's own process and are provided to the agent SDK.

---

## 5. UI Model

### Layout

- **Sidebar**: Lists all workspaces across all repos, with status indicators
- **Main area**: Active workspace with chat interface (terminal-style)
- **Tabs**: Multiple chat tabs per workspace (Cmd+T)
- **Diff viewer**: Built-in code review (Cmd+D)
- **Checks tab**: GitHub Actions, deployments, comments, todos
- **Run panel**: Terminal for dev servers and tests

### Performance optimizations

- **Virtualized chat rendering** (v0.9.1): "Long chats now render much faster"
- **WebGL terminal rendering** (v0.10.3)
- **10x faster fuzzy search** (v0.25.13)
- **Bundle size reduction**: 225MB down to ~124MB (v0.22.2)
- **Context meter**: Shows percentage of context window used (v0.28.0)

### Keyboard-driven

Heavy keyboard shortcut system: Cmd+N (new workspace), Cmd+T (new chat tab), Cmd+D (diff), Cmd+Shift+P (create PR), Cmd+Shift+R (review), Cmd+Shift+M (merge), etc.

---

## 6. Supported Agents and Models

### Agent frameworks

- **Claude Code** (primary, via Claude Agent SDK TypeScript)
- **OpenAI Codex** (added November 2025)

### Model selection

Dynamic model picker supporting:
- Claude Opus, Sonnet, Haiku variants
- GPT-5 series
- Codex variants
- Thinking level configuration (minimal to xhigh for Codex, ultrathink replaced with max thinking budget for Claude)

### Provider flexibility

- Claude Code via: API key, Claude Pro, Claude Max
- Alternate providers: Bedrock, Vertex, OpenRouter, any Anthropic-compatible URL (v0.13.6)
- Codex via: OpenAI credentials

---

## 7. Cross-Agent Context Sharing

### .context directory (v0.28.1)

Filesystem-based approach for sharing context between agents:

- Plans generated by Claude Code are auto-saved to `.context/`
- Attachments (images, docs, Linear issues, chat summaries) stored there
- Can be imported into new chats with `@` syntax
- Gitignored by default

### Design rationale (from blog)

They evaluated: local DB storage, prompt injection, special context tools. Chose filesystem because "Coding agents are already great at manipulating files (and so are humans!)."

---

## 8. Configuration Model

### conductor.json

Repo-level config committed to git:
- Setup scripts (run on workspace creation)
- Run scripts (on-demand dev server/test execution)
- Archive scripts (cleanup on workspace deletion)
- Shareable across team

### Scripts system

Three lifecycle hooks:
1. **Setup**: Runs in new worktree on creation (install deps, copy env, init DB)
2. **Run**: On-demand via Run button (dev servers, tests). Supports "nonconcurrent mode" to auto-kill previous
3. **Archive**: Cleanup on workspace deletion

### Port management

`$CONDUCTOR_PORT` environment variable lets each workspace run dev servers on unique ports, avoiding conflicts.

### Agent instructions

v0.31.2: Per-repo instructions for agents on startup, analogous to `CLAUDE.md` or `AGENTS.md`.

---

## 9. What Conductor is NOT

- **Not Electron**: One third-party analysis explicitly states "native macOS application (not Electron-based)" (rywalker.com). The bundle size reduction from 225MB to 124MB is consistent with either Swift/AppKit or a framework like Tauri, though this is not confirmed.
- **Not ACP**: No evidence of Agent Communication Protocol usage. Agent orchestration is through the Claude Agent SDK TypeScript.
- **Not cloud-based**: Everything runs locally. Contrasts with Codex's cloud container approach.
- **Not a general agent orchestrator**: Only supports Claude Code and Codex. No arbitrary agent support.
- **Not background-capable**: Agents only run while the app is active.

---

## 10. Architecture Diagram (Inferred)

```
+------------------------------------------+
|          Conductor Mac App               |
|  (likely Swift/Tauri + TypeScript)       |
|                                          |
|  +------------------------------------+  |
|  |     Claude Agent SDK (TS)          |  |
|  |  +----------+  +----------+       |  |
|  |  | Agent 1  |  | Agent 2  |  ...  |  |
|  |  | (Claude) |  | (Codex)  |       |  |
|  |  +----------+  +----------+       |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  | In-Process MCP Server              |  |
|  | (createSdkMcpServer)              |  |
|  | - GetWorkspaceDiff                 |  |
|  | - AskQuestion                      |  |
|  | - ReadTerminal                     |  |
|  | - InlineComment                    |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  | Workspace Manager                  |  |
|  | - Git worktree creation/deletion   |  |
|  | - Branch lifecycle                 |  |
|  | - Checkpoint system (git refs)     |  |
|  | - Setup/Run/Archive scripts        |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  | UI Layer                           |  |
|  | - Virtualized chat rendering       |  |
|  | - WebGL terminal                   |  |
|  | - Diff viewer                      |  |
|  | - Checks tab (gh CLI integration)  |  |
|  +------------------------------------+  |
+------------------------------------------+
           |              |
    Git Worktree 1   Git Worktree 2   ...
    (branch: feat-a) (branch: feat-b)
    .context/         .context/
```

---

## Sources

- [conductor.build](https://conductor.build) - Main site (v0.35.3)
- [docs.conductor.build](https://docs.conductor.build) - Official documentation
- [blog.conductor.build/checkpointing](https://blog.conductor.build/checkpointing/) - "How we built checkpointing" (Dec 2025)
- [conductor.build/blog/ask-user-question-tool](https://www.conductor.build/blog/ask-user-question-tool) - "Conductor now asks questions" (Dec 2025)
- [conductor.build/blog/diff-tools](https://www.conductor.build/blog/diff-tools) - "Claude can now comment on your code" (Jan 2026)
- [conductor.build/blog/context](https://www.conductor.build/blog/context) - "The .context directory" (Dec 2025)
- [conductor.build/changelog](https://www.conductor.build/changelog) - Full changelog through v0.35.3
- [conductor.build/join-us](https://www.conductor.build/join-us) - Hiring page with company details
- [ycombinator.com/companies/conductor](https://www.ycombinator.com/companies/conductor) - YC profile (S24)
- [news.ycombinator.com/item?id=44594584](https://news.ycombinator.com/item?id=44594584) - HN Show discussion (115 comments)
- [rywalker.com/research/conductor](https://rywalker.com/research/conductor) - Third-party architectural analysis
- [chatgate.ai/post/conductor](https://chatgate.ai/post/conductor) - Third-party review

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| Uses Claude Agent SDK (not raw CLI) | **High** | Multiple direct references in changelog and blog posts |
| Git worktree isolation model | **High** | Confirmed by docs, blog, HN founder comments |
| In-process MCP for tool injection | **High** | Blog post explicitly mentions `createSdkMcpServer` |
| Not using ACP | **High** | No evidence anywhere; all integration is SDK-based |
| Native Mac app (not Electron) | **Medium** | One third-party source claims this; bundle size consistent but not conclusive |
| Specific app framework (Swift vs Tauri) | **Low** | No direct evidence; closed source |
| Codex integration mechanism | **Medium** | Less documented than Claude Code; appears similar SDK-based approach |
| No background execution | **Medium** | Stated by one source; not contradicted |
