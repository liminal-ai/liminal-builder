# Prompt 6.1: Skeleton + Red (Codex CLI + Connection Status + Integration)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs (Claude Code, Codex). Stack: Bun + Fastify server, vanilla HTML/JS client (shell/portlet iframes), WebSocket bridge. CLIs communicate via ACP (Agent Client Protocol) over stdio JSON-RPC.

This is Story 6, the final story of the MVP build. Stories 0-5 have delivered the full stack: project management, session CRUD, ACP protocol, agent lifecycle, chat UI with streaming/tool-calls/thinking, and tab management. 71 tests are currently passing.

Story 6 adds: (1) Codex CLI command config, (2) connection status indicators, (3) WebSocket browser-side reconnection with backoff, (4) browser refresh recovery, and (5) WebSocket integration tests verifying full message round-trips.

The RED phase creates 7 new failing tests: 6 integration tests in `tests/server/websocket.test.ts` and 1 client test in `tests/client/tabs.test.ts`.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `server/acp/agent-manager.ts` -- AgentManager class with lifecycle state machine, `ensureAgent()`, `getStatus()`, `reconnect()`, `shutdownAll()`
- `server/websocket.ts` -- WebSocket handler with message routing
- `server/acp/acp-client.ts` -- Full ACP JSON-RPC client
- `client/shell/shell.js` -- WebSocket connection and message routing
- `client/shell/tabs.js` -- Full tab lifecycle with localStorage persistence
- `client/portlet/portlet.js` -- postMessage handler for session messages
- `client/portlet/portlet.css` -- Chat and input styles
- `client/shell/sidebar.js` -- Project/session list rendering
- 71 tests passing

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Story 6 breakdown, lines ~2086-2115; WebSocket Lifecycle State Machine, lines ~225-244; WebSocket handler mapping, lines ~518-561; Integration test mapping, lines ~1709-1719)
- Feature Spec: `docs/feature-spec-mvp.md` (AC-5.2 Connection Status, lines ~496-513; AC-5.6 Browser Refresh, lines ~540-549)

## Task

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `tests/server/websocket.test.ts` | Modify | Add 6 WebSocket integration test specs (failing) |
| `tests/client/tabs.test.ts` | Modify | Add 1 test spec for TC-5.6a (failing) |
| `client/portlet/portlet.js` | Modify | Add connection status handler stub |
| `client/portlet/portlet.css` | Modify | Add connection status dot styles (skeleton) |
| `client/shell/sidebar.js` | Modify | Add reconnect button stub |

### WebSocket Integration Test Structure: `tests/server/websocket.test.ts`

The integration tests verify full round-trip message flow: WebSocket client sends a message, the server processes it (routing through project-store, session-manager, agent-manager with mocked ACP), and the response arrives back at the WebSocket client.

**Test setup pattern:**

The key architectural insight: integration tests need a real Fastify server with WebSocket support, but with a mocked ACP layer. The ACP client is the mock boundary (as per the Critical Mocking Rule from the tech design). Tests create a real WebSocket connection to the running Fastify server.

```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Integration test: real Fastify server, real WebSocket, mocked ACP

// Helper: create a WebSocket test client connected to the Fastify server
function createTestWSClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

// Helper: send a message and wait for a response of the expected type
function sendAndReceive(
  ws: WebSocket,
  message: Record<string, unknown>,
  expectedType: string,
  timeoutMs = 5000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${expectedType}`)), timeoutMs);
    const handler = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string);
      if (data.type === expectedType) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(data);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify(message));
  });
}

// Helper: send a message and collect multiple responses
function sendAndCollect(
  ws: WebSocket,
  message: Record<string, unknown>,
  untilType: string,
  timeoutMs = 10000
): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const collected: Record<string, unknown>[] = [];
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${untilType}`)), timeoutMs);
    const handler = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string);
      collected.push(data);
      if (data.type === untilType) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        resolve(collected);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify(message));
  });
}

function makeProjectDir(rootDir: string, name: string): string {
  const dir = join(rootDir, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
```

**Mock ACP setup:**

