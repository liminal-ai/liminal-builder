# Prompt 2a.2: Green (ACP Client Implementation)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs (Claude Code, Codex). The server bridges browser WebSocket connections to CLI agent processes via the ACP (Agent Client Protocol), which uses JSON-RPC 2.0 over stdio (newline-delimited JSON messages on stdin/stdout of a child process).

Story 2a implements the `AcpClient` class -- the JSON-RPC 2.0 protocol layer. In the previous prompt (2a.1), 9 tests were written and are currently failing. This prompt implements the full `AcpClient` class to make all 9 tests pass.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/acp/acp-client.ts` -- class skeleton with stubs (from prompt 2a.1)
- `tests/server/acp-client.test.ts` -- 9 failing tests (from prompt 2a.1)
- `tests/fixtures/acp-messages.ts` -- mock stdio helpers (from prompt 2a.1)
- `server/acp/acp-types.ts` -- protocol types (from Story 0)
- `shared/types.ts` -- ChatEntry type (from Story 0)
- Story 1 is optional for Story 2a execution. Baseline may be Story 0 only, or Story 0 + 1 if Story 1 is already complete.

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (ACP Protocol Surface, AcpClient interface, Flow 5)
- Feature Spec: `docs/feature-spec-mvp.md` (Flow 5: Agent Connection Lifecycle)

## Task

### Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `server/acp/acp-client.ts` | **Implement** | Replace all stubs with full implementation |

No other files should be modified.

### Full Type Definitions (for reference)

```typescript
// server/acp/acp-types.ts (DO NOT MODIFY -- import from here)

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface AcpCreateResult {
  sessionId: string;
}

export interface AcpInitializeParams {
  protocolVersion: 1;
  clientInfo: { name: string; title: string; version: string };
  clientCapabilities: {
    fileSystem?: { readTextFile?: boolean; writeTextFile?: boolean };
    terminal?: boolean;
  };
}

export interface AcpInitializeResult {
  protocolVersion: number;
  agentInfo: { name: string; title: string; version: string };
  agentCapabilities: {
    loadSession?: boolean;
    promptCapabilities?: { image?: boolean; embeddedContext?: boolean };
  };
}

export interface AcpPromptResult {
  stopReason: 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';
}

export interface AcpContentBlock {
  type: 'text';
  text: string;
}

export type AcpUpdateEvent =
  | { type: 'agent_message_chunk'; content: AcpContentBlock[] }
  | { type: 'agent_thought_chunk'; content: AcpContentBlock[] }
  | { type: 'user_message_chunk'; content: AcpContentBlock[] }
  | { type: 'tool_call'; toolCallId: string; title: string; kind?: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      content?: AcpContentBlock[]; locations?: Array<{ path: string; line?: number }> }
  | { type: 'tool_call_update'; toolCallId: string;
      status?: 'pending' | 'in_progress' | 'completed' | 'failed';
      content?: AcpContentBlock[]; locations?: Array<{ path: string; line?: number }> }
  | { type: 'plan'; entries: Array<{ content: string; priority: string; status: string }> }
  | { type: 'config_options_update'; options: unknown[] }
  | { type: 'current_mode_update'; currentModeId: string }

export interface AcpPermissionRequest {
  toolCallId: string;
  title: string;
  description?: string;
}
```

```typescript
// shared/types.ts (DO NOT MODIFY -- import ChatEntry from here)

type ChatEntry =
  | { entryId: string; type: 'user'; content: string; timestamp: string }
  | { entryId: string; type: 'assistant'; content: string; timestamp: string }
  | { entryId: string; type: 'thinking'; content: string }
  | { entryId: string; type: 'tool-call'; toolCallId: string; name: string;
      status: 'running' | 'complete' | 'error'; result?: string; error?: string }
```

### Implementation Requirements

Implement `server/acp/acp-client.ts` with the following logic:

#### 1. Core Architecture: Newline-Delimited JSON-RPC over Stdio

The ACP protocol uses newline-delimited JSON-RPC 2.0. Each message is a complete JSON object followed by `\n`. Messages flow bidirectionally:

- **Client -> Agent (outbound):** Write JSON + `\n` to stdin
- **Agent -> Client (inbound):** Read JSON + `\n` from stdout

The inbound stream carries three kinds of messages:
1. **Responses** (have `id` field, match to pending request): `JsonRpcResponse`
2. **Notifications** (have `method`, no `id`): `JsonRpcNotification` -- e.g., `session/update`
3. **Agent requests** (have `method` AND `id`): `JsonRpcRequest` from agent -- e.g., `session/request_permission`

#### 2. Message Reading Loop

Start an async reading loop when `initialize()` is called. The loop reads lines from stdout and dispatches them:

```
readLoop():
  for each line from stdout:
    parsed = JSON.parse(line)
    if parsed has 'id' AND 'method':
      // Agent -> Client request (e.g., permission request)
      handleAgentRequest(parsed)
    else if parsed has 'id':
      // Response to our request
      resolve/reject the pending promise from pendingRequests map
    else if parsed has 'method':
      // Notification (e.g., session/update)
      dispatch to active notification handler
