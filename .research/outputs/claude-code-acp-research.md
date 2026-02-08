# claude-code-acp Research Report

**Date**: 2026-02-08
**Research scope**: Existence, purpose, protocol, installation of `@zed-industries/claude-code-acp`; ACP protocol origins; Claude Code CLI programmatic APIs

---

## Executive Summary

**All five of your questions have definitive answers.** The `@zed-industries/claude-code-acp` npm package is real, actively maintained (v0.15.0 published ~Feb 7, 2026), and has a corresponding GitHub repo. ACP (Agent Client Protocol) is a real, published open standard created by **Zed Industries** (not Anthropic). Claude Code CLI itself has a separate, official programmatic SDK (`@anthropic-ai/claude-agent-sdk`) that does NOT use ACP -- it uses its own streaming async iterator pattern. The `claude-code-acp` adapter bridges these two worlds.

---

## 1. Does the npm Package Exist?

**YES.** The package is published at:

- **npm**: https://www.npmjs.com/package/@zed-industries/claude-code-acp
- **Latest version**: 0.15.0 (published ~Feb 7, 2026)
- **Total versions published**: 67
- **License**: Apache-2.0

Install:
```bash
npm install -g @zed-industries/claude-code-acp
```

---

## 2. Is There a GitHub Repo?

**YES.** The repo is:

- **URL**: https://github.com/zed-industries/claude-code-acp
- **Stars**: ~900
- **Forks**: ~143
- **Open issues**: 26
- **Language**: TypeScript (99.2%)
- **License**: Apache-2.0
- **Organization**: Zed Industries (the same company behind the Zed editor)

---

## 3. What Does It Do?

`claude-code-acp` is a **protocol bridge/adapter** that translates bidirectionally between:
- The **ACP protocol** (JSON-RPC 2.0 over stdio) used by editors like Zed
- The **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) which provides programmatic access to Claude Code

### Architecture (Three-Layer Stack)

1. **ACP Layer**: Handles stdin/stdout JSON-RPC communication with the editor/client
2. **MCP Layer**: Manages tool execution (Read, Write, Edit, Bash, Grep, Glob, etc.)
3. **Claude SDK Layer**: Interfaces with Anthropic's API for AI interactions and session management

### Core Class: `ClaudeAcpAgent`

The central orchestrator implementing the ACP Agent interface:

- `initialize()` -- Returns agent capabilities (supports load session, images, embedded context, MCP)
- `newSession()` -- Creates a new conversation with UUID v7 session ID
- `loadSession()` / `unstable_resumeSession()` / `unstable_forkSession()` / `unstable_listSessions()` -- Session management
- `prompt(request)` -- Processes user queries, streams responses as ACP notifications
- `requestPermission()` -- Requests user approval for tool execution

### Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/claude-agent-sdk` | ^0.2.34 | Claude Code AI integration |
| `@agentclientprotocol/sdk` | 0.14.1 | ACP protocol types and interfaces |
| `@modelcontextprotocol/sdk` | ^1.26.0 | MCP server/client implementation |
| `diff` | 8.0.3 | Patch parsing for edit diffs |
| `minimatch` | 10.1.2 | Glob pattern matching for permissions |

### Supported Features

- Context @-mentions
- Image attachments
- Tool calls with permission requests
- Edit review (follow-along in editor)
- TODO lists
- Interactive and background terminals
- Custom slash commands
- Client-side MCP server integration

### Protocol Translation

| Claude SDK Event | ACP Update Type |
|---|---|
| `content_block_start` (text) | `agent_message_chunk` |
| `content_block_delta` (text_delta) | `agent_message_chunk` |
| `content_block_start` (thinking) | `agent_thought_chunk` |
| `content_block_delta` (thinking_delta) | `agent_thought_chunk` |
| Tool use (file read) | `tool_call` with `kind: "read"` |
| Tool use (file write/edit) | `tool_call` with `kind: "edit"` |
| Tool use (bash/terminal) | `tool_call` with `kind: "execute"` |

### Library Mode (Programmatic Import)

In addition to CLI usage, you can import it as a library:

```typescript
import { ClaudeAcpAgent } from '@zed-industries/claude-code-acp';

const agent = new ClaudeAcpAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  projectRoot: process.cwd()
});
```

---

## 4. Is ACP a Real Published Protocol?

**YES.** ACP (Agent Client Protocol) is a real, published open standard.

### Who Created It

- **Created by**: **Zed Industries** (makers of the Zed code editor)
- **NOT created by Anthropic.** Anthropic created MCP (Model Context Protocol). ACP is a separate, complementary protocol.
- **Co-developed with**: JetBrains announced partnership on ACP in October 2025
- **Introduced**: September 2025
- **License**: Apache-2.0

### Where the Spec Lives

- **Official website**: https://agentclientprotocol.com
- **GitHub repository**: https://github.com/zed-industries/agent-client-protocol (now also mirrored at agentclientprotocol org)
- **Stars**: ~1,800+
- **Commits**: 702+, 62 contributors

### What ACP Is

