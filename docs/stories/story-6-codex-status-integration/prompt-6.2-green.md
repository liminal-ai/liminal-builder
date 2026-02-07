# Prompt 6.2: Green (Codex CLI + Connection Status + Integration)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs (Claude Code, Codex). Stack: Bun + Fastify server, vanilla HTML/JS client (shell/portlet iframes), WebSocket bridge. CLIs communicate via ACP (Agent Client Protocol) over stdio JSON-RPC.

This is the GREEN phase of Story 6 -- the final implementation story of the MVP. The 7 failing tests from Prompt 6.1 need to pass. This prompt implements: Codex CLI command configuration, connection status indicators, WebSocket browser-side reconnection with exponential backoff, browser refresh recovery, sidebar reconnect buttons, and makes the WebSocket integration tests pass.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `tests/server/websocket.test.ts` -- 6 integration test specs (failing)
- `tests/client/tabs.test.ts` -- 1 new test spec for TC-5.6a (failing)
- Connection status stubs in `client/portlet/portlet.js` and `client/shell/sidebar.js`
- Connection status CSS in `client/portlet/portlet.css`
- 71 previous tests passing, 7 new tests failing

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (WebSocket Lifecycle State Machine, lines ~225-244; Story 6 breakdown, lines ~2086-2115; Agent Manager, lines ~1054-1107)
- Feature Spec: `docs/feature-spec-mvp.md` (AC-5.2 Connection Status, AC-5.6 Browser Refresh)

## Task

### Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `server/acp/agent-manager.ts` | Modify | Add Codex CLI command configuration |
| `client/shell/shell.js` | Modify | WebSocket reconnection with exponential backoff, resync on reconnect |
| `client/portlet/portlet.js` | Modify | Connection status indicator implementation |
| `client/shell/sidebar.js` | Modify | Reconnect button implementation |
| `tests/server/websocket.test.ts` | Modify | Implement integration test bodies |
| `tests/client/tabs.test.ts` | Modify | Implement TC-5.6a test body |

### Implementation Requirements

#### 1. Codex CLI Command Configuration (`server/acp/agent-manager.ts`)

Add the Codex command config to the ACP_COMMANDS map. The tech design specifies the Codex ACP adapter:

```typescript
// Add to agent-manager.ts

/**
 * ACP adapter commands by CLI type.
 * Each entry specifies the command and arguments to spawn the ACP adapter process.
 *
 * Claude Code: @zed-industries/claude-code-acp (npm package)
 *   Install: npm install -g @zed-industries/claude-code-acp
 *   Launch: claude-code-acp
 *
 * Codex: codex-acp (community Rust adapter from cola-io/codex-acp)
 *   Install: Build from source
 *   Launch: codex-acp
 */
const ACP_COMMANDS: Record<CliType, { cmd: string; args: string[] }> = {
  'claude-code': {
    cmd: 'claude-code-acp',
    args: [],
  },
  'codex': {
    cmd: 'codex-acp',
    args: [],
  },
};
```

If the agent-manager already has `ACP_COMMANDS` with only Claude Code, add the Codex entry. The Codex adapter follows the same ACP protocol (JSON-RPC over stdio), so no protocol changes are needed -- just the command configuration.

#### 2. WebSocket Reconnection (`client/shell/shell.js`)

The browser maintains a single WebSocket connection to the Fastify server. On disconnect, it reconnects with exponential backoff. On reconnect, it resyncs state.

**WebSocket Lifecycle State Machine:**

```
[*] --> connecting
connecting --> connected : ws.open
connected --> disconnected : ws.close / error
disconnected --> reconnecting : retry
reconnecting --> connected : ws.open
```

**Reconnection algorithm:**

