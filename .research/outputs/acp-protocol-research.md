# Agent Client Protocol (ACP) -- Comprehensive Research Report

## Summary

The Agent Client Protocol (ACP) is an open standard co-developed by **Zed Industries** and **JetBrains** that standardizes communication between code editors (IDEs, text editors) and AI coding agents. Analogous to how the Language Server Protocol (LSP) standardized language tooling integration, ACP provides a universal interface so that any ACP-compatible agent can work with any ACP-compatible editor. The protocol uses **JSON-RPC 2.0 over stdio** (stdin/stdout) as its primary transport, with each message being a newline-delimited JSON object.

ACP is already supported by Zed, JetBrains IDEs (IntelliJ, PyCharm, WebStorm, etc.), and agents including Claude Code (via `claude-code-acp`), Codex CLI (via `codex-acp`), Goose, Kiro, OpenHands, Gemini CLI, and others. Official SDK libraries exist for TypeScript, Rust, Python, and Kotlin. The protocol specification lives at https://agentclientprotocol.com and the main GitHub repository is https://github.com/agentclientprotocol/agent-client-protocol.

The protocol covers the full lifecycle: initialization with capability negotiation, session creation/loading, prompt turns with streaming responses, tool call reporting with permission requests, file system access, terminal management, agent planning, session modes, config options, and slash commands.

---

## 1. Protocol Basics: JSON-RPC over stdio

### Transport

- **Primary transport**: stdio (stdin/stdout). The client spawns the agent as a subprocess.
- Messages are **newline-delimited JSON-RPC 2.0** objects.
- Each message MUST be a complete JSON-RPC object terminated by a single `\n` (newline).
- Messages MUST NOT contain embedded newlines.
- Messages MUST be UTF-8 encoded.
- The agent MUST NOT write anything to stdout except valid ACP messages.
- The client MUST NOT write anything to stdin except valid ACP messages.
- Agents MAY use stderr for logging.
- **Termination**: The client closes stdin and terminates the subprocess.

### Message Types

Two JSON-RPC 2.0 patterns:

1. **Methods** (request-response): Have an `id` field, expect a result or error.
2. **Notifications** (one-way): No `id` field, no response expected.

### JSON-RPC Message Format

**Request**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "method/name",
  "params": { ... }
}
```

**Response (success)**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { ... }
}
```

**Response (error)**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  }
}
```

**Notification** (no id):
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": { ... }
}
```

### Conventions

- All file paths MUST be absolute.
- All line numbers are 1-based.
- The `_meta` field (`{ [key: string]: unknown }`) is available on all types for extensibility.
- Custom methods MUST be prefixed with `_` (e.g., `_zed.dev/workspace/buffers`).

---

## 2. Connection Lifecycle: Initialize/Shutdown

### Complete Method Catalog

**Agent Methods** (Client -> Agent requests):
| Method | Description | Required |
|---|---|---|
| `initialize` | Version and capability negotiation | Yes |
| `authenticate` | Authentication when required | Optional |
| `session/new` | Create a new conversation session | Yes |
| `session/load` | Resume a previous session | Optional |
| `session/prompt` | Send user message, receive streaming response | Yes |
| `session/cancel` | Cancel an in-progress prompt turn (notification) | Yes |
| `session/set_mode` | Switch session operating mode | Optional |
| `session/set_config_option` | Modify session configuration | Optional |

**Client Methods** (Agent -> Client requests):
| Method | Description | Required |
|---|---|---|
| `session/request_permission` | Ask user for authorization | Recommended |
| `fs/read_text_file` | Read file from client filesystem | Optional |
| `fs/write_text_file` | Write file to client filesystem | Optional |
| `terminal/create` | Spawn a terminal command | Optional |
| `terminal/output` | Get terminal output | Optional |
| `terminal/wait_for_exit` | Block until terminal command completes | Optional |
| `terminal/kill` | Terminate a running command | Optional |
| `terminal/release` | Release terminal resources | Optional |

**Notifications** (no response):
| Notification | Direction | Description |
|---|---|---|
| `session/update` | Agent -> Client | Stream updates (messages, tool calls, plans) |
| `session/cancel` | Client -> Agent | Cancel current operation |

### Initialization Handshake

Before any session, the client MUST call `initialize`:

**Step 1: Client sends `initialize` request**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientInfo": {
      "name": "my-editor",
      "title": "My Editor",
      "version": "1.0.0"
    },
    "clientCapabilities": {
      "fileSystem": {
        "readTextFile": true,
        "writeTextFile": true
      },
      "terminal": true
    }
  }
}
```

**Step 2: Agent responds**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": 1,
    "agentInfo": {
      "name": "my-agent",
      "title": "My Agent",
      "version": "2.0.0"
    },
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": {
        "image": true,
        "audio": false,
        "embeddedContext": true
      },
      "mcpCapabilities": {
        "http": true,
        "sse": false
      }
    },
    "authMethods": []
  }
}
```

**Rules**:
- `protocolVersion` is a single integer (MAJOR version only).
- Clients and Agents MUST treat all capabilities omitted in `initialize` as UNSUPPORTED.
- If the agent requires authentication, `authMethods` will be populated and the client must call `authenticate` before creating sessions.

### Shutdown

There is no explicit shutdown handshake. The client closes stdin and terminates the subprocess.

---

## 3. Session Management

### Creating a Session: `session/new`

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "session/new",
  "params": {
    "cwd": "/home/user/project",
    "mcpServers": [
      {
        "name": "filesystem",
        "transport": {
          "type": "stdio",
          "command": "mcp-filesystem",
          "args": ["--root", "/home/user/project"],
          "env": {}
        }
      }
    ]
  }
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "sessionId": "sess_abc123def456"
  }
}
```

The `sessionId` is used in all subsequent requests for this conversation.

### Loading (Resuming) a Session: `session/load`

Requires `loadSession` capability. Same parameters as `session/new` plus the `sessionId`:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "session/load",
  "params": {
    "sessionId": "sess_abc123def456",
    "cwd": "/home/user/project",
    "mcpServers": []
  }
}
```

During loading, the agent replays conversation history via `session/update` notifications before sending the response. This allows the client to reconstruct the conversation state.

### Session Capabilities

Advertised during initialization in `agentCapabilities`:

```typescript
interface AgentCapabilities {
  loadSession?: boolean;           // Can sessions be resumed?
  promptCapabilities?: {
    image?: boolean;               // Accept image content blocks?
    audio?: boolean;               // Accept audio content blocks?
    embeddedContext?: boolean;      // Accept embedded resource blocks?
  };
  mcpCapabilities?: {
    http?: boolean;                // HTTP MCP transport?
    sse?: boolean;                 // SSE MCP transport? (deprecated)
  };
}
```

### Session Modes

Agents can define operating modes (e.g., "ask", "code", "architect"):

```json
{
  "currentModeId": "code",
  "availableModes": [
    { "id": "ask", "name": "Ask", "description": "Request permission before making any changes" },
    { "id": "code", "name": "Code", "description": "Write and modify code with full tool access" },
    { "id": "architect", "name": "Architect", "description": "Design and plan without implementation" }
  ]
}
```

**Client switches mode**: `session/set_mode` with `{ sessionId, modeId }`.
**Agent switches mode**: `session/update` notification with `current_mode_update` containing the new `modeId`.

### Session Config Options

Agents expose configuration selectors (model, mode, reasoning level) via `session/update` notifications with `config_options_update`:

```json
{
  "id": "model",
  "name": "Model",
  "category": "model",
  "type": "select",
  "currentValue": "claude-4-sonnet",
  "options": [
    { "value": "claude-4-sonnet", "name": "Claude 4 Sonnet" },
    { "value": "claude-4-opus", "name": "Claude 4 Opus" }
  ]
}
```

Standard categories: `mode`, `model`, `thought_level`.

Client changes config: `session/set_config_option` with `{ sessionId, configId, value }`.

---

## 4. Message Flow: Prompt Turn

A prompt turn is the complete cycle from user message to agent completion.

### Step 1: Client sends `session/prompt`

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "session/prompt",
  "params": {
    "sessionId": "sess_abc123def456",
    "prompt": [
      {
        "type": "text",
        "text": "Refactor the authentication module to use JWT tokens"
      }
    ]
  }
}
```

The `prompt` field is an array of `ContentBlock` objects (can include text, images, resources, resource links).

### Step 2: Agent streams `session/update` notifications

The agent sends a series of notifications as it processes:

**Agent text response (streamed in chunks)**:
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "type": "agent_message_chunk",
      "content": [
        { "type": "text", "text": "I'll refactor the auth module. Let me start by..." }
      ]
    }
  }
}
```