ACP standardizes communication between **code editors** and **AI coding agents**. It is the agent-to-editor protocol, analogous to how LSP (Language Server Protocol) standardized language tooling.

- **Transport**: JSON-RPC 2.0 over stdio (primary), HTTP/WebSocket for remote agents
- **Message format**: Newline-delimited JSON (NDJSON)
- **Relationship to MCP**: Complementary. MCP connects agents to external tools/services. ACP connects agents to editors/IDEs. They coexist.

### ACP vs Other Protocols

| Protocol | Created By | Purpose | Transport |
|---|---|---|---|
| **ACP** | Zed Industries | Agent <-> Editor communication | JSON-RPC over stdio |
| **MCP** | Anthropic | Agent <-> Tools/Services | JSON-RPC over stdio/HTTP |
| **A2A** | Google | Agent <-> Agent communication | HTTP REST |
| **LSP** | Microsoft | Editor <-> Language Server | JSON-RPC over stdio |

### Editors Supporting ACP

Zed (native), JetBrains IDEs (in progress), Emacs, marimo, Neovim (via plugins), and more.

### Agents Supporting ACP

Claude Code (via claude-code-acp), Gemini CLI, GitHub Copilot, Cline, OpenHands, Goose, Kiro, and 20+ others.

### Official SDK Libraries

| Language | Package | Repository |
|---|---|---|
| TypeScript | `@agentclientprotocol/sdk` | https://github.com/agentclientprotocol/typescript-sdk |
| Rust | `agent-client-protocol` (crates.io) | https://github.com/agentclientprotocol/agent-client-protocol |
| Python | `agentclientprotocol` | https://github.com/agentclientprotocol/python-sdk |
| Kotlin | `acp-kotlin` | https://github.com/agentclientprotocol/kotlin-sdk |

---

## 5. How Do You Install and Run It?

### Installation

```bash
# Global install (recommended for CLI usage)
npm install -g @zed-industries/claude-code-acp

# Or local install
npm install @zed-industries/claude-code-acp
```

### Prerequisites

- Node.js 18+
- npm
- Valid Anthropic API key (`ANTHROPIC_API_KEY`)
- File system access (stores sessions in `~/.claude/`)

### Running

```bash
ANTHROPIC_API_KEY=sk-ant-... claude-code-acp
```

The process communicates via **stdin/stdout** using **NDJSON** (newline-delimited JSON-RPC 2.0). Console output is redirected to stderr so stdout is reserved exclusively for ACP messages.

### Zed Integration (Automatic)

In Zed editor, no manual installation is needed:
1. Open the Agent Panel
2. Click the "+" button
3. Select "New Claude Code Thread"

Zed auto-installs and manages the adapter.

### Generic ACP Client Configuration

For any ACP-compatible client:
```json
{
  "agent_servers": {
    "Claude Code": {
      "command": "claude-code-acp",
      "args": [],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

### Settings Hierarchy (Priority Order)

1. Enterprise: `/Library/Application Support/ClaudeCode/managed-settings.json` (macOS)
2. Local: `<project-root>/.claude/settings.local.json`
3. Project: `<project-root>/.claude/settings.json`
4. User: `~/.claude/settings.json`

### Session Storage

Sessions persist as JSONL files in `~/.claude/projects/<encoded-path>/session-<uuid>.jsonl`.

---

## 6. BONUS: Claude Code CLI Built-in Programmatic API

Claude Code CLI does **NOT** have a `--json-rpc`, `--stdio`, or `--acp` flag. However, it has extensive programmatic support through different mechanisms:

### The Claude Agent SDK (Formerly "Claude Code SDK")

Anthropic provides an official SDK for programmatic access to Claude Code's capabilities:

- **TypeScript**: `@anthropic-ai/claude-agent-sdk` (npm)
- **Python**: `claude-agent-sdk` (PyPI)
- **GitHub (TS)**: https://github.com/anthropics/claude-agent-sdk-typescript
- **GitHub (Python)**: https://github.com/anthropics/claude-agent-sdk-python
- **Docs**: https://platform.claude.com/docs/en/agent-sdk/overview

**NOTE: This was recently renamed from "Claude Code SDK" to "Claude Agent SDK".**

#### TypeScript Usage

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  console.log(message);
}
```

The `query()` function returns an **async iterator** that streams messages. This is NOT JSON-RPC -- it is a native JavaScript async generator pattern. Under the hood, it spawns the Claude Code process and communicates with it.

#### Key Features

- Built-in tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
- Session management (resume, fork sessions)
- MCP server integration
- Hooks (PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd)
- Subagents with custom prompts and tool restrictions
- Permission modes: bypassPermissions, acceptEdits, plan
- Skills, slash commands, plugins
- Structured JSON output via `--json-schema`

### CLI Print Mode (Scripting)

The `claude` CLI has a print mode (`-p` / `--print`) for non-interactive scripting:

```bash
# Plain text output
claude -p "explain this function"

# JSON output (structured)
claude -p "query" --output-format json

# Streaming JSON output
claude -p "query" --output-format stream-json

# With partial messages
claude -p --output-format stream-json --include-partial-messages "query"

# Streaming JSON input
claude -p --output-format json --input-format stream-json
```

