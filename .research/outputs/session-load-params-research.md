# ACP `session/load` Parameters Research

## Summary

Our `session/load` call is **missing the required `mcpServers` field**. The ACP spec and all SDK implementations (TypeScript, Go, Rust) define `LoadSessionRequest` with three required fields: `sessionId`, `cwd`, and `mcpServers`. Our code currently sends only `{ sessionId, cwd }`. The `mcpServers` field is required even if empty -- it must be present as an array (can be `[]`). This is the most likely cause of the "Could not load session" errors.

Additionally, the session file path format used by `claude-code-acp` reveals that the `sessionId` must match the UUID portion of a `session-{uuid}.jsonl` file stored in `~/.claude/projects/{encoded-cwd}/`. If the `cwd` parameter does not match the original session's working directory, the adapter will not find the session file on disk.

---

## 1. ACP Spec: `LoadSessionRequest` Definition

**Source**: https://agentclientprotocol.com/protocol/session-setup and https://agentclientprotocol.com/protocol/schema

### Required Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | `SessionId` (string) | **Yes** | The ID of the session to load |
| `cwd` | `string` | **Yes** | The working directory for this session (must be an absolute path) |
| `mcpServers` | `McpServer[]` | **Yes** | List of MCP servers to connect to for this session |

### Optional Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_meta` | `object \| null` | No | Extension metadata. Implementations MUST NOT make assumptions about values at these keys. |

### Full JSON-RPC Request Example (from spec)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/load",
  "params": {
    "sessionId": "sess_789xyz",
    "cwd": "/home/user/project",
    "mcpServers": [
      {
        "name": "filesystem",
        "command": "/path/to/mcp-server",
        "args": ["--mode", "filesystem"],
        "env": []
      }
    ]
  }
}
```

### Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": null
}
```

Before the response, the agent streams `session/update` notifications containing the conversation history replay. Once all entries are streamed, the agent sends the final response with `"result": null`.

### Comparison: `NewSessionRequest`

For reference, `NewSessionRequest` also requires `mcpServers`:

| Field | Type | Required |
|-------|------|----------|
| `cwd` | `string` | **Yes** |
| `mcpServers` | `McpServer[]` | **Yes** |
| `_meta` | `object \| null` | No |

Our `sessionNew` method already correctly sends `mcpServers: []` (line 78 of `acp-client.ts`), but `sessionLoad` does not.

---

## 2. Go SDK Confirmation

**Source**: https://pkg.go.dev/github.com/joshgarnett/agent-client-protocol-go/acp/api

```go
type LoadSessionRequest struct {
    Cwd        string    `json:"cwd" yaml:"cwd"`
    McpServers []McpServer `json:"mcpServers" yaml:"mcpServers"`
    SessionId  SessionId `json:"sessionId" yaml:"sessionId"`
}
```

All three fields are required (Go structs do not have optional fields -- they are always serialized). This confirms the TypeScript SDK definition.

---

## 3. TypeScript SDK Type Definition

**Source**: `@agentclientprotocol/sdk` v0.14.1 (used by claude-code-acp v0.16.0)

Based on the TypeScript SDK reference at https://agentclientprotocol.github.io/typescript-sdk/:

```typescript
type LoadSessionRequest = {
  _meta?: Record<string, unknown>;  // optional
  cwd: string;                       // required
  mcpServers: McpServer[];           // required
  sessionId: SessionId;              // required
}
```

The `SessionId` is a type alias for `string`.

---

## 4. `claude-code-acp` Source: How `loadSession` Works

**Source**: https://github.com/zed-industries/claude-code-acp (`acp-agent.ts`)

### Implementation Flow

1. **Capability advertisement**: In `initialize()`, the agent returns `agentCapabilities: { loadSession: true }` -- this signals that the agent supports `session/load`.

2. **Session file path construction**: The adapter locates the session file at:
   ```
   ~/.claude/projects/{encoded-project-path}/session-{sessionId}.jsonl
   ```

3. **Path encoding** (`encodeProjectPath`):
   - Unix/macOS: Forward slashes become hyphens. `/Users/leemoore/code/liminal-builder` becomes `-Users-leemoore-code-liminal-builder`
   - Windows: Backslashes and colons become hyphens. `C:\Users\user\project` becomes `C-Users-user-project`

4. **File existence check**: The adapter calls `fs.promises.access(sessionFilePath(params.cwd, params.sessionId))` to verify the file exists. If the file is not found, it throws `"Session not found"` (or `"Could not load session"`).

5. **Resume via SDK**: After validation, it creates a session with `createSession({ resume: params.sessionId })` which tells the Claude Agent SDK to resume the conversation.

6. **History replay**: It reads the `.jsonl` file line-by-line and sends each entry as `session/update` notifications back to the client, reconstructing the conversation history.

7. **Response**: Returns `LoadSessionResponse` with available modes and models.

### Key Insight: `cwd` MUST Match Original Session Path

The `cwd` parameter is used to construct the file path. If you pass a different `cwd` than what was used when the session was created, the adapter will look in the wrong directory and fail to find the session file.

