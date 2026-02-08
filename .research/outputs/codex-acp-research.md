# codex-acp Research Report

**Date:** 2026-02-08
**Researcher:** Claude Opus 4.6
**Confidence:** High (all major questions answered with primary sources)

---

## Summary

The `codex-acp` project exists in **two GitHub repositories** -- the original community version at `cola-io/codex-acp` (113 stars, 124 commits) and a more popular version at `zed-industries/codex-acp` (327+ stars, maintained by the Zed editor team). Both are Rust-based ACP adapters that bridge OpenAI's Codex CLI with the Agent Client Protocol. The Zed version is available as an npm package (`@zed-industries/codex-acp`). Meanwhile, OpenAI's Codex CLI **does** have a built-in protocol mode (`codex proto`) that uses newline-delimited JSON over stdin/stdout, plus a non-interactive mode (`codex exec --json`) and a TypeScript SDK (`@openai/codex-sdk`). ACP itself is a real, actively-developed open standard created by Zed Industries, analogous to LSP but for AI coding agents.

---

## 1. Does `cola-io/codex-acp` Exist?

**YES.** The repository is live at https://github.com/cola-io/codex-acp

### Details
- **Description:** "An Agent Client Protocol (ACP)-compatible agent that bridges the OpenAI Codex runtime with ACP clients over stdio"
- **Language:** Rust (2024 edition), runs on Tokio single-threaded async runtime
- **License:** Apache-2.0
- **Stats:** 113 stars, 8 forks, 124 commits, 15 releases (latest v0.4.2)
- **Created:** September 2025

### Features
- Core ACP functionality: session management, authentication, prompt handling
- Slash commands: `/status`, `/init`, `/compact`, `/review`
- Three session modes: read-only, auto (default), full-access
- Multiple auth methods: OpenAI (ChatGPT/API key) and custom model providers
- Filesystem tooling via integrated MCP server
- Event streaming with model reasoning and token usage data

### Relationship to `zed-industries/codex-acp`

There are TWO codex-acp repositories:

| Attribute | `cola-io/codex-acp` | `zed-industries/codex-acp` |
|---|---|---|
| Stars | 113 | 327+ |
| Forks | 8 | 40+ |
| Language | Rust | Rust |
| License | Apache-2.0 | Apache-2.0 |
| npm package | Not found | `@zed-industries/codex-acp` |
| Status | Active | Active, Zed-maintained |

The `cola-io/codex-acp` appears to be the **original community implementation**. The `zed-industries/codex-acp` is the **Zed-maintained fork** that has become the canonical/official version. Zed's version has more stars, more forks, npm distribution, and is integrated directly into the Zed editor (users can click "New Codex Thread" from the agent panel).

A blog post by Ben Terhechte (Sep 26, 2025) references `cola-io/codex-acp` as the in-development ACP Codex plugin, suggesting cola-io created it first and Zed later took over or forked it.

---

## 2. Is There an npm Package or Rust Crate?

### npm Package: YES (Zed's version)
- **Package:** `@zed-industries/codex-acp`
- **Version:** 0.8.2 (as of Feb 2026)
- **Published:** 32 versions
- **Install:** `npm install @zed-industries/codex-acp`
- **Run:** `npx @zed-industries/codex-acp`
- **URL:** https://www.npmjs.com/package/@zed-industries/codex-acp

The npm package wraps the pre-built Rust binary for easy distribution.

### Rust Crate on crates.io: NOT CONFIRMED
I was unable to confirm a `codex-acp` crate on crates.io. However, the ACP protocol itself has an official Rust crate:
- **Crate:** `agentic-coding-protocol` (v0.0.11)
- **URL:** https://docs.rs/agentic-coding-protocol
- **Owners:** Zed staff (maxbrunsfeld, ConradIrwin, etc.)
- This is the protocol SDK, not the Codex adapter itself.

### npm Package for cola-io version: NOT FOUND
No npm package was found under the `cola-io` namespace. The cola-io version requires building from source with `make release`.

---

## 3. What Does codex-acp Do?

### Architecture
```
[ACP Client (Zed/Neovim/etc)]
        |
        | JSON-RPC over stdio
        v
   [codex-acp adapter]  <-- Rust binary
        |
        | Spawns & communicates via Codex proto mode
        v
   [Codex CLI (`codex proto`)]
        |
        | OpenAI API
        v
   [OpenAI Models (o3, etc)]
```

### How It Works
1. The ACP client (e.g., Zed) launches `codex-acp` as a subprocess
2. `codex-acp` speaks ACP (JSON-RPC over stdio) on one side
3. Internally, it spawns the Codex CLI in protocol mode (`codex proto`)
4. It translates between ACP's JSON-RPC protocol and Codex's JSON-line protocol
5. It handles session management, tool calls, permissions, slash commands, etc.

### Supported Features
- Context @-mentions and image support
- Tool calls with permission requests
- Code review capabilities and TODO lists
- Slash commands: `/review`, `/review-branch`, `/review-commit`, `/init`, `/compact`, `/logout`
- Custom prompts
- Client MCP server support
- Multiple auth methods: ChatGPT subscription, `CODEX_API_KEY`, `OPENAI_API_KEY`