### Relevant CLI Flags for Programmatic Use

| Flag | Description |
|------|-------------|
| `--print` / `-p` | Non-interactive mode, outputs and exits |
| `--output-format json` | Structured JSON output |
| `--output-format stream-json` | Streaming JSON output |
| `--input-format stream-json` | Accept streaming JSON input |
| `--include-partial-messages` | Include partial streaming events |
| `--json-schema '{...}'` | Validated structured output matching a schema |
| `--max-turns N` | Limit agentic turns |
| `--max-budget-usd N` | Cost cap |
| `--no-session-persistence` | Don't save session to disk |
| `--session-id UUID` | Use specific session ID |
| `--resume` / `-r` | Resume a session |
| `--continue` / `-c` | Continue most recent conversation |
| `--fork-session` | Fork instead of resuming |
| `--dangerously-skip-permissions` | Skip all permission prompts |
| `--permission-prompt-tool` | MCP tool to handle permissions |
| `--mcp-config` | Load MCP servers from JSON |
| `--system-prompt` | Replace system prompt |
| `--append-system-prompt` | Add to system prompt |
| `--model` | Set model (sonnet, opus, or full name) |
| `--tools` | Restrict available tools |
| `--allowedTools` | Tools that skip permission prompts |
| `--agents` | Define custom subagents via JSON |

### What Does NOT Exist on the CLI

- **No `--json-rpc` flag** -- There is no built-in JSON-RPC server mode
- **No `--stdio` flag** -- There is no raw stdio protocol mode
- **No `--acp` flag** -- ACP support is only through the separate `claude-code-acp` adapter
- The CLI does not natively speak any wire protocol; it uses the Agent SDK for programmatic integration

---

## Summary: How the Pieces Fit Together

```
                    YOUR APP (Liminal Builder)
                           |
                    [spawns subprocess]
                           |
                    claude-code-acp
                    (ACP adapter)
                           |
              +------------+------------+
              |                         |
    ACP Protocol Layer          Claude Agent SDK
    (JSON-RPC over stdio)    (@anthropic-ai/claude-agent-sdk)
    Talks to your app           Talks to Anthropic API
              |                         |
       stdin/stdout              HTTPS to Anthropic
```

For your Liminal Builder project, `claude-code-acp` is the right integration point. You spawn it as a subprocess, communicate over stdin/stdout using NDJSON JSON-RPC 2.0 (the ACP protocol), and it handles all Claude Code interaction internally via the Agent SDK.

**Alternative approach**: You could also use the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) directly in your server process, bypassing ACP entirely. This gives you a TypeScript async iterator API instead of a subprocess JSON-RPC protocol.

---

## Sources

- [npm: @zed-industries/claude-code-acp](https://www.npmjs.com/package/@zed-industries/claude-code-acp) -- Official npm package, highly authoritative
- [GitHub: zed-industries/claude-code-acp](https://github.com/zed-industries/claude-code-acp) -- Official source repository
- [GitHub: zed-industries/agent-client-protocol](https://github.com/zed-industries/agent-client-protocol) -- ACP specification repository
- [Zed ACP Landing Page](https://zed.dev/acp) -- Official ACP overview from Zed
- [ACP Official Website](https://agentclientprotocol.com/overview/introduction) -- Protocol specification
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) -- Official Anthropic docs
- [npm: @anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) -- Official Claude Agent SDK
- [GitHub: anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) -- Agent SDK source
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) -- Complete CLI flag reference
- [DeepWiki: claude-code-acp Architecture](https://deepwiki.com/zed-industries/claude-code-acp) -- Detailed architecture analysis
- [Intro to ACP Blog Post](https://www.calummurray.ca/blog/intro-to-acp) -- Developer introduction to ACP
- [Zed ACP Registry Announcement](https://zed.dev/blog/acp-registry) -- Jan 2026
- [Goose ACP Introduction](https://block.github.io/goose/blog/2025/10/24/intro-to-agent-client-protocol-acp/) -- Oct 2025
- [JetBrains ACP Blog](https://blog.jetbrains.com/ai/2025/12/agents-protocols-and-why-we-re-not-playing-favorites/) -- Dec 2025

## Confidence Assessment

- **Overall confidence**: **HIGH** -- All findings are confirmed through multiple authoritative sources
- **Package existence**: **CONFIRMED** -- npm registry, GitHub repo, 900 stars, 67 versions
- **ACP protocol**: **CONFIRMED** -- Published spec, official website, multiple SDK implementations, adoption by Zed + JetBrains
- **Claude Agent SDK**: **CONFIRMED** -- Official Anthropic product, documented, active development
- **No built-in JSON-RPC on CLI**: **HIGH confidence** -- Complete CLI reference reviewed, no such flags exist
- **Key clarification**: ACP is from Zed Industries, NOT Anthropic. Anthropic's protocol is MCP (Model Context Protocol). These are complementary, not competing.