For example:
- Session created with `cwd: "/Users/leemoore/code/liminal-builder"` stores at: `~/.claude/projects/-Users-leemoore-code-liminal-builder/session-abc123.jsonl`
- If you later call `session/load` with `cwd: "."` (relative path), the adapter will look in: `~/.claude/projects/---/session-abc123.jsonl` -- **not found**

---

## 5. Session ID Format

The session ID used by Claude Code is a **UUID** (e.g., `abc123de-f456-7890-abcd-ef1234567890`). The session files are stored as:

```
~/.claude/projects/{encoded-cwd}/session-{uuid}.jsonl
```

The `sessionId` in the `session/load` request must be the exact UUID portion. It is the same UUID that Claude Code CLI uses internally. The adapter generates these UUIDs when creating new sessions via `session/new`.

### Where Sessions Live on Disk

```
~/.claude/
  projects/
    -Users-leemoore-code-liminal-builder/
      session-abc123de-f456-7890-abcd-ef1234567890.jsonl
      session-deadbeef-1234-5678-9abc-def012345678.jsonl
```

Each `.jsonl` file contains one JSON object per line representing conversation turns (user messages, assistant messages, tool calls, etc.).

---

## 6. Our Bug: Missing `mcpServers` in `session/load`

### Current Code (acp-client.ts, line 100)

```typescript
await this.sendRequest("session/load", { sessionId, cwd });
```

### What the Spec Requires

```typescript
await this.sendRequest("session/load", { sessionId, cwd, mcpServers: [] });
```

### The Fix

Add `mcpServers: []` to the `session/load` params, matching what we already do for `session/new` (line 76-79):

```typescript
// session/new already sends mcpServers correctly:
async sessionNew(params: { cwd: string }): Promise<AcpCreateResult> {
    return this.sendRequest<AcpCreateResult>("session/new", {
        cwd: params.cwd,
        mcpServers: [],  // <-- present
    });
}

// session/load is MISSING it:
async sessionLoad(sessionId: string, cwd: string): Promise<ChatEntry[]> {
    // ...
    await this.sendRequest("session/load", { sessionId, cwd });
    //                                       ^ missing mcpServers!
}
```

### Other Potential Issues

1. **Relative `cwd`**: If `cwd` is passed as a relative path (e.g., `.` or `./project`), the adapter's `encodeProjectPath` will produce an incorrect directory name. The `cwd` MUST be an absolute path.

2. **Session not yet on disk**: If we call `session/load` immediately after `session/new` without any prompts having been sent, there may not be a `.jsonl` file on disk yet. The Claude Agent SDK writes the session file after the first prompt exchange.

3. **`loadSession` capability not checked**: Before calling `session/load`, we should verify the agent advertised `loadSession: true` in its capabilities during initialization. Our code does check `canLoadSession` before calling, which is correct.

---

## 7. Additional Findings: PR #169 "Adding load session"

**Source**: https://github.com/zed-industries/claude-code-acp/pull/169

There is an open PR (#169) titled "Adding load session" by Eduard-Voiculescu (opened Nov 19, 2025). This suggests that `session/load` support may have been added relatively recently or is still being refined in `claude-code-acp`. The current `main` branch does appear to include the implementation based on what we can see in the source.

---

## 8. Resuming Sessions RFD Status

**Source**: https://agentclientprotocol.com/rfds/

The "Resuming of existing sessions" RFD is listed under **Draft** status, alongside related RFDs for "Session List" and "Forking of existing sessions". This means the session loading behavior is still evolving. However, the current stable spec (v0.14.x) does include `session/load` as a supported method with the schema described above.

---

## Sources

| Source | Credibility | Date |
|--------|-------------|------|
| [ACP Session Setup](https://agentclientprotocol.com/protocol/session-setup) | Official spec, highly authoritative | Current |
| [ACP Schema](https://agentclientprotocol.com/protocol/schema) | Official spec, highly authoritative | Current |
| [Go ACP SDK Types](https://pkg.go.dev/github.com/joshgarnett/agent-client-protocol-go/acp/api) | SDK implementation, authoritative | Current |
| [TypeScript SDK Reference](https://agentclientprotocol.github.io/typescript-sdk/) | Official SDK docs, authoritative | v0.14.1 |
| [claude-code-acp source](https://github.com/zed-industries/claude-code-acp/blob/main/src/acp-agent.ts) | Production implementation, authoritative | v0.16.0 |
| [DeepWiki: Session Lifecycle](https://deepwiki.com/zed-industries/claude-code-acp/3.3-session-lifecycle-management) | AI-generated wiki from source, moderate | Feb 2026 |
| [Anthropic SDK Session Management](https://docs.anthropic.com/en/docs/claude-code/sdk/sdk-sessions) | Official Anthropic docs | Current |

## Confidence Assessment

- **Overall confidence**: **High** -- The missing `mcpServers` field is confirmed across multiple authoritative sources (ACP spec, TypeScript SDK types, Go SDK types, and the claude-code-acp source).
- **Primary fix**: Add `mcpServers: []` to the `session/load` request params. This is almost certainly the cause of the error.
- **Secondary risk**: Ensure `cwd` is always an absolute path matching what was used during `session/new`.
- **Uncertainty**: The "Resuming of existing sessions" RFD is still in Draft status, so the exact behavior may evolve. However, the current stable implementation is well-documented and functional.
