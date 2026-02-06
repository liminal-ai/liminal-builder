# How Zed Editor Wraps CLI Agents: The Agent Client Protocol (ACP)

**Research Date:** 2026-02-05
**Focus:** Zed's architecture for integrating CLI-based AI agents (Claude Code, Gemini CLI, Codex, etc.)

---

## Summary

Zed editor wraps CLI agents like Claude Code and Gemini CLI through the **Agent Client Protocol (ACP)** -- an open standard created by Zed Industries (Apache 2.0 licensed) that defines a JSON-RPC 2.0 communication layer over stdio between code editors (clients) and AI agents (servers). ACP is explicitly modeled after the Language Server Protocol (LSP) philosophy: just as LSP unbundled language intelligence from monolithic IDEs, ACP unbundles AI agent logic from editor UI. The protocol was announced August 27, 2025, with Gemini CLI as the reference implementation, Claude Code support added September 3, 2025, and Codex support in October 2025.

The core architecture is simple: Zed spawns CLI agents as child subprocesses and communicates with them over stdin/stdout using newline-delimited JSON-RPC messages. Each connection can support multiple concurrent sessions (conversation threads). For agents that do not natively speak ACP (like Claude Code), Zed uses an **adapter pattern** -- a lightweight TypeScript bridge that translates between the agent's SDK and ACP's JSON-RPC format. ACP has since been adopted beyond Zed: JetBrains IDEs are implementing it, Neovim has plugins for it, and GitHub Copilot CLI added ACP support in January 2026.

---

## Key Findings

- **The protocol is called ACP (Agent Client Protocol)** -- an open standard at https://agentclientprotocol.com, Apache 2.0 licensed, co-developed with JetBrains.
- **Transport: JSON-RPC 2.0 over stdio** -- agents run as subprocesses; messages are newline-delimited JSON, UTF-8 encoded.
- **Adapter pattern for existing CLIs** -- Claude Code and Codex use SDK-level adapters that translate their native APIs to ACP; Gemini CLI implements ACP natively.
- **Multiple concurrent sessions per connection** -- a single agent subprocess can handle several independent conversation threads simultaneously.
- **Capability negotiation at initialization** -- clients and agents exchange supported features (file system access, terminal control, content types, MCP transport support).
- **Terminal integration is bidirectional** -- agents can request terminal sessions from the editor via `terminal/create`, read output, wait for exit, and kill processes.
- **File system access is editor-mediated** -- agents read/write files through the editor (including unsaved buffer state), not directly.
- **MCP (Model Context Protocol) integration** -- ACP sessions can carry MCP server configurations, allowing agents to access MCP tools.
- **ACP Registry launched January 2026** -- agents register once and become available to all ACP-compatible clients.
- **Ecosystem adoption is broad** -- JetBrains (October 2025), Neovim (CodeCompanion, avante.nvim), Emacs (agent-shell), GitHub Copilot CLI (January 2026), plus agents like Goose, Augment Code, OpenCode, Stakpak.

---

## Detailed Analysis

### 1. The Protocol: Agent Client Protocol (ACP)

ACP is a JSON-RPC 2.0 based protocol that standardizes communication between code editors and AI coding agents. Its design principles:

1. **Bidirectional** -- Both client and agent can send requests to each other
2. **Streaming** -- Agents send real-time updates during processing via notifications
3. **Stateful** -- Sessions maintain conversation history
4. **Standard I/O** -- Uses stdin/stdout for subprocess communication
5. **JSON-RPC 2.0** -- Proven protocol for structured request/response messaging

The protocol reuses JSON representations from MCP (Model Context Protocol) where possible but adds custom types for coding-specific UX elements like diffs. Default text representation is Markdown.

**Message framing:**
- Messages are individual JSON-RPC requests, notifications, or responses
- Messages are delimited by newlines (`\n`) and MUST NOT contain embedded newlines
- All content MUST be UTF-8 encoded
- Agents MUST NOT write anything to stdout that is not a valid ACP message
- Clients MUST NOT write anything to the agent's stdin that is not a valid ACP message
- Stderr may be used for logging; clients MAY capture, forward, or ignore it