---

## 4. Does Codex CLI Have Built-in Protocol / Programmatic Modes?

**YES -- three distinct modes:**

### A. Protocol Mode (`codex proto` / `codex p`)

This is the key programmatic interface that `codex-acp` uses internally.

- **Command:** `codex proto [OPTIONS]`
- **Transport:** Newline-delimited JSON over stdin/stdout (NOT JSON-RPC -- simpler custom protocol)
- **Requirement:** Non-terminal stdin (must be piped, not TTY)
- **Bidirectional:** stdin for submissions, stdout for events

#### Protocol Flow:
1. Codex starts and emits a `SessionConfigured` event
2. Client sends JSON-line submissions via stdin:
   ```json
   {"id": "unique-submission-id", "type": "text", "content": "Your prompt"}
   ```
3. Codex responds with JSON-line events via stdout:
   ```json
   {"id": "unique-event-id", "msg": {"type": "EventType", "data": {}}}
   ```
4. Process terminates on stdin close or Ctrl+C

**IMPORTANT:** This is NOT ACP/JSON-RPC. It is Codex's own custom JSON-line protocol. The `codex-acp` adapter exists precisely to bridge this gap.

### B. Non-Interactive Mode (`codex exec`)

For scripting and CI/CD:

- **Command:** `codex exec "prompt here"`
- **Key flags:**
  - `--json` -- Enables JSONL output on stdout (every event Codex emits)
  - `--full-auto` -- Allow edits automatically
  - `--sandbox <level>` -- Permission level
  - `-o/--output-last-message <file>` -- Write final message to file
  - `--output-schema <schema>` -- Request structured output per JSON Schema
- Streams progress to stderr, final answer to stdout
- With `--json`, stdout becomes a JSON Lines stream of lifecycle events, item completions, and token usage

### C. Codex SDK (`@openai/codex-sdk`)

A TypeScript library for programmatic control:

- **Install:** `npm install @openai/codex-sdk`
- **Runtime:** Node.js 18+
- **Capabilities:** Create/manage threads, run prompts programmatically, resume previous threads, chain operations
- More comprehensive than `codex exec` for application integration
- Designed for CI/CD pipelines and internal tooling

### D. Codex App Server (NEW -- Feb 2026)

OpenAI recently (Feb 4, 2026) announced the **Codex App Server**, which decouples the Codex agent logic from UI:
- Uses a JSON-RPC-like protocol
- Unifies the harness across web, CLI, IDE extension, and macOS app
- Described as "the critical link between" all Codex surfaces

---

## 5. What Is ACP (Agent Client Protocol)?

### Status: REAL, ACTIVELY DEVELOPED OPEN STANDARD

ACP is a **real protocol** created by **Zed Industries** under the **Apache-2.0 license**. It is actively developed and adopted by multiple editors and agents.

### Key Facts
- **Website:** https://agentclientprotocol.com
- **Created by:** Zed Industries
- **Backed by:** Zed Industries, JetBrains (adopted it for AI Assistant)
- **License:** Apache-2.0 (open source)
- **Transport:** JSON-RPC 2.0 over stdio (primary), HTTP/WebSocket (in progress)
- **Analogy:** "LSP for AI coding agents" -- just as LSP standardized language servers, ACP standardizes AI agent-editor communication

### Protocol Details

**Transport:**
- Messages are JSON-RPC 2.0, UTF-8 encoded
- Delimited by newlines (`\n`), no embedded newlines allowed
- Agent reads from stdin, writes to stdout
- Stderr used for diagnostic logging
- Client terminates by closing stdin

**Agent Methods (server-side):**
| Method | Required | Description |
|---|---|---|
| `initialize` | Yes | Negotiate versions, exchange capabilities |
| `authenticate` | Yes | Authenticate with the agent |
| `session/new` | Yes | Create a new conversation session |
| `session/prompt` | Yes | Send user message to agent |
| `session/load` | Optional | Load/resume an existing session |
| `session/set_mode` | Optional | Switch operating modes |

**Client Methods (client-side callbacks):**
| Method | Required | Description |
|---|---|---|
| `session/request_permission` | Yes | Request user authorization for tool calls |
| `fs/read_text_file` | Optional | Read file contents |
| `fs/write_text_file` | Optional | Write file contents |
| `terminal/create` | Optional | Create a terminal |
| `terminal/output` | Optional | Get terminal output |
| `terminal/release` | Optional | Release terminal |
| `terminal/wait_for_exit` | Optional | Wait for command completion |
| `terminal/kill` | Optional | Kill terminal command |

**Notifications:**
| Notification | Direction | Description |
|---|---|---|
| `session/update` | Agent -> Client | Progress updates during processing |
| `session/cancel` | Client -> Agent | Interrupt ongoing operations |

### Session Lifecycle:
1. `initialize` -- capability negotiation
2. `authenticate` -- if required
3. `session/new` or `session/load` -- setup session
4. `session/prompt` + `session/update` notifications -- prompt/response loop
5. Close stdin to terminate