```javascript
// shell.js -- WebSocket reconnection

const WS_RECONNECT_BASE_MS = 500;    // Start at 500ms
const WS_RECONNECT_MAX_MS = 5000;    // Cap at 5 seconds
// No retry limit -- WebSocket reconnection runs indefinitely (server is local)

let ws = null;
let wsState = 'connecting'; // 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
let reconnectAttempt = 0;
let reconnectTimer = null;

function connectWebSocket() {
  wsState = reconnectAttempt === 0 ? 'connecting' : 'reconnecting';
  updateWSStatusUI(wsState);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

  ws.onopen = () => {
    wsState = 'connected';
    reconnectAttempt = 0;
    updateWSStatusUI(wsState);

    // Resync state on reconnect (AC-5.6)
    resyncState();
  };

  ws.onclose = (event) => {
    wsState = 'disconnected';
    updateWSStatusUI(wsState);
    scheduleReconnect();
  };

  ws.onerror = (error) => {
    // Error will be followed by onclose, which handles reconnection
    console.warn('WebSocket error:', error);
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return; // Already scheduled

  // Exponential backoff: 500ms, 1s, 2s, 4s, cap 5s
  const delay = Math.min(
    WS_RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt),
    WS_RECONNECT_MAX_MS
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempt++;
    connectWebSocket();
  }, delay);
}

/**
 * Resync state after WebSocket reconnect or browser refresh.
 * Re-sends project:list and session:list for expanded projects.
 * Agent processes survive browser refresh because they are server-managed.
 */
function resyncState() {
  // Re-fetch project list
  wsSend({ type: 'project:list' });

  // For each expanded project in the sidebar, re-fetch session list
  // The sidebar module tracks which projects are expanded via localStorage
  // (liminal:collapsed). On resync, we request session lists for all
  // non-collapsed projects.
  const collapsedState = JSON.parse(localStorage.getItem('liminal:collapsed') || '{}');
  // Note: project IDs are needed -- the sidebar will request session lists
  // as project:list response arrives and sidebar renders
}

function updateWSStatusUI(state) {
  // Update any WebSocket status indicator in the shell UI
  // For MVP, this is a visual indicator (could be a dot in the header)
  const indicator = document.getElementById('ws-status');
  if (indicator) {
    indicator.dataset.state = state;
  }
}

function wsSend(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
```

#### 3. Connection Status Indicators (`client/portlet/portlet.js`)

Replace the `updateConnectionStatus` stub with a working implementation. The status dot appears in the session/portlet header.

```javascript
/**
 * Update the connection status indicator dot in the session header.
 * Colors:
 *   connected    → green  (#9ece6a)
 *   disconnected → red    (#f7768e)
 *   reconnecting → yellow (#e0af68) + pulse animation
 *   starting     → yellow (#e0af68) + pulse animation
 *
 * @param {string} status - 'starting' | 'connected' | 'disconnected' | 'reconnecting'
 */
function updateConnectionStatus(status) {
  let dot = document.querySelector('.connection-status');

  if (!dot) {
    // Create the status dot if it doesn't exist
    dot = document.createElement('span');
    dot.className = 'connection-status';
    const header = document.querySelector('.session-header') || document.querySelector('.portlet-header');
    if (header) {
      header.prepend(dot);
    } else {
      // Fallback: add to body if no header exists
      document.body.prepend(dot);
    }
  }

  // Remove all status classes
  dot.classList.remove('connected', 'disconnected', 'reconnecting', 'starting');

  // Add current status class
  dot.classList.add(status);

  // Update title for accessibility
  const titles = {
    connected: 'Agent connected',
    disconnected: 'Agent disconnected',
    reconnecting: 'Reconnecting to agent...',
    starting: 'Starting agent...',
  };
  dot.title = titles[status] || status;

  // Disable/enable input bar based on connection status
  const inputDisabled = status !== 'connected';
  const inputBar = document.querySelector('.input-bar textarea, #message-input');
  const sendBtn = document.querySelector('.send-button, #send-btn');

  if (inputBar) {
    inputBar.disabled = inputDisabled;
  }
  if (sendBtn) {
    sendBtn.disabled = inputDisabled;
  }
}
```