**Agent thinking/reasoning**:
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "type": "agent_thought_chunk",
      "content": [
        { "type": "text", "text": "I need to review the current auth implementation first..." }
      ]
    }
  }
}
```

**Tool call initiated**:
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "type": "tool_call",
      "toolCallId": "tc_001",
      "title": "Reading src/auth/module.ts",
      "kind": "read",
      "status": "in_progress"
    }
  }
}
```

**Tool call completed with results**:
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "type": "tool_call_update",
      "toolCallId": "tc_001",
      "status": "completed",
      "content": [
        { "type": "text", "text": "File read successfully (245 lines)" }
      ],
      "locations": [
        { "path": "/home/user/project/src/auth/module.ts", "line": 1 }
      ]
    }
  }
}
```

**Plan update**:
```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "type": "plan",
      "entries": [
        { "content": "Read current auth module", "priority": "high", "status": "completed" },
        { "content": "Replace session-based auth with JWT", "priority": "high", "status": "in_progress" },
        { "content": "Update tests", "priority": "medium", "status": "pending" }
      ]
    }
  }
}
```

### Step 3: Agent completes with `session/prompt` response

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": {
    "stopReason": "end_turn"
  }
}
```

**Stop reasons**: `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`.

### Cancellation

Client sends a notification (no id, no response):
```json
{
  "jsonrpc": "2.0",
  "method": "session/cancel",
  "params": {
    "sessionId": "sess_abc123def456"
  }
}
```

The agent MUST catch the cancellation and return the `session/prompt` response with `stopReason: "cancelled"`.

---

## 5. `session/update` Notification Types (Complete List)

All streamed via `session/update` notifications. The `update` field discriminates on `type`:

| Update Type | Description |
|---|---|
| `agent_message_chunk` | Streamed text content from the LLM |
| `agent_thought_chunk` | Thinking/reasoning content (chain-of-thought) |
| `user_message_chunk` | Echo of user message (used during session replay) |
| `tool_call` | New tool invocation initiated |
| `tool_call_update` | Status/content update for an existing tool call |
| `plan` | Agent's execution plan with tasks and priorities |
| `available_commands_update` | Slash command availability changed |
| `config_options_update` | Session config options changed |
| `current_mode_update` | Active session mode changed |

---

## 6. Tool Calls

### Tool Call Creation

Sent as `session/update` with `type: "tool_call"`:

```json
{
  "type": "tool_call",
  "toolCallId": "tc_001",
  "title": "Running tests",
  "kind": "execute",
  "status": "pending",
  "content": [],
  "locations": [],
  "rawInput": "{\"command\": \"npm test\"}"
}
```

### Tool Call Fields

| Field | Required | Description |
|---|---|---|
| `toolCallId` | Yes | Unique identifier within session |
| `title` | Yes | Human-readable description |
| `kind` | No | Category for UI display |
| `status` | No | Execution state |
| `content` | No | Output content blocks |
| `locations` | No | Affected file paths |
| `rawInput` | No | Raw tool input parameters (JSON string) |
| `rawOutput` | No | Raw tool output (JSON string) |

### Tool Kinds

| Kind | Description |
|---|---|
| `read` | File/data access |
| `edit` | File modification |
| `delete` | File/resource removal |
| `move` | Rename/relocate |
| `search` | Information discovery |
| `execute` | Run commands/code |
| `think` | Reasoning/planning (no side effects) |
| `fetch` | External data retrieval |
| `other` | Default/uncategorized |

### Tool Call Status Lifecycle

```
pending  ->  in_progress  ->  completed
                           ->  failed
```

- **pending**: Input streaming or awaiting permission approval
- **in_progress**: Currently executing
- **completed**: Successful execution
- **failed**: Error occurred

### Tool Call Update

Only modified fields need inclusion:

```json
{
  "type": "tool_call_update",
  "toolCallId": "tc_001",
  "status": "completed",
  "content": [
    { "type": "text", "text": "All 42 tests passed" }
  ]
}
```

### Tool Call Content Types

Content can include:
- Standard `ContentBlock` types (text, image, resource)
- **Diffs**: `{ "type": "diff", "path": "/absolute/path", "oldText": "...", "newText": "..." }`
- **Terminal references**: `{ "type": "terminal", "terminalId": "term_001" }`

### Location Tracking