```

#### 3. Request/Response Correlation

Each outbound request gets an incrementing `id`. Store a `{ resolve, reject }` pair in `pendingRequests` keyed by `id`. When a response arrives with that `id`:
- If `response.error` exists: reject with `new Error(response.error.message)`
- If `response.result` exists: resolve with `response.result`

#### 4. Method Implementations

**`initialize()`:**
```
1. Start the stdout reading loop (if not already started)
2. Send JSON-RPC request:
   {
     jsonrpc: '2.0',
     id: nextId++,
     method: 'initialize',
     params: {
       protocolVersion: 1,
       clientInfo: { name: 'liminal-builder', title: 'Liminal Builder', version: '0.1.0' },
       clientCapabilities: {
         fileSystem: { readTextFile: true, writeTextFile: true },
         terminal: true,
       },
     }
   }
3. Await response
4. Store agentCapabilities from result
5. Return the AcpInitializeResult
```

**`sessionNew(params)`:**
```
1. Send JSON-RPC request: method='session/new', params={ cwd: params.cwd }
2. Await response
3. Return result as AcpCreateResult (has sessionId)
```

**`sessionLoad(sessionId, cwd)`:**
```
1. Set up a temporary collection array for replayed history
2. Register a notification handler that converts session/update notifications
   to ChatEntry objects and pushes them to the collection array
3. Send JSON-RPC request: method='session/load', params={ sessionId, cwd }
4. Await response (notifications arrive BEFORE response)
5. Unregister the notification handler
6. Return the collected ChatEntry[]
```

**Notification -> ChatEntry conversion:**
```
AcpUpdateEvent.type -> ChatEntry mapping:
  'user_message_chunk'    -> { type: 'user', content: text, entryId: randomUUID(), timestamp: now }
  'agent_message_chunk'   -> { type: 'assistant', content: text, entryId: randomUUID(), timestamp: now }
  'agent_thought_chunk'   -> { type: 'thinking', content: text, entryId: randomUUID() }
  'tool_call'             -> { type: 'tool-call', toolCallId, name: title,
                               status: map(status), entryId: randomUUID() }
  'tool_call_update'      -> (skip during replay -- updates are for streaming)
  'plan', 'config_options_update', 'current_mode_update' -> (skip/ignore in MVP)

Status mapping: 'pending'|'in_progress' -> 'running', 'completed' -> 'complete', 'failed' -> 'error'
Text extraction: content[0].text (first content block's text)
```

**`sessionPrompt(sessionId, content, onEvent)`:**
```
1. Register onEvent as the notification handler for session/update events
2. Send JSON-RPC request:
   method='session/prompt',
   params={ sessionId, content: [{ type: 'text', text: content }] }
3. Await response (notifications fire onEvent callback as they arrive)
4. Unregister the notification handler
5. Return result as AcpPromptResult (has stopReason)
```

**`sessionCancel(sessionId)`:**
```
1. Send JSON-RPC notification (no id, no response expected):
   { jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } }
```

**`handleAgentRequest(request)` (private):**
```
For 'session/request_permission':
  Respond with: { jsonrpc: '2.0', id: request.id, result: { approved: true } }
  (Auto-approve all permissions in MVP)

For 'fs/read_text_file', 'fs/write_text_file', 'terminal/create', etc.:
  Delegate to Bun APIs (deferred -- stub with approval for now)