#### 4. Sidebar Reconnect Button (`client/shell/sidebar.js`)

Replace the `updateAgentStatus` stub:

```javascript
/**
 * Show or hide the reconnect button for a CLI type.
 * When agent is disconnected, shows a "Reconnect" button in the sidebar
 * under the relevant CLI section.
 *
 * @param {string} cliType - 'claude-code' or 'codex'
 * @param {string} status - 'connected' | 'disconnected' | 'reconnecting' | 'starting'
 */
export function updateAgentStatus(cliType, status) {
  const existingBtn = document.querySelector(`.reconnect-btn[data-cli-type="${cliType}"]`);

  if (status === 'disconnected') {
    if (!existingBtn) {
      const btn = document.createElement('button');
      btn.className = 'reconnect-btn';
      btn.dataset.cliType = cliType;
      btn.textContent = `Reconnect ${cliType === 'claude-code' ? 'Claude Code' : 'Codex'}`;
      btn.addEventListener('click', () => {
        // Send reconnect request via WebSocket
        // shell.js handles this message type
        window.dispatchEvent(new CustomEvent('liminal:reconnect', { detail: { cliType } }));
      });

      // Insert in sidebar, near the CLI section
      const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
      if (sidebar) {
        sidebar.appendChild(btn);
      }
    }
  } else {
    // Remove reconnect button when not disconnected
    if (existingBtn) {
      existingBtn.remove();
    }
  }
}
```

The shell.js should listen for the custom event and send the WebSocket message:

```javascript
// shell.js -- reconnect handler
window.addEventListener('liminal:reconnect', (e) => {
  const { cliType } = e.detail;
  wsSend({ type: 'session:reconnect', cliType });
});
```

#### 5. WebSocket Integration Tests (`tests/server/websocket.test.ts`)

Implement the 6 integration test bodies. Each test needs a real Fastify server with mocked ACP. The mock pattern:

**Server setup for integration tests:**