```json
{
  "locations": [
    { "path": "/home/user/project/src/auth.ts", "line": 42 }
  ]
}
```

Used by clients for "follow-along" features that show the agent's activity in the editor.

---

## 7. Permission Requests

### Flow

When the agent needs authorization (e.g., before writing files or running commands), it sends a request to the client:

**Agent -> Client request**:
```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "method": "session/request_permission",
  "params": {
    "sessionId": "sess_abc123def456",
    "options": [
      {
        "optionId": "opt_allow_once",
        "name": "Allow Once",
        "kind": "allow_once"
      },
      {
        "optionId": "opt_allow_always",
        "name": "Allow Always",
        "kind": "allow_always"
      },
      {
        "optionId": "opt_reject",
        "name": "Reject",
        "kind": "reject_once"
      }
    ]
  }
}
```

**Client -> Agent response**:
```json
{
  "jsonrpc": "2.0",
  "id": 100,
  "result": {
    "outcome": "selected",
    "optionId": "opt_allow_once"
  }
}
```

**Permission Option Kinds**: `allow_once`, `allow_always`, `reject_once`, `reject_always`.
**Outcome types**: `selected` (with `optionId`) or `cancelled`.

---

## 8. Thinking/Reasoning Blocks

### How They Appear

Thinking/reasoning content is streamed via `session/update` with `type: "agent_thought_chunk"`:

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123def456",
    "update": {
      "type": "agent_thought_chunk",
      "content": [
        { "type": "text", "text": "Let me analyze the code structure..." }
      ]
    }
  }
}
```

### In claude-code-acp

The adapter converts Claude SDK's `thinking` and `thinking_delta` content blocks to ACP's `agent_thought_chunk` update type. The `toAcpNotifications()` function handles this mapping. Additionally, the `think` tool kind is used when Claude invokes the "Task" tool for analytical reasoning.

---

## 9. Content Blocks

Content blocks are shared between MCP and ACP (same structure). They appear in prompts, agent messages, and tool call outputs.

### Text Content (required support)
```json
{ "type": "text", "text": "Hello world", "annotations": {} }
```

### Image Content (requires `image` capability)
```json
{ "type": "image", "mimeType": "image/png", "data": "<base64>", "uri": "optional" }
```

### Audio Content (requires `audio` capability)
```json
{ "type": "audio", "mimeType": "audio/wav", "data": "<base64>" }
```

### Embedded Resource (requires `embeddedContext` capability)
```json
{
  "type": "resource",
  "resource": {
    "uri": "file:///path/to/file.ts",
    "mimeType": "text/typescript",
    "text": "const x = 42;"
  }
}
```

### Resource Link
```json
{
  "type": "resource_link",
  "uri": "file:///path/to/file.ts",
  "name": "file.ts",
  "mimeType": "text/typescript",
  "title": "Main TypeScript file",
  "description": "Entry point",
  "size": 1024
}
```

---

## 10. File System Methods

### `fs/read_text_file` (Agent -> Client)

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "fs/read_text_file",
  "params": {
    "sessionId": "sess_abc123def456",
    "path": "/home/user/project/src/main.py",
    "line": 10,
    "limit": 50
  }
}
```

Response: `{ "content": "file contents..." }`

### `fs/write_text_file` (Agent -> Client)

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "fs/write_text_file",
  "params": {
    "sessionId": "sess_abc123def456",
    "path": "/home/user/project/config.json",
    "content": "{\"key\": \"value\"}"
  }
}
```

Response: `null` on success.

---

## 11. Terminal Methods

### `terminal/create` (Agent -> Client)

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "terminal/create",
  "params": {
    "sessionId": "sess_abc123def456",
    "command": "npm",
    "args": ["test"],
    "env": { "NODE_ENV": "test" },
    "cwd": "/home/user/project",
    "outputByteLimit": 1048576
  }
}
```

Response: `{ "terminalId": "term_001" }` (returns immediately, does not wait for command completion).

### `terminal/output` (Agent -> Client)
Params: `{ sessionId, terminalId }`
Response: `{ "output": "...", "truncated": false, "exitStatus": { "exitCode": 0, "signal": null } }`

### `terminal/wait_for_exit` (Agent -> Client)
Params: `{ sessionId, terminalId }`
Response: `{ "exitCode": 0, "signal": null }` (blocks until completion)