```

**`close(timeoutMs = 5000)`:**
```
1. Close stdin writer
2. Set a flag to stop the reading loop
3. Reject any pending requests with a client-closed error
4. No explicit read-loop wait is required in Story 2a; the loop exits naturally when the stream closes. Keep the timeout parameter for interface compatibility.
```

**`onError(handler)`:**
```
Store the error handler. Call it when:
- JSON parse error on stdout line
- Broken pipe on stdin write
- Unexpected error in reading loop
```

#### 5. Key Design Details

- **Thread safety:** There is no multi-threading in Bun/JS, but there can be concurrent async operations. Route `session/update` notifications by `sessionId` (for example, with a `Map<sessionId, handler>`), not a single global handler.
- **Notification routing during prompt:** When `sessionPrompt` is active, all `session/update` notifications for that session go to the `onEvent` callback. When `sessionLoad` is active, they go to the history collection.
- **Error propagation:** If the reading loop encounters a parse error, call `errorHandler` but don't crash -- skip the malformed line and continue.
- **ID counter:** Use simple incrementing integer starting at 1.

### Complete Implementation Template

```typescript
// server/acp/acp-client.ts

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  AcpInitializeResult,
  AcpCreateResult,
  AcpPromptResult,
  AcpUpdateEvent,
} from './acp-types';
import type { ChatEntry } from '../../shared/types';

export class AcpClient {
  private nextId = 1;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();
  private agentCapabilities: AcpInitializeResult['agentCapabilities'] | null = null;
  private notificationHandlers = new Map<string, (event: AcpUpdateEvent) => void>();
  private errorHandler: ((error: Error) => void) | null = null;
  private stdin: any; // WritableStream or mock
  private stdout: any; // ReadableStream or mock
  private readingStarted = false;
  private closed = false;

  constructor(stdin: any, stdout: any) {
    this.stdin = stdin;
    this.stdout = stdout;
  }

  async initialize(): Promise<AcpInitializeResult> {
    // Start reading loop if not already started
    if (!this.readingStarted) {
      this.readingStarted = true;
      this.startReadLoop();
    }

    const result = await this.sendRequest('initialize', {
      protocolVersion: 1,
      clientInfo: {
        name: 'liminal-builder',
        title: 'Liminal Builder',
        version: '0.1.0',
      },
      clientCapabilities: {
        fileSystem: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
    });

    const initResult = result as AcpInitializeResult;
    this.agentCapabilities = initResult.agentCapabilities;
    return initResult;
  }

  async sessionNew(params: { cwd: string }): Promise<AcpCreateResult> {
    const result = await this.sendRequest('session/new', params);
    return result as AcpCreateResult;
  }

  async sessionLoad(sessionId: string, cwd: string): Promise<ChatEntry[]> {
    const history: ChatEntry[] = [];

    // Register handler to collect replayed notifications
    this.notificationHandlers.set(sessionId, (event: AcpUpdateEvent) => {
      const entry = this.updateEventToChatEntry(event);
      if (entry) history.push(entry);
    });

    try {
      await this.sendRequest('session/load', { sessionId, cwd });
      return history;
    } finally {
      this.notificationHandlers.delete(sessionId);
    }
  }

  async sessionPrompt(
    sessionId: string,
    content: string,
    onEvent: (event: AcpUpdateEvent) => void
  ): Promise<AcpPromptResult> {
    this.notificationHandlers.set(sessionId, onEvent);

    try {
      const result = await this.sendRequest('session/prompt', {
        sessionId,
        content: [{ type: 'text', text: content }],
      });
      return result as AcpPromptResult;
    } finally {
      this.notificationHandlers.delete(sessionId);
    }
  }

  sessionCancel(sessionId: string): void {
    this.writeMessage({
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: { sessionId },
    });
  }

  async close(timeoutMs = 5000): Promise<void> {
    this.closed = true;
    try {
      this.stdin.close();
    } catch {
      // Ignore close errors
    }
    // Reject any pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Client closed'));
      this.pendingRequests.delete(id);
    }
  }

  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  get canLoadSession(): boolean {
    return this.agentCapabilities?.loadSession ?? false;
  }