**Remote transport (Streamable HTTP)** is listed as "in discussion, draft proposal in progress" as of early 2026.

### 2. How CLI Agents Are Wrapped

Zed uses two approaches depending on whether the CLI tool natively speaks ACP:

#### A. Native ACP Implementation (e.g., Gemini CLI)

The agent directly implements the ACP protocol. When Zed launches the CLI, it communicates via stdin/stdout JSON-RPC without any intermediary. Gemini CLI was the reference implementation built in collaboration with Google.

#### B. Adapter/Bridge Pattern (e.g., Claude Code, Codex)

For agents that do not natively implement ACP, Zed created **adapters** -- lightweight bridge processes that:

1. Wrap the agent's official SDK (e.g., Anthropic's Claude Agent SDK)
2. Translate SDK interactions into ACP's JSON-RPC format
3. Run as the subprocess that Zed communicates with

**Claude Code adapter** (`@zed-industries/claude-code-acp`):
- Written in TypeScript
- Uses Anthropic's official Claude Agent SDK
- Installable via npm: `npm install -g @zed-industries/claude-code-acp`
- Launched with: `ANTHROPIC_API_KEY=sk-... claude-code-acp`
- Open source under Apache 2.0 at https://github.com/zed-industries/claude-code-acp
- Supports: context mentions, image attachments, tool execution with permission requests, edit review, TODO management, interactive and background terminals, custom slash commands, client MCP servers

**Codex adapter** (`codex-acp`):
- Bridges the OpenAI Codex runtime with ACP clients over stdio
- Available at https://github.com/cola-io/codex-acp (community) and as a Zed-managed integration

#### C. Custom Agents via Configuration

Users can configure arbitrary ACP-speaking agents in `settings.json`:

```json
{
  "agent_servers": {
    "my_agent": {
      "type": "custom",
      "command": "node",
      "args": ["path/to/script.js", "--acp"],
      "env": {}
    }
  }
}
```

### 3. Session Lifecycle and Multi-Agent/Multi-Session Architecture

#### Initialization Handshake

1. **Client sends `initialize`** with:
   - Protocol version (currently `1`)
   - Client capabilities (file system read/write, terminal support)
   - Implementation info (name, title, version)

2. **Agent responds** with:
   - Supported protocol version
   - Agent capabilities (session loading, prompt content types, MCP transports)
   - Authentication methods (if any)
   - Implementation info

3. **Capability contract**: Both sides MUST treat omitted capabilities as UNSUPPORTED.

#### Session Management

- **`session/new`**: Creates a new conversation session. Requires working directory (absolute path) and MCP server configs. Returns a unique `SessionId`.
- **`session/load`**: Resumes a previous session (requires `loadSession` capability). The agent replays full conversation history via `session/update` notifications.
- **`session/prompt`**: Sends user messages with content blocks (text, images, files, audio).
- **`session/cancel`**: Interrupts processing.
- **`session/update`**: Agent streams back results including plans, message chunks, and tool call status.

#### Concurrent Sessions

**Each connection can support several concurrent sessions.** This means a single agent subprocess can handle multiple independent conversation threads simultaneously. This is critical for Zed's UX where users can have multiple agent threads open in the sidebar.

The editor spawns agent subprocesses on demand and maintains client-side UI state separately from agent processes, enabling parallel interactions. Each session maintains its own context, conversation history, and state.

### 4. Terminal Integration Architecture

ACP provides dedicated terminal management methods that allow agents to execute commands through the editor's terminal infrastructure:

| Method | Purpose |
|--------|---------|
| `terminal/create` | Spawn new shell environments |
| `terminal/output` | Retrieve command output and exit codes |
| `terminal/wait_for_exit` | Block until process completion |
| `terminal/kill` | Terminate without releasing resources |
| `terminal/release` | Clean up terminal allocations |

The terminal capability must be advertised during initialization. This design means:
- Agents do NOT directly spawn shell processes -- they request the editor to do it
- The editor maintains control and visibility over all terminal activity
- Users can see what the agent is executing in real-time
- Both interactive and background terminal sessions are supported