### `terminal/kill` (Agent -> Client)
Params: `{ sessionId, terminalId }`
Kills the command but terminal remains valid for `output` and `wait_for_exit`.

### `terminal/release` (Agent -> Client)
Params: `{ sessionId, terminalId }`
Kills command if running and releases all resources. Terminal ID is invalidated.

---

## 12. Slash Commands

Agents advertise available commands via `session/update` with `available_commands_update`:

```json
{
  "type": "available_commands_update",
  "commands": [
    {
      "name": "web",
      "description": "Search the web",
      "input": { "type": "unstructured", "hint": "Search query" }
    },
    {
      "name": "test",
      "description": "Run project tests"
    }
  ]
}
```

Commands are sent as regular text in `session/prompt` (e.g., the user types `/web agent client protocol`). The agent recognizes the slash prefix and processes accordingly.

---

## 13. claude-code-acp: The ACP Adapter for Claude Code

### Overview

`@zed-industries/claude-code-acp` is an official ACP adapter that bridges Anthropic's Claude Code (via the Claude Agent SDK) to any ACP-compatible client.

- **npm package**: `@zed-industries/claude-code-acp`
- **Repository**: https://github.com/zed-industries/claude-code-acp
- **License**: Apache-2.0
- **Language**: TypeScript (99.1%)
- **Stars**: ~887 | **Versions**: 67 (latest v0.15.0, Feb 2026)

### Installation

```bash
npm install -g @zed-industries/claude-code-acp
```

### CLI Launch Command

```bash
ANTHROPIC_API_KEY=sk-ant-... claude-code-acp
```

The adapter runs as a persistent process, communicating over stdin/stdout with newline-delimited JSON-RPC.

### Key Dependencies

- `@anthropic-ai/claude-code` (^1.0.100) -- Claude Agent SDK
- `@zed-industries/agent-client-protocol` (0.2.0-alpha.6) -- ACP SDK
- `@modelcontextprotocol/sdk` (^1.17.4) -- MCP SDK

### Architecture (Three-Layer Stack)

1. **ACP Layer**: Client communication interface (stdin/stdout JSON-RPC)
2. **MCP Layer**: Tool execution framework (Read, Write, Edit, Bash, etc.)
3. **Claude SDK Layer**: AI interaction and session management

### Core Component: `ClaudeAcpAgent`

Orchestrates everything:
1. On `session/new`: Generates a UUID v7 session ID, creates a `Pushable` input stream, instantiates an MCP server with tools based on client capabilities, configures a `Query` instance
2. On `session/prompt`: Converts ACP prompt to Claude SDK format via `promptToClaude()`, pushes into Query input stream, iterates stream events, converts back to ACP notifications via `streamEventToAcpNotifications()` and `toAcpNotifications()`

### Event Mapping

| Claude SDK Event | ACP Update Type |
|---|---|
| `content_block_start` (text) | `agent_message_chunk` |
| `content_block_delta` (text_delta) | `agent_message_chunk` |
| `content_block_start` (thinking) | `agent_thought_chunk` |
| `content_block_delta` (thinking_delta) | `agent_thought_chunk` |
| Tool use (file read) | `tool_call` with `kind: "read"` |
| Tool use (file write/edit) | `tool_call` with `kind: "edit"` |
| Tool use (bash/terminal) | `tool_call` with `kind: "execute"` |
| Tool use (Task/think) | `tool_call` with `kind: "think"` |

### Tool Registration (Conditional)

Tools registered based on client capabilities:
- `Read` -- always
- `Write` -- if `fs/write_text_file` supported
- `Edit` -- if `fs/write_text_file` supported
- `Bash` -- if `terminal` supported
- `BashOutput` -- if `terminal` supported
- `KillShell` -- if `terminal` supported

### Permission Modes

- **default**: Prompts user for each tool call
- **acceptEdits**: Auto-approves edit/write tools
- **bypassPermissions**: Auto-approves all (disabled for root users)
- **plan**: Analysis-only, denies execution tools

### Caching

- `toolUseCache`: Maps tool IDs to original tool parameters
- `fileContentCache`: Stores file contents for accurate diff generation
- `backgroundTerminals`: Tracks long-running terminal processes

### Client Configuration (Zed)

In Zed, Claude Code appears as a built-in agent option. Users select "New Claude Code Thread" from the Agent Panel. The adapter is configured in Zed's agent settings.

### Other Client Configuration (Generic)