  // --- Private methods ---

  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.writeMessage(request);
    });
  }

  private writeMessage(msg: object): void {
    try {
      this.stdin.write(JSON.stringify(msg) + '\n');
    } catch (err) {
      this.errorHandler?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private async startReadLoop(): Promise<void> {
    try {
      for await (const line of this.stdout) {
        if (this.closed) break;

        const trimmed = typeof line === 'string' ? line.trim() : String(line).trim();
        if (!trimmed) continue;

        let parsed: any;
        try {
          parsed = JSON.parse(trimmed);
        } catch (err) {
          this.errorHandler?.(new Error(`JSON parse error: ${trimmed}`));
          continue;
        }

        this.dispatchMessage(parsed);
      }
    } catch (err) {
      if (!this.closed) {
        this.errorHandler?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private dispatchMessage(msg: any): void {
    if (msg.id !== undefined && msg.method) {
      // Agent -> Client request (e.g., permission)
      this.handleAgentRequest(msg);
    } else if (msg.id !== undefined) {
      // Response to our request
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (msg.method) {
      // Notification
      this.handleNotification(msg);
    }
  }

  private handleNotification(msg: any): void {
    if (msg.method === 'session/update' && msg.params?.update) {
      const event = msg.params.update as AcpUpdateEvent;
      const sessionId = msg.params.sessionId as string | undefined;
      if (sessionId) {
        this.notificationHandlers.get(sessionId)?.(event);
      }
    }
  }

  private handleAgentRequest(msg: any): void {
    if (msg.method === 'session/request_permission') {
      // Auto-approve in MVP
      this.writeMessage({
        jsonrpc: '2.0',
        id: msg.id,
        result: { approved: true },
      });
    }
    // Other agent requests (fs, terminal) would be handled here in later stories
  }

  private updateEventToChatEntry(event: AcpUpdateEvent): ChatEntry | null {
    const entryId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    switch (event.type) {
      case 'user_message_chunk':
        return {
          entryId,
          type: 'user',
          content: event.content[0]?.text ?? '',
          timestamp,
        };
      case 'agent_message_chunk':
        return {
          entryId,
          type: 'assistant',
          content: event.content[0]?.text ?? '',
          timestamp,
        };
      case 'agent_thought_chunk':
        return {
          entryId,
          type: 'thinking',
          content: event.content[0]?.text ?? '',
        };
      case 'tool_call':
        return {
          entryId,
          type: 'tool-call',
          toolCallId: event.toolCallId,
          name: event.title,
          status: this.mapToolStatus(event.status),
        };
      default:
        // tool_call_update, plan, config, mode -- skip
        return null;
    }
  }

  private mapToolStatus(
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
  ): 'running' | 'complete' | 'error' {
    switch (status) {
      case 'pending':
      case 'in_progress':
        return 'running';
      case 'completed':
        return 'complete';
      case 'failed':
        return 'error';
    }
  }
}
```

## Constraints

- Only modify `server/acp/acp-client.ts`
- Prefer not to modify tests; however, if a Red test has an invalid assumption or contract drift, make the smallest correction that preserves the TC intent and document it.
- Do NOT modify `server/acp/acp-types.ts` or `shared/types.ts`
- Do NOT create any WebSocket or browser code
- Do NOT implement beyond AcpClient scope (no AgentManager, no WebSocket handler)
- Use `crypto.randomUUID()` for entry IDs (available in Bun globally)
- The implementation must match the mock stdio interface from `tests/fixtures/acp-messages.ts`

## If Blocked or Uncertain

- Priority rule: for implementation behavior (what the code does), tests are source of truth.
- Priority rule: for architecture decisions (how the code is structured), feature spec + tech design are source of truth.
- If the mock stdio helper's stream interface differs from what the implementation expects, adapt the implementation to work with the mock (the mock simulates a real child process's stdio)
- If `crypto.randomUUID()` is not available, use a simple counter-based ID generator
- Resolve routine inconsistencies using feature spec + tech design as source of truth; ask only when blocked by missing local context.

## Verification

Run:
```bash
bunx vitest run tests/server/acp-client.test.ts
```

**Expected output:** 9 tests, all PASSING.

Run:
```bash
bun run test
```

**Expected output:** All server tests PASSING (Story 2a adds 9 tests; Story 1 tests may also be present depending on branch state).

Run:
```bash
bun run verify
```

**Expected output:** All `bun run verify` checks pass (format:check, biome lint, eslint, eslint-plugin tests, typecheck, server tests).

Run:
```bash
bun run typecheck
```

**Expected output:** Zero type errors.

## Done When

- [ ] `server/acp/acp-client.ts` fully implemented (no more NotImplementedError)
- [ ] `bunx vitest run tests/server/acp-client.test.ts` -- 9 tests pass
- [ ] `bun run test` -- all server tests pass (no regressions)
- [ ] `bun run verify` -- quality gate passes
- [ ] `bun run typecheck` -- zero errors
- [ ] AcpClient correctly: initializes with protocol version and capabilities, creates sessions with cwd, loads sessions collecting replayed history, prompts with streaming event callbacks, auto-approves permission requests, handles JSON-RPC errors, closes gracefully