This is a deliberate departure from Zed's earlier approach of running agents in the embedded terminal using ANSI escape codes, which proved insufficient for deep integration features like real-time edit visualization and multi-buffer reviews.

### 5. File System Integration

The editor mediates all file access through two ACP methods:

- **`fs/read_text_file`**: Reads files including unsaved editor buffer state, with optional line-based slicing (`line` and `limit` parameters). Requires absolute paths.
- **`fs/write_text_file`**: Creates or updates files with client-side path validation.

Both require corresponding capabilities (`readTextFile`, `writeTextFile`) advertised during initialization. The working directory specified at session creation "SHOULD serve as a boundary for tool operations."

This mediated approach means agents get access to the editor's live state (unsaved changes, open buffers) rather than just the filesystem, enabling richer code-aware interactions.

### 6. Performance Considerations

The research found limited explicit discussion of performance benchmarks, but the architecture has several performance-relevant characteristics:

- **Subprocess model**: Each agent runs as a separate OS process, providing natural isolation but consuming per-process resources (memory, file descriptors).
- **Zed is built in Rust**: The editor side of ACP handling benefits from Zed's high-performance Rust codebase with GPU-accelerated rendering.
- **On-demand spawning**: Agent subprocesses are booted only when users initiate a connection, not at editor startup.
- **Concurrent sessions within one process**: Multiple conversation threads share a single subprocess, reducing overhead compared to one-process-per-session.
- **Streaming via notifications**: `session/update` notifications stream results incrementally rather than waiting for complete responses, enabling real-time UI updates.
- **Managed installations**: Zed auto-manages agent installations separately from global installs, ensuring version compatibility and reducing startup friction.
- **No explicit rate limiting or resource caps**: The protocol specification does not define concurrency limits, memory budgets, or throttling mechanisms -- these are left to implementations.

### 7. Relationship to Other Protocols

| Protocol | Role | Relationship to ACP |
|----------|------|---------------------|
| **LSP** (Language Server Protocol) | Language intelligence | Inspiration for ACP's design philosophy |
| **MCP** (Model Context Protocol) | Tool/context access for LLMs | ACP reuses MCP's JSON types; ACP sessions carry MCP server configs |
| **DAP** (Debug Adapter Protocol) | Debugger integration | No direct relationship |

ACP explicitly positions itself as complementary to MCP: "MCP standardizes how agents access tools and context. ACP standardizes how agents interact with editors."

### 8. Ecosystem and Adoption Timeline

| Date | Milestone |
|------|-----------|
| Aug 27, 2025 | ACP announced; Gemini CLI as reference implementation |
| Sep 3, 2025 | Claude Code beta support via adapter |
| Oct 2, 2025 | Community progress report; Neovim, Emacs, Goose adoption |
| Oct 6, 2025 | JetBrains announces ACP collaboration |
| Oct 16, 2025 | Codex support live in Zed |
| Nov 6, 2025 | Agent Extensions introduced (one-click install) |
| Dec 5, 2025 | Docker joins ACP collaboration with JetBrains and Zed |
| Jan 28, 2026 | ACP Registry launched; GitHub Copilot CLI adds ACP support |

---

## Sources