```typescript
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import Fastify from 'fastify';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
// Import your server setup modules

describe('WebSocket Integration: Round-Trip Message Flow', () => {
  let app: ReturnType<typeof Fastify>;
  let port: number;
  let ws: WebSocket;
  let tempRoot: string;

  beforeAll(async () => {
    // Create Fastify instance with mocked ACP
    // 1. Create a mock ACP client that responds to JSON-RPC calls
    // 2. Create an AgentManager that uses the mock
    // 3. Set up the WebSocket handler with real routing
    // 4. Start listening on a random port

    app = Fastify();
    // ... register plugins, websocket handler, etc.
    // ... inject mock agent manager

    await app.listen({ port: 0 }); // Random port
    const address = app.server.address();
    port = typeof address === 'object' ? address!.port : parseInt(address!);
  });

  afterAll(async () => {
    ws?.close();
    await app?.close();
  });

  beforeEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    tempRoot = mkdtempSync(join(tmpdir(), 'liminal-ws-'));
    ws = await createTestWSClient(port);
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function makeProjectDir(name: string): string {
    const dir = join(tempRoot, name);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  test('project:add round-trip — sends project:add, receives project:added', async () => {
    const projectPath = makeProjectDir('project-integration');
    const response = await sendAndReceive(ws, {
      type: 'project:add',
      path: projectPath,
    }, 'project:added');

    expect(response.type).toBe('project:added');
    expect(response.project).toBeDefined();
    expect((response.project as any).path).toBe(projectPath);
    expect((response.project as any).id).toBeTruthy();
  });

  test('session:create round-trip — sends session:create, receives session:created', async () => {
    // First add a project
    const projectPath = makeProjectDir('project-session');
    const projectResp = await sendAndReceive(ws, {
      type: 'project:add',
      path: projectPath,
    }, 'project:added');

    const projectId = (projectResp.project as any).id;

    // Then create a session
    const sessionResp = await sendAndReceive(ws, {
      type: 'session:create',
      projectId,
      cliType: 'claude-code',
    }, 'session:created');

    expect(sessionResp.type).toBe('session:created');
    expect(sessionResp.sessionId).toBeTruthy();
    expect((sessionResp.sessionId as string).startsWith('claude-code:')).toBe(true);
  });

  test('session:send streams response — receives update, chunks, and complete', async () => {
    // Setup: add project, create session
    const projectPath = makeProjectDir('project-stream');
    const projectResp = await sendAndReceive(ws, {
      type: 'project:add',
      path: projectPath,
    }, 'project:added');

    const sessionResp = await sendAndReceive(ws, {
      type: 'session:create',
      projectId: (projectResp.project as any).id,
      cliType: 'claude-code',
    }, 'session:created');

    const sessionId = sessionResp.sessionId;

    // Send message and collect all responses until session:complete
    const messages = await sendAndCollect(ws, {
      type: 'session:send',
      sessionId,
      content: 'Hello, test message',
    }, 'session:complete');

    // Verify we received the expected message types
    const types = messages.map(m => m.type);
    expect(types).toContain('session:update');
    expect(types[types.length - 1]).toBe('session:complete');
  });

  test('TC-3.7b: cancel round-trip — session:cancel sends session:cancelled', async () => {
    // Setup: add project, create session
    const projectPath = makeProjectDir('project-cancel');
    const projectResp = await sendAndReceive(ws, {
      type: 'project:add',
      path: projectPath,
    }, 'project:added');

    const sessionResp = await sendAndReceive(ws, {
      type: 'session:create',
      projectId: (projectResp.project as any).id,
      cliType: 'claude-code',
    }, 'session:created');

    const sessionId = sessionResp.sessionId;

    // Start a prompt (mock ACP should stream slowly)
    // Then cancel
    // Expect session:cancelled
    // Note: exact implementation depends on how the mock ACP is configured
    // to delay its response, allowing the cancel to arrive during streaming
    ws.send(JSON.stringify({ type: 'session:send', sessionId, content: 'Slow response test' }));

    // Small delay to let streaming start
    await new Promise(r => setTimeout(r, 50));

    const cancelResp = await sendAndReceive(ws, {
      type: 'session:cancel',
      sessionId,
    }, 'session:cancelled');

    expect(cancelResp.type).toBe('session:cancelled');
    expect(cancelResp.sessionId).toBe(sessionId);
  });

  test('TC-1.3b: remove project sends project:removed', async () => {
    // Add a project first
    const projectPath = makeProjectDir('project-remove');
    const addResp = await sendAndReceive(ws, {
      type: 'project:add',
      path: projectPath,
    }, 'project:added');

    const projectId = (addResp.project as any).id;

    // Remove it
    const removeResp = await sendAndReceive(ws, {
      type: 'project:remove',
      projectId,
    }, 'project:removed');

    expect(removeResp.type).toBe('project:removed');
    expect(removeResp.projectId).toBe(projectId);
  });

  test('TC-2.2f: session creation failure sends error', async () => {
    // Configure mock ACP to fail on session/new
    // This test requires the mock to be configurable per-test
    // One approach: use a special project path that triggers failure
    // Another: set a flag on the mock before the test

    const projectPath = makeProjectDir('project-fail');
    const projectResp = await sendAndReceive(ws, {
      type: 'project:add',
      path: projectPath,
    }, 'project:added');

    // Attempt to create session with mock configured to fail
    // The mock should reject the session/new JSON-RPC call
    const errorResp = await sendAndReceive(ws, {
      type: 'session:create',
      projectId: (projectResp.project as any).id,
      cliType: 'claude-code',
    }, 'error');

    expect(errorResp.type).toBe('error');
    expect(errorResp.message).toBeTruthy();
  });
});
```