For any ACP client, configure as an external agent:
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

---

## 14. Codex ACP: The ACP Adapter for OpenAI Codex CLI

### Overview

`codex-acp` bridges the OpenAI Codex runtime with ACP clients over stdio.

- **Repository**: https://github.com/cola-io/codex-acp
- **Language**: Rust (2024 edition, rustc 1.91+)
- **License**: Apache-2.0
- **Stars**: ~113

### Build & Launch

```bash
make release
# Binary at: target/release/codex-acp
```

### Zed Configuration

```json
{
  "agent_servers": {
    "Codex": {
      "command": "/path/to/codex-acp",
      "args": [],
      "env": { "RUST_LOG": "info" }
    }
  }
}
```

### Architecture

- `agent/core.rs` -- Handles ACP requests (initialize, authenticate, session management, prompts)
- `agent/session_manager.rs` -- Session state, client notifications
- `agent/events.rs` -- Converts Codex events to ACP updates
- `fs/` -- Filesystem bridge with internal MCP server

### Features

- Three session modes: read-only, auto (default), full-access
- Dynamic model switching (`{provider}@{model}` format)
- Token usage tracking and conversation caching
- Slash commands: `/init`, `/status`, `/compact`, `/review`
- Internal MCP filesystem server for file operations
- Authentication: OpenAI ChatGPT login or API key; supports Anthropic, OpenRouter via custom provider format

---

## 15. Extensibility

### Custom Methods

Method names prefixed with `_` are reserved for extensions:
- Custom requests: `_zed.dev/workspace/buffers` (must include `id`, expects response)
- Custom notifications: `_zed.dev/file_opened` (no `id`, one-way)
- Unrecognized custom requests: respond with error code `-32601` (Method not found)
- Unrecognized custom notifications: SHOULD be silently ignored

### The `_meta` Field

Available on all types. Reserved root keys for W3C trace context:
- `traceparent`
- `tracestate`
- `baggage`

Custom data goes in `_meta`:
```json
{
  "type": "text",
  "text": "Hello",
  "_meta": {
    "myCustomField": "value"
  }
}
```

### Custom Capabilities

Extensions advertise support via `_meta` within capability objects during initialization.

---

## 16. MCP Integration

ACP agents can connect to MCP (Model Context Protocol) servers configured by the client:

### MCP Server Transport Types

**Stdio** (required support):
```json
{
  "name": "my-mcp-server",
  "transport": {
    "type": "stdio",
    "command": "mcp-server-binary",
    "args": ["--flag"],
    "env": { "KEY": "value" }
  }
}
```

**HTTP** (optional, requires `mcpCapabilities.http`):
```json
{
  "name": "remote-mcp",
  "transport": {
    "type": "http",
    "url": "https://mcp.example.com/api",
    "headers": [{ "name": "Authorization", "value": "Bearer ..." }]
  }
}
```

**SSE** (optional, deprecated):
```json
{
  "name": "sse-mcp",
  "transport": {
    "type": "sse",
    "url": "https://mcp.example.com/events"
  }
}
```

When the editor itself provides MCP tools, it deploys a small proxy that tunnels agent requests back through the stdin/stdout channel.

---

## 17. Complete Message Flow Example

Here is a full conversation lifecycle:

```
CLIENT                                           AGENT
  |                                                |
  |-- initialize --------------------------------->|
  |<-------------- initialize response ------------|
  |                                                |
  |-- session/new -------------------------------->|
  |<-------------- session/new response -----------|
  |                                                |
  |-- session/prompt ----------------------------->|
  |                                                |
  |<-- session/update (agent_thought_chunk) -------|  (thinking)
  |<-- session/update (agent_message_chunk) -------|  (streaming text)
  |<-- session/update (tool_call, pending) --------|  (wants to read file)
  |                                                |
  |<-- session/request_permission -----------------|  (asks permission)
  |-- permission response (allow_once) ----------->|
  |                                                |
  |<-- session/update (tool_call_update, in_progress) |
  |<-- fs/read_text_file --------------------------|  (reads file via client)
  |-- fs/read_text_file response ----------------->|
  |<-- session/update (tool_call_update, completed)-|
  |                                                |
  |<-- session/update (agent_message_chunk) -------|  (more text)
  |<-- session/update (tool_call, edit) -----------|  (writes file)
  |<-- fs/write_text_file -------------------------|
  |-- fs/write_text_file response ---------------->|
  |<-- session/update (tool_call_update, completed)-|
  |                                                |
  |<-------------- session/prompt response --------|  (stopReason: "end_turn")
  |                                                |
  [close stdin, terminate subprocess]
```