The ACP layer needs to be mocked at the process spawn boundary. The integration tests should mock `Bun.spawn` (or the agent-manager's spawn method) to return a mock process with controllable stdin/stdout. This allows us to simulate ACP responses without running real CLI processes.

```typescript
// Mock ACP process for integration tests
function createMockAcpProcess() {
  // Create readable/writable streams that simulate stdio
  // The mock process responds to JSON-RPC requests with predefined responses
  // Key responses needed:
  //   initialize → { protocolVersion: 1, agentInfo: {...}, agentCapabilities: {...} }
  //   session/new → { sessionId: 'test-session-123' }
  //   session/prompt → streams session/update notifications, then returns { stopReason: 'end_turn' }
  //   session/cancel → triggers cancelled stopReason
}
```

**Test specs (6 integration tests):**

Add these to the existing `tests/server/websocket.test.ts` file. If the file already has tests (TC-1.3b, TC-2.2f from earlier stories), add the new tests alongside them.

```typescript
describe('WebSocket Integration: Round-Trip Message Flow', () => {
  // Server setup: start Fastify with mocked ACP before all tests
  // Use a random port to avoid conflicts
  let server: FastifyInstance;
  let port: number;
  let ws: WebSocket;
  let tempRoot: string;

  beforeAll(async () => {
    // Start server with mocked ACP layer
    // ...
  });

  afterAll(async () => {
    ws?.close();
    await server?.close();
  });

  beforeEach(async () => {
    // Create fresh WebSocket connection for each test
    tempRoot = mkdtempSync(join(tmpdir(), 'liminal-ws-'));
    ws = await createTestWSClient(port);
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  test('project:add round-trip — sends project:add, receives project:added', async () => {
    // Given: WS client connected to server
    // When/Then:
    const projectPath = makeProjectDir(tempRoot, 'project-add');
    const response = await sendAndReceive(
      ws,
      { type: 'project:add', path: projectPath, requestId: 'req-1' },
      'project:added'
    );
    expect(response.type).toBe('project:added');
    expect(response.project).toBeDefined();
    expect((response.project as any).path).toBe(projectPath);
    expect((response.project as any).name).toBe('project-add');
    expect(typeof (response.project as any).id).toBe('string');
  });

  test('session:create round-trip — sends session:create, receives session:created', async () => {
    // Given: project added
    const projectPath = makeProjectDir(tempRoot, 'project-create');
    const addResp = await sendAndReceive(
      ws,
      { type: 'project:add', path: projectPath, requestId: 'req-2' },
      'project:added'
    );
    const projectId = (addResp.project as any).id;

    // When/Then:
    const response = await sendAndReceive(
      ws,
      { type: 'session:create', projectId, cliType: 'claude-code', requestId: 'req-3' },
      'session:created'
    );
    expect(response.type).toBe('session:created');
    expect(typeof response.sessionId).toBe('string');
    expect((response.sessionId as string).startsWith('claude-code:')).toBe(true);
  });

  test('session:send streams response — receives update, chunks, and complete', async () => {
    // Given: session created
    const projectPath = makeProjectDir(tempRoot, 'project-stream');
    const addResp = await sendAndReceive(ws, { type: 'project:add', path: projectPath, requestId: 'req-4' }, 'project:added');
    const projectId = (addResp.project as any).id;
    const createResp = await sendAndReceive(ws, { type: 'session:create', projectId, cliType: 'claude-code', requestId: 'req-5' }, 'session:created');
    const sessionId = createResp.sessionId as string;

    // When: send message, collect responses until session:complete
    const messages = await sendAndCollect(
      ws,
      { type: 'session:send', sessionId, content: 'Hello' },
      'session:complete'
    );

    // Then: sequence includes update(s), possibly chunk(s), and complete
    expect(messages.length).toBeGreaterThan(0);
    const types = messages.map(m => m.type);
    expect(types).toContain('session:complete');
    // All messages reference the correct session
    messages.forEach(m => {
      if (m.sessionId) expect(m.sessionId).toBe(sessionId);
    });
  });

  test('TC-3.7b: cancel round-trip — sends cancel during streaming, receives session:cancelled', async () => {
    // Given: session created and prompt in progress
    const projectPath = makeProjectDir(tempRoot, 'project-cancel');
    const addResp = await sendAndReceive(ws, { type: 'project:add', path: projectPath, requestId: 'req-6' }, 'project:added');
    const projectId = (addResp.project as any).id;
    const createResp = await sendAndReceive(ws, { type: 'session:create', projectId, cliType: 'claude-code', requestId: 'req-7' }, 'session:created');
    const sessionId = createResp.sessionId as string;

    // When: send message then immediately cancel
    ws.send(JSON.stringify({ type: 'session:send', sessionId, content: 'Hello' }));
    // Small delay to let streaming start
    await new Promise(r => setTimeout(r, 100));
    const response = await sendAndReceive(
      ws,
      { type: 'session:cancel', sessionId },
      'session:cancelled'
    );

    // Then:
    expect(response.type).toBe('session:cancelled');
    expect(response.sessionId).toBe(sessionId);
  });

  test('TC-1.3b: remove project sends project:removed', async () => {
    // Given: project added
    const projectPath = makeProjectDir(tempRoot, 'project-remove');
    const addResp = await sendAndReceive(ws, { type: 'project:add', path: projectPath, requestId: 'req-8' }, 'project:added');
    const projectId = (addResp.project as any).id;

    // When/Then:
    const response = await sendAndReceive(
      ws,
      { type: 'project:remove', projectId, requestId: 'req-9' },
      'project:removed'
    );
    expect(response.type).toBe('project:removed');
    expect(response.projectId).toBe(projectId);
  });

  test('TC-2.2f: session creation failure sends error', async () => {
    // Given: ACP mock configured to fail on session/new
    // (Configure mock before this test to reject session creation)
    const projectPath = makeProjectDir(tempRoot, 'project-fail');
    const addResp = await sendAndReceive(
      ws,
      { type: 'project:add', path: projectPath, requestId: 'req-10a' },
      'project:added'
    );
    const projectId = (addResp.project as any).id;

    // When/Then:
    const response = await sendAndReceive(
      ws,
      { type: 'session:create', projectId, cliType: 'claude-code', requestId: 'req-10b' },
      'error'
    );
    expect(response.type).toBe('error');
    expect(typeof response.message).toBe('string');
  });
});
```

### Client Test Addition: `tests/client/tabs.test.ts`

Add 1 test to the existing tabs test file:

```typescript
// Add to the existing describe('Tab Management', ...) block

test('TC-5.6a: tabs restore after browser refresh — tabs restored from localStorage', () => {
  // Given: localStorage has tab state simulating a browser refresh scenario
  localStorage.setItem('liminal:tabs', JSON.stringify({
    openTabs: ['claude-code:s1', 'codex:s2', 'claude-code:s3'],
    activeTab: 'codex:s2',
    tabOrder: ['claude-code:s1', 'codex:s2', 'claude-code:s3'],
    tabMeta: {
      'claude-code:s1': { title: 'Session 1', cliType: 'claude-code' },
      'codex:s2': { title: 'Session 2', cliType: 'codex' },
      'claude-code:s3': { title: 'Session 3', cliType: 'claude-code' },
    }
  }));

  // When: init() called (simulating page reload after browser refresh)
  init(dom.tabBar, dom.portletContainer, dom.emptyState);

  // Then: tabs restored from localStorage
  expect(getTabCount()).toBe(3);
  expect(portletContainer.querySelectorAll('iframe').length).toBe(3);
  expect(getActiveTab()).toBe('codex:s2');
  expect(getTabOrder()).toEqual(['claude-code:s1', 'codex:s2', 'claude-code:s3']);
});
```

### Connection Status Stub: `client/portlet/portlet.js`

Add a handler for the `agent:status` message to display connection status. For the Red skeleton, keep prior Story 3 behavior intact: add a non-throwing placeholder that does not regress existing tests.

```javascript
// Add to the postMessage handler switch statement in portlet.js
case 'agent:status':
  updateConnectionStatus(msg.status);
  break;

// Add stub function:
function updateConnectionStatus(status) {
  // status: 'starting' | 'connected' | 'disconnected' | 'reconnecting'
  // Updates the connection status indicator dot in the session header
  // placeholder for Story 6 Green
  return;
}
```

### Connection Status Styles: `client/portlet/portlet.css`

Add placeholder styles for the status indicator:

```css
/* Connection status indicator */
.connection-status {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
}

.connection-status.connected {
  background-color: #9ece6a; /* green */
}

.connection-status.disconnected {
  background-color: #f7768e; /* red */
}

.connection-status.reconnecting {
  background-color: #e0af68; /* yellow */
  animation: pulse 1.5s ease-in-out infinite;
}

.connection-status.starting {
  background-color: #e0af68; /* yellow */
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

### Reconnect Button Stub: `client/shell/sidebar.js`

Add a reconnect button renderer stub to sidebar.js. When an agent is disconnected, the sidebar should show a "Reconnect" button next to the CLI type section:

```javascript
// Add to sidebar.js:

/**
 * Show or hide the reconnect button for a CLI type.
 * Called when agent:status messages arrive.
 * @param {string} cliType - 'claude-code' or 'codex'
 * @param {string} status - 'connected' | 'disconnected' | 'reconnecting' | 'starting'
 */
export function updateAgentStatus(cliType, status) {
  // placeholder for Story 6 Green; do not break existing sidebar behavior
  return;
}
```

## Constraints

- Do NOT implement full Story 6 logic in this phase; placeholders are allowed but must not break existing passing tests.
- Do NOT modify the implementations of existing passing functions
- New Story 6 tests should fail against currently unimplemented behavior (RED phase)
- All 71 previous tests MUST still pass
- Integration tests have real assertions that should fail meaningfully (FAIL/ERROR) because full Story 6 behavior is not implemented yet
- The connection status CSS can be fully written (it is presentational, not logic)

## If Blocked or Uncertain

- If `tests/server/websocket.test.ts` already has some tests from earlier stories, add the new tests to the existing describe block (or create a new one)
- If the portlet.js postMessage handler uses a different pattern than `switch (msg.type)`, adapt the status handler to match
- Resolve straightforward inconsistencies using source docs and existing repo contracts; ask only for hard blockers.

## Verification

Run:
```bash
bun test
```

Expected:
- 71 previous tests: PASS
- 7 new tests: failing outcomes (FAIL/ERROR) against unimplemented Story 6 behavior
- Total: 78 tests, 7 failing

Run:
```bash
bun run typecheck
```

Expected: zero errors

## Done When

- [ ] `tests/server/websocket.test.ts` has 6 new integration test specs (failing in RED against unimplemented Story 6 behavior)
- [ ] `tests/client/tabs.test.ts` has 1 new test spec for TC-5.6a (failing in RED)
- [ ] Connection status handler stub added to `client/portlet/portlet.js`
- [ ] Connection status CSS added to `client/portlet/portlet.css`
- [ ] Reconnect button stub added to `client/shell/sidebar.js`
- [ ] New Story 6 tests fail in RED for implementation-relevant reasons
- [ ] All 71 previous tests still pass
- [ ] `bun run typecheck` passes with zero errors