### Primary / Authoritative
- [Bring Your Own Agent to Zed -- Featuring Gemini CLI](https://zed.dev/blog/bring-your-own-agent-to-zed) -- Official Zed blog post by Nathan Sobo (CEO), Aug 27, 2025. Announcement of ACP with detailed rationale.
- [Claude Code: Now in Beta in Zed](https://zed.dev/blog/claude-code-via-acp) -- Official Zed blog by Morgan Krey, Sep 3, 2025. Details the adapter architecture for Claude Code.
- [ACP Protocol Documentation](https://agentclientprotocol.com/) -- Official protocol specification site. Contains full technical spec for transports, sessions, terminals, file system, tool calls.
- [ACP Protocol Full Reference (llms.txt)](https://agentclientprotocol.com/llms-full.txt) -- Machine-readable full protocol specification.
- [External Agents Documentation](https://zed.dev/docs/ai/external-agents) -- Official Zed docs on configuring and using external agents.
- [ACP GitHub Repository](https://github.com/zed-industries/agent-client-protocol) -- Source code for the protocol specification.
- [Claude Code ACP Adapter](https://github.com/zed-industries/claude-code-acp) -- Source code for the Claude Code adapter (TypeScript, Apache 2.0).
- [How the Community is Driving ACP Forward](https://zed.dev/blog/acp-progress-report) -- Official Zed blog, Oct 2, 2025. Ecosystem adoption status.
- [Codex is Live in Zed](https://zed.dev/blog/codex-is-live-in-zed) -- Official Zed blog by Richard Feldman, Oct 16, 2025.
- [Introducing Agent Extensions](https://zed.dev/blog/agent-extensions) -- Official Zed blog by Richard Feldman, Nov 6, 2025. Agent extension architecture.
- [The ACP Registry is Live](https://zed.dev/blog/acp-registry) -- Official Zed blog, Jan 28, 2026. Central registry for agent discovery.

### Secondary / Industry
- [JetBrains x Zed: Open Interoperability for AI Coding Agents](https://blog.jetbrains.com/ai/2025/10/jetbrains-zed-open-interoperability-for-ai-coding-agents-in-your-ide/) -- JetBrains official blog, Oct 6, 2025. Confirms JetBrains ACP adoption.
- [Docker, JetBrains, and Zed: Building a Common Language for Agents and IDEs](https://www.docker.com/blog/docker-jetbrains-and-zed-building-a-common-language-for-agents-and-ides/) -- Docker official blog, Dec 5, 2025.
- [ACP support in Copilot CLI is now in public preview](https://github.blog/changelog/2026-01-28-acp-support-in-copilot-cli-is-now-in-public-preview/) -- GitHub official changelog, Jan 28, 2026.
- [Zed debuts Agent Client Protocol](https://tessl.io/blog/zed-debuts-agent-client-protocol-to-connect-ai-coding-agents-to-any-editor/) -- Tessl/TechCrunch writer Paul Sawers, Sep 10, 2025.
- [SymmACP: extending Zed's ACP to support Composable Agents](https://smallcultfollowing.com/babysteps/blog/2025/10/08/symmacp/) -- Niko Matsakis (Rust team member) blog, Oct 8, 2025. Proposed extension for composable agents.

### Community / Tertiary
- [Feature Request: Add support for ACP (Claude Code GitHub)](https://github.com/anthropics/claude-code/issues/6686) -- Community issue requesting native ACP in Claude Code, Aug 27, 2025.
- [ACPex (Elixir implementation)](http://hexdocs.pm/acpex/protocol_overview.html) -- Third-party Elixir SDK with good protocol overview.

---

## Confidence Assessment

- **Overall confidence: HIGH** -- The findings are based primarily on official Zed documentation, the protocol specification itself, and first-party blog posts from Zed, JetBrains, Docker, and GitHub.
- **Protocol specification details: HIGH** -- Sourced directly from agentclientprotocol.com and the official llms-full.txt reference.
- **Performance details: MEDIUM** -- The protocol spec and blog posts contain limited explicit performance discussion. The architecture implies good performance characteristics (subprocess isolation, streaming, concurrent sessions) but no benchmarks or resource usage data were found.
- **Multi-session concurrency: MEDIUM-HIGH** -- The spec states "each connection can support several concurrent sessions" but implementation-level details (thread pooling, memory management, session limits) are not publicly documented.
- **Areas of uncertainty:**
  - Remote/HTTP transport is still in draft status
  - Exact performance characteristics under heavy multi-session load are not documented
  - Whether agents like Claude Code's adapter handle true concurrent sessions or serialize them is implementation-dependent
- **Recommendations for further research:**
  - Inspect the Zed source code (Rust) for the client-side ACP implementation to understand subprocess management
  - Review the claude-code-acp TypeScript source for concurrency handling
  - Monitor the ACP spec for Streamable HTTP transport finalization