### ACP Ecosystem

**Official SDKs:**
- TypeScript: `@zed-industries/agent-client-protocol`
- Rust: `agentic-coding-protocol` (crates.io)
- Python: `agentclientprotocol` Python SDK
- Kotlin: Available
- Go: `github.com/coder/acp-go-sdk`

**ACP Agents (adapters that wrap CLI tools):**
| Agent | Wraps | Package |
|---|---|---|
| `codex-acp` | OpenAI Codex CLI | `@zed-industries/codex-acp` |
| `claude-code-acp` | Anthropic Claude Code | `@zed-industries/claude-code-acp` |
| `cursor-agent-acp` | Cursor | Community |
| Goose | Block's Goose agent | Built-in ACP support |
| Kiro CLI | Amazon's Kiro | Built-in ACP support |

**ACP Clients (editors):**
- Zed (native support)
- JetBrains IDEs (via AI Assistant)
- Neovim (via CodeCompanion.nvim)
- Emacs (community)
- Unity Editor (UnityAgentClient)

### Maturity Assessment

ACP is **early-stage but real and gaining traction**:
- It has official backing from Zed Industries and JetBrains
- Multiple SDKs across languages (TypeScript, Rust, Python, Kotlin, Go)
- Growing ecosystem of agents and clients
- The protocol spec is evolving (breaking changes still occur)
- HTTP/WebSocket transport still "a work in progress"
- Not yet an IETF/W3C standard -- it is an industry standard driven by Zed

---

## Relevance to Liminal Builder

For the Liminal Builder project, the key takeaways are:

1. **`codex-acp` is a real, working adapter** -- either the cola-io or zed-industries version can wrap Codex CLI for programmatic use via ACP's JSON-RPC stdio protocol.

2. **ACP protocol is very similar to what Liminal Builder already uses with `claude-code-acp`** -- same session lifecycle: `initialize` -> `authenticate` -> `session/new` -> `session/prompt` -> `session/update` notifications -> response with `stopReason`.

3. **Codex CLI has its own protocol mode** (`codex proto`) that is a DIFFERENT protocol from ACP. It uses its own JSON-line format, not JSON-RPC. The `codex-acp` adapter bridges between the two.

4. **Alternative approach:** Instead of using `codex-acp`, you could potentially use:
   - `codex exec --json` for non-interactive one-shot tasks
   - `@openai/codex-sdk` for programmatic TypeScript integration
   - `codex proto` directly with a custom adapter

5. **The npm package `@zed-industries/codex-acp` provides the easiest installation** -- just `npx @zed-industries/codex-acp` or install globally.

---

## Sources

- [cola-io/codex-acp GitHub](https://github.com/cola-io/codex-acp) -- Original community repo, Apache-2.0
- [zed-industries/codex-acp GitHub](https://github.com/zed-industries/codex-acp) -- Zed-maintained version, 327+ stars
- [@zed-industries/codex-acp npm](https://www.npmjs.com/package/@zed-industries/codex-acp) -- npm package, v0.8.2
- [ACP Official Site](https://agentclientprotocol.com/) -- Protocol specification, Zed Industries
- [ACP Protocol Overview](https://agentclientprotocol.com/protocol/overview) -- Method reference
- [ACP Transports](https://agentclientprotocol.com/protocol/transports) -- stdio/JSON-RPC details
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/) -- Official OpenAI docs
- [Codex Non-Interactive Mode](https://developers.openai.com/codex/noninteractive/) -- `codex exec --json` docs
- [Codex SDK](https://developers.openai.com/codex/sdk/) -- TypeScript SDK docs
- [Codex Protocol Mode](https://tessl.io/registry/tessl/npm-openai--codex/0.39.0/files/docs/protocol-mode.md) -- `codex proto` protocol docs
- [Ben Terhechte blog](https://terhech.de/posts/2025-09-26-using-zeds-acp-with-codex.html) -- Setup guide from Sep 2025
- [ACP Intro (Goose blog)](https://block.github.io/goose/blog/2025/10/24/intro-to-agent-client-protocol-acp/) -- Good ACP overview
- [agentic-coding-protocol crate](https://docs.rs/agentic-coding-protocol) -- Rust SDK on crates.io
- [Codex App Server announcement](https://openai.com/index/unlocking-the-codex-harness/) -- Feb 4, 2026

## Confidence Assessment

- **Overall confidence:** High
- **Question 1 (repo exists):** Confirmed with direct fetch
- **Question 2 (npm/crate):** npm confirmed (`@zed-industries/codex-acp`); crate for adapter not confirmed but protocol SDK exists
- **Question 3 (what it does):** Well documented across multiple sources
- **Question 4 (Codex CLI protocol):** Confirmed `codex proto`, `codex exec --json`, and SDK exist
- **Question 5 (ACP status):** Real standard, well documented, but still evolving
- **Area of uncertainty:** The exact relationship between cola-io and zed-industries versions (fork? transfer? parallel development?) is not fully documented