---

## 18. SDK Libraries

| Language | Package | Repository |
|---|---|---|
| TypeScript | `@agentclientprotocol/sdk` | https://github.com/agentclientprotocol/typescript-sdk |
| Rust | `agent-client-protocol` (crates.io) | https://github.com/agentclientprotocol/agent-client-protocol |
| Python | `agentclientprotocol` | https://github.com/agentclientprotocol/python-sdk |
| Kotlin | `acp-kotlin` | https://github.com/agentclientprotocol/acp-kotlin |

TypeScript SDK key entry points:
- `AgentSideConnection` -- for building agents
- `ClientSideConnection` -- for building clients

---

## 19. Error Codes

Standard JSON-RPC 2.0 error codes plus ACP-specific codes in the range `-32000` to `-32099`:

| Code | Meaning |
|---|---|
| `-32700` | Parse error |
| `-32600` | Invalid request |
| `-32601` | Method not found |
| `-32602` | Invalid params |
| `-32603` | Internal error |
| `-32000` to `-32099` | ACP-specific errors (e.g., `auth_required`) |

---

## Sources

- [ACP Official Specification](https://agentclientprotocol.com) -- Primary protocol documentation, highly authoritative
- [ACP GitHub Repository](https://github.com/agentclientprotocol/agent-client-protocol) -- Official spec repo (1.8k stars, Apache-2.0)
- [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk) -- Official TS implementation
- [ACP Rust Schema Crate](https://docs.rs/agent-client-protocol-schema) -- Authoritative type definitions
- [claude-code-acp](https://github.com/zed-industries/claude-code-acp) -- Official Zed Industries adapter (887 stars)
- [claude-code-acp npm](https://www.npmjs.com/package/@zed-industries/claude-code-acp) -- npm package (v0.15.0)
- [codex-acp](https://github.com/cola-io/codex-acp) -- Community Codex ACP adapter (113 stars)
- [JetBrains ACP Announcement](https://blog.jetbrains.com/ai/2025/10/jetbrains-zed-open-interoperability-for-ai-coding-agents-in-your-ide/) -- Oct 2025
- [Zed ACP Page](https://zed.dev/acp) -- Zed's ACP landing page
- [Zed + JetBrains Blog](https://zed.dev/blog/jetbrains-on-acp) -- Partnership announcement
- [ACP Registry Announcement](https://zed.dev/blog/acp-registry) -- Jan 2026
- [DeepWiki: claude-code-acp Architecture](https://deepwiki.com/zed-industries/claude-code-acp/2-installation-and-usage) -- Detailed architecture analysis
- [DeepWiki: ACP Python SDK Overview](https://deepwiki.com/agentclientprotocol/python-sdk/4.1-agent-client-protocol-overview) -- Protocol type details
- [Kiro CLI ACP Docs](https://kiro.dev/docs/cli/acp/) -- Kiro's ACP implementation docs
- [Goose ACP Blog Post](https://block.github.io/goose/blog/2025/10/24/intro-to-agent-client-protocol-acp/) -- Oct 2025

## Confidence Assessment

- **Overall confidence**: HIGH -- The ACP specification is well-documented with an official website, multiple SDK implementations, and active development from major organizations (Zed, JetBrains).
- **Protocol surface**: HIGH confidence on method names, message structures, and lifecycle. The official docs at agentclientprotocol.com are comprehensive.
- **claude-code-acp internals**: HIGH confidence. The npm package, GitHub repo, and DeepWiki analysis provide thorough coverage.
- **codex-acp**: MEDIUM confidence. Community-maintained, less documentation, but the README is detailed.
- **Thinking/reasoning blocks**: MEDIUM-HIGH confidence. The `agent_thought_chunk` update type is documented and confirmed by claude-code-acp source analysis, but the official ACP spec website does not prominently document it (it may be a newer addition).
- **Areas of uncertainty**: The exact JSON schema version number (the protocol uses integer MAJOR versioning, currently at 1 or possibly higher). Some session notification type names may vary slightly between the official spec and SDK implementations (e.g., `tool_call` vs `ToolCallStart` naming in different SDKs -- the canonical wire format uses snake_case).