#### 6. TC-5.6a Implementation (`tests/client/tabs.test.ts`)

Implement the TC-5.6a test body in the existing tabs test file:

```typescript
test('TC-5.6a: tabs restore after browser refresh — tabs restored from localStorage', () => {
  // Simulate browser refresh scenario:
  // 1. Set localStorage with existing tab state (as if user had tabs before refresh)
  const savedState = {
    openTabs: ['claude-code:refresh-1', 'claude-code:refresh-2', 'codex:refresh-3'],
    activeTab: 'claude-code:refresh-2',
    tabOrder: ['claude-code:refresh-1', 'claude-code:refresh-2', 'codex:refresh-3'],
    tabMeta: {
      'claude-code:refresh-1': { title: 'Session One', cliType: 'claude-code' },
      'claude-code:refresh-2': { title: 'Session Two', cliType: 'claude-code' },
      'codex:refresh-3': { title: 'Session Three', cliType: 'codex' },
    },
  };
  localStorage.setItem('liminal:tabs', JSON.stringify(savedState));

  // 2. Initialize tabs (simulates page load after browser refresh)
  // The init() function should read from localStorage and restore tabs
  init(dom.tabBar, dom.portletContainer, dom.emptyState);

  // 3. Verify tabs restored
  expect(getTabCount()).toBe(3);
  expect(getActiveTab()).toBe('claude-code:refresh-2');
  expect(getTabOrder()).toEqual([
    'claude-code:refresh-1',
    'claude-code:refresh-2',
    'codex:refresh-3',
  ]);

  // 4. Verify iframes created
  const iframesInDOM = dom.portletContainer.querySelectorAll('iframe');
  expect(iframesInDOM.length).toBe(3);

  // 5. Verify active iframe is visible, others hidden
  for (const iframe of iframesInDOM) {
    if (iframe.dataset.sessionId === 'claude-code:refresh-2') {
      expect(iframe.style.display).toBe('block');
    } else {
      expect(iframe.style.display).toBe('none');
    }
  }
});
```

## Constraints

- Prefer to keep test expectations unchanged; if a Red test has a clear invalid assumption, apply the smallest TC-preserving correction and document it.
- Do NOT add new dependencies
- Do NOT modify files outside the specified list
- The WebSocket reconnection must use exponential backoff: 500ms base, 2x multiplier, 5s cap
- The WebSocket reconnection must NOT have a retry limit (it runs indefinitely)
- The Codex command config must use `codex-acp` as the command name
- Connection status CSS classes must be: `connected`, `disconnected`, `reconnecting`, `starting`
- localStorage key for tabs must remain `liminal:tabs`

## If Blocked or Uncertain

- If the integration tests require a specific mock ACP setup that doesn't match the existing test infrastructure, adapt the mock pattern to what's available
- If the Fastify server setup for integration tests differs from the main server setup, create a test-specific server factory
- If integration test expectations conflict with source contracts, prefer feature spec + tech design + existing test intent; adapt test setup first, and only change implementation when needed to satisfy the documented contract.

## Verification

Run:
```bash
bun test
```

Expected:
- All 78 tests PASS
- Zero failures

Run:
```bash
bun run typecheck
```

Expected: zero errors

## Done When

- [ ] All 78 tests PASS (71 previous + 7 new)
- [ ] `bun run typecheck` passes with zero errors
- [ ] Codex CLI command configured in `server/acp/agent-manager.ts`
- [ ] WebSocket reconnection implemented in `client/shell/shell.js` with exponential backoff (500ms, 1s, 2s, 4s, cap 5s)
- [ ] Connection status indicator implemented in `client/portlet/portlet.js`
- [ ] Reconnect button implemented in `client/shell/sidebar.js`
- [ ] WebSocket integration tests verify: project:add, session:create, session:send streaming, session:cancel, project:remove, session creation failure
- [ ] TC-5.6a verifies tab restore after browser refresh
