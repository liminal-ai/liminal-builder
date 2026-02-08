# Prompt 1.2: TDD Green -- Project Sidebar Implementation

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. Stack: Bun + Fastify server, vanilla HTML/JS client, WebSocket bridge. CLIs: Claude Code and Codex via ACP protocol (JSON-RPC over stdio).

This is Story 1: Project Sidebar, which implements project directory management (AC-1.1 through AC-1.4). This is the TDD Green phase. Nine tests were written in prompt 1.1 (Red phase) and are currently failing against stubs/unimplemented behavior. Your job is to implement the production code so that all 9 tests PASS.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- Story 0 complete: all infrastructure files exist
- `tests/server/project-store.test.ts` -- 5 tests (all currently ERROR)
- `tests/client/sidebar.test.ts` -- 4 tests (all currently ERROR)
- `bun run typecheck` passes

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 1, ProjectStore interface, WebSocket handlers)
- Feature Spec: `docs/feature-spec-mvp.md` (AC-1.1 through AC-1.4)

### Key Type Definitions (inlined)

```typescript
// server/projects/project-types.ts
export interface Project {
  id: string;           // UUID v4 generated on add
  path: string;         // Absolute filesystem path
  name: string;         // Display name derived from directory basename
  addedAt: string;      // ISO 8601 UTC -- insertion order
}
```

```typescript
// server/errors.ts
export class NotImplementedError extends Error { ... }
export class AppError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) { ... }
}
```

```typescript
// server/store/json-store.ts (already implemented)
export class JsonStore<T> {
  constructor(config: StoreConfig, defaultData: T);
  async read(): Promise<T>;
  async write(data: T): Promise<void>;       // debounced
  async writeSync(data: T): Promise<void>;   // immediate
}
```

```typescript
// shared/types.ts -- relevant WebSocket message types
// Client -> Server:
| { type: 'project:add'; path: string }
| { type: 'project:remove'; projectId: string }
| { type: 'project:list' }

// Server -> Client:
| { type: 'project:added'; project: Project; requestId?: string }
| { type: 'project:removed'; projectId: string; requestId?: string }
| { type: 'project:list'; projects: Project[] }
| { type: 'error'; requestId?: string; message: string }
```

### Acceptance Criteria (inlined)

**AC-1.1:** Sidebar displays all configured project directories as collapsible groups
- **TC-1.1a:** Projects in insertion order
- **TC-1.1b:** Empty state on first run

**AC-1.2:** User can add a project directory
- **TC-1.2a:** Add valid directory creates project with ID
- **TC-1.2b:** Add nonexistent directory throws validation error
- **TC-1.2c:** Cancel add sends no message
- **TC-1.2d:** Add duplicate throws "already added" error

**AC-1.3:** User can remove a project
- **TC-1.3a:** Remove project, project gone, session mappings retained (separate file)

**AC-1.4:** Collapsible project folders
- **TC-1.4a:** Collapse hides sessions in DOM
- **TC-1.4b:** Collapse state persists in localStorage across reload

### Sequence: Add Project (from tech design)

```
Browser (sidebar.js) -> Server (websocket.ts -> project-store.ts)
1. WS: project:add { path }
2. Server: validate path exists, check duplicates, generate ID, derive name, persist
3. WS: project:added { project }
4. Sidebar renders new project
```

### Sequence: Remove Project

```
Browser (sidebar.js -> tabs.js) -> Server (websocket.ts -> project-store.ts)
1. WS: project:remove { projectId }
2. Server: remove from projects.json (session mappings retained)
3. WS: project:removed { projectId }
4. Sidebar removes project
```

## Task

### Files to Modify

1. **`server/projects/project-store.ts`** -- Replace stubs with full CRUD implementation
2. **`server/websocket.ts`** -- Add `project:add`, `project:remove`, `project:list` message handlers
3. **`server/index.ts`** -- Wire `ProjectStore` instance and pass it as `WebSocketDeps`
4. **`client/shell/sidebar.js`** -- Full sidebar rendering and interaction
5. **`client/shell/shell.css`** -- Add project item and session list styles (if needed)

### May Also Need to Modify

6. **`tests/server/project-store.test.ts`** -- Minor adjustments if test setup needs path mocking
7. **`tests/client/sidebar.test.ts`** -- Minor adjustments if import paths or DOM setup needs tweaking

### Implementation Requirements

---

#### 1. `server/projects/project-store.ts` -- Full Implementation

Replace the stub class with a working implementation.

**`addProject(path: string): Promise<Project>`**
- Validate the path exists on the filesystem with `Bun.file(path).exists()`. If it does not exist, throw `AppError('INVALID_PATH', 'Directory does not exist: <path>')`.
- Check for duplicates: read current projects, check if any have the same `path`. If so, throw `AppError('DUPLICATE_PROJECT', 'Project already added')`.
- Generate ID with `crypto.randomUUID()`.
- Derive name from `path.split('/').pop()` (the directory basename). Use Node's `basename` from `path` module.
- Set `addedAt` to `new Date().toISOString()`.
- Append to the project array and persist via `store.write()`.
- Return the new `Project`.

**`removeProject(projectId: string): Promise<void>`**
- Read current projects, filter out the one with matching `id`.
- If not found, throw `AppError('NOT_FOUND', 'Project not found')` (or silently succeed -- either is acceptable for MVP, but throwing is safer).
- Persist the filtered array via `store.write()`.
- Do NOT touch `sessions.json` -- session mappings are retained.

**`listProjects(): Promise<Project[]>`**
- Read from store and return. Projects are already in insertion order (appended sequentially).

```typescript
import { AppError } from '../errors';
import { JsonStore } from '../store/json-store';
import type { Project } from './project-types';
import { basename } from 'path';
import { randomUUID } from 'crypto';

export class ProjectStore {
  private store: JsonStore<Project[]>;

  constructor(store: JsonStore<Project[]>) {
    this.store = store;
  }

  async addProject(path: string): Promise<Project> {
    // Validate path exists
    const exists = await Bun.file(path).exists();
    if (!exists) {
      throw new AppError('INVALID_PATH', `Directory does not exist: ${path}`);
    }

    // Check for duplicates
    const projects = await this.store.read();
    if (projects.some(p => p.path === path)) {
      throw new AppError('DUPLICATE_PROJECT', 'Project already added');
    }

    // Create new project
    const project: Project = {
      id: randomUUID(),
      path,
      name: basename(path),
      addedAt: new Date().toISOString(),
    };

    // Persist
    projects.push(project);
    await this.store.write(projects);

    return project;
  }

  async removeProject(projectId: string): Promise<void> {
    const projects = await this.store.read();
    const filtered = projects.filter(p => p.id !== projectId);
    if (filtered.length === projects.length) {
      throw new AppError('NOT_FOUND', 'Project not found');
    }
    await this.store.write(filtered);
  }

  async listProjects(): Promise<Project[]> {
    return this.store.read();
  }
}
```

---

#### 2. `server/websocket.ts` -- Add Project Handlers

Add message routing for `project:add`, `project:remove`, and `project:list`. The WebSocket handler needs access to a `ProjectStore` instance.

**Architecture decision:** The `handleWebSocket` function needs access to the ProjectStore. Modify it to accept dependencies as a parameter, or create the ProjectStore at module level. The cleanest approach for testability is to pass dependencies in.

Update the function signature to accept a context/dependencies object:

```typescript
import type { WebSocket } from '@fastify/websocket';
import type { ClientMessage, ServerMessage } from '../shared/types';
import type { ProjectStore } from './projects/project-store';

export interface WebSocketDeps {
  projectStore: ProjectStore;
  // sessionManager and agentManager will be added in later stories
}

export function handleWebSocket(socket: WebSocket, deps: WebSocketDeps): void {
  console.log('[ws] Client connected');

  socket.on('message', async (raw: Buffer | string) => {
    try {
      const message: ClientMessage = JSON.parse(
        typeof raw === 'string' ? raw : raw.toString('utf-8')
      );
      console.log('[ws] Received:', message.type);

      await routeMessage(socket, message, deps);
    } catch (err: any) {
      console.error('[ws] Error handling message:', err);
      const response: ServerMessage = {
        type: 'error',
        message: err.message || 'Internal error',
      };
      socket.send(JSON.stringify(response));
    }
  });

  socket.on('close', () => {
    console.log('[ws] Client disconnected');
  });

  socket.on('error', (err: Error) => {
    console.error('[ws] Socket error:', err.message);
  });
}

async function routeMessage(
  socket: WebSocket,
  message: ClientMessage,
  deps: WebSocketDeps
): Promise<void> {
  const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));

  switch (message.type) {
    case 'project:add': {
      try {
        const project = await deps.projectStore.addProject(message.path);
        send({ type: 'project:added', project, requestId: message.requestId });
      } catch (err: any) {
        send({ type: 'error', requestId: message.requestId, message: err.message });
      }
      break;
    }

    case 'project:remove': {
      try {
        await deps.projectStore.removeProject(message.projectId);
        send({ type: 'project:removed', projectId: message.projectId, requestId: message.requestId });
      } catch (err: any) {
        send({ type: 'error', requestId: message.requestId, message: err.message });
      }
      break;
    }

    case 'project:list': {
      const projects = await deps.projectStore.listProjects();
      send({ type: 'project:list', projects });
      break;
    }

    default: {
      send({
        type: 'error',
        requestId: message.requestId,
        message: `Handler not implemented: ${message.type}`,
      });
    }
  }
}
```

#### 3. `server/index.ts` -- Wire `ProjectStore` into `handleWebSocket`

Create the `ProjectStore` in server bootstrap and pass it into the WebSocket handler dependencies.

```typescript
import { JsonStore } from './store/json-store';
import { ProjectStore } from './projects/project-store';
import { handleWebSocket } from './websocket';

const projectsStore = new JsonStore<Project[]>({ filePath: projectsFile, writeDebounceMs: 500 }, []);
const projectStore = new ProjectStore(projectsStore);

fastify.get('/ws', { websocket: true }, (socket) => {
  handleWebSocket(socket, { projectStore });
});
```

#### 4. `client/shell/sidebar.js` -- Full Implementation

Replace the stub with a working sidebar module. The sidebar must export the following functions (which the tests expect):

- `initSidebar()` -- Initialize sidebar, request project list, set up add button
- `renderProjects(projects, sendMessage, sessionsByProject?)` -- Render project list into `#project-list`
- `handleAddProject(path, sendMessage)` -- Handle add project action (null/empty path = cancel)
- `toggleCollapse(projectId)` -- Toggle collapse state for a project

**Rendering logic:**

- If `projects` is empty, render an empty state element: `<div class="empty-state"><p>Add a project to get started</p></div>`
- For each project, render a project group:
  ```html
  <div class="project-group" data-project-id="{id}">
    <div class="project-header">
      <button class="collapse-toggle" data-project-id="{id}">{arrow}</button>
      <span class="project-name">{name}</span>
      <button class="remove-project-btn" data-project-id="{id}">x</button>
    </div>
    <div class="session-list" data-project-id="{id}">
      <!-- sessions rendered here -->
    </div>
  </div>
  ```
- Read collapse state from `localStorage` key `liminal:collapsed` (JSON object: `Record<string, boolean>`)
- If a project is collapsed, set `hidden = true` on the `.session-list` element
- Collapse toggle button click: toggle `hidden` on session list, save state to localStorage

**`handleAddProject(path, sendMessage)`:**
- If `path` is null, undefined, or empty string: do nothing (cancel case, TC-1.2c)
- Otherwise: call `sendMessage({ type: 'project:add', path })`

**`toggleCollapse(projectId)`:**
- Find the session list element with `[data-project-id="{projectId}"] .session-list` or `document.querySelector('.session-list[data-project-id="' + projectId + '"]')`
- Toggle its `hidden` attribute
- Read current collapsed state from localStorage, toggle the value for this projectId, write back

```javascript
const COLLAPSED_KEY = 'liminal:collapsed';

/**
 * Initialize the sidebar.
 * Called once on page load.
 */
export function initSidebar() {
  console.log('[sidebar] Initialized');
  // Add button handler will be wired up when shell.js passes sendMessage
}

/**
 * Render the project list.
 * @param {Array<{id: string, path: string, name: string, addedAt: string}>} projects
 * @param {(msg: object) => void} sendMessage
 * @param {Record<string, Array<{id: string, title: string, lastActiveAt: string, cliType: string}>>} [sessionsByProject]
 */
export function renderProjects(projects, sendMessage, sessionsByProject = {}) {
  const container = document.getElementById('project-list');
  if (!container) return;

  container.innerHTML = '';

  if (projects.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = '<p>Add a project to get started</p>';
    container.appendChild(emptyState);
    return;
  }

  // Read collapsed state from localStorage
  const collapsedState = getCollapsedState();

  projects.forEach(project => {
    const group = document.createElement('div');
    group.className = 'project-group';
    group.setAttribute('data-project-id', project.id);

    // Project header
    const header = document.createElement('div');
    header.className = 'project-header';

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'collapse-toggle';
    collapseBtn.setAttribute('data-project-id', project.id);
    const isCollapsed = collapsedState[project.id] === true;
    collapseBtn.textContent = isCollapsed ? '>' : 'v';
    collapseBtn.addEventListener('click', () => toggleCollapse(project.id));
    header.appendChild(collapseBtn);

    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = project.name;
    header.appendChild(name);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-project-btn';
    removeBtn.setAttribute('data-project-id', project.id);
    removeBtn.textContent = 'x';
    removeBtn.addEventListener('click', () => {
      sendMessage({ type: 'project:remove', projectId: project.id });
    });
    header.appendChild(removeBtn);

    group.appendChild(header);

    // Session list
    const sessionList = document.createElement('div');
    sessionList.className = 'session-list';
    sessionList.setAttribute('data-project-id', project.id);

    // Render sessions if provided
    const sessions = sessionsByProject[project.id] || [];
    sessions.forEach(session => {
      const sessionItem = document.createElement('div');
      sessionItem.className = 'session-item';
      sessionItem.setAttribute('data-session-id', session.id);
      sessionItem.textContent = session.title;
      sessionList.appendChild(sessionItem);
    });

    // Apply collapsed state
    if (isCollapsed) {
      sessionList.hidden = true;
    }

    group.appendChild(sessionList);
    container.appendChild(group);
  });
}

/**
 * Handle add project action.
 * @param {string|null} path - Directory path (null = cancel)
 * @param {(msg: object) => void} sendMessage
 */
export function handleAddProject(path, sendMessage) {
  if (!path || path.trim() === '') {
    // Cancel -- do nothing (TC-1.2c)
    return;
  }
  sendMessage({ type: 'project:add', path: path.trim() });
}

/**
 * Toggle collapse state for a project.
 * @param {string} projectId
 */
export function toggleCollapse(projectId) {
  // Find the session list for this project
  const group = document.querySelector(`.project-group[data-project-id="${projectId}"]`);
  if (!group) return;

  const sessionList = group.querySelector('.session-list');
  if (!sessionList) return;

  // Toggle hidden
  const isNowCollapsed = !sessionList.hidden;
  sessionList.hidden = isNowCollapsed;

  // Update collapse toggle button text
  const collapseBtn = group.querySelector('.collapse-toggle');
  if (collapseBtn) {
    collapseBtn.textContent = isNowCollapsed ? '>' : 'v';
  }

  // Persist to localStorage
  const state = getCollapsedState();
  state[projectId] = isNowCollapsed;
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify(state));
}

/**
 * Read collapsed state from localStorage.
 * @returns {Record<string, boolean>}
 */
function getCollapsedState() {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}
```

---

#### 5. `client/shell/shell.css` -- Minimal Sidebar Styles

Add minimal styles so project rows, selection, and session visibility are clear.

```css
.project-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.project-item.selected {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.session-list {
  margin-left: 20px;
}
```

If you render project rows with `.project-header`/`.project-group`, either reuse these selectors or add `.project-item` on the clickable row for consistency.

#### 6. Test Adjustments

The tests from prompt 1.1 may need minor adjustments to work with the actual implementation. Here are known areas to check and adjust:

**`tests/server/project-store.test.ts`:**
- If the Red prompt was followed as written (temp directories + `join(tempDir, ...)`), no path setup changes should be needed.
- If local Red tests still use hardcoded paths, convert them to temp directories under `tempDir` so `Bun.file(path).exists()` checks remain deterministic.
- TC-1.2b: The path must NOT exist. Use a path like `join(tempDir, 'nonexistent-subdir')`.
- TC-1.2d: First add must succeed (path must exist), second add must throw duplicate.
- TC-1.3a: Must create a real directory for the add to succeed.

Adjust the test setup to create real directories:

```typescript
// In beforeEach, also create some mock "project" directories:
import { mkdirSync } from 'fs';

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'liminal-test-'));
  const filePath = join(tempDir, 'data', 'projects.json');
  store = new JsonStore<Project[]>({ filePath, writeDebounceMs: 0 }, []);
  projectStore = new ProjectStore(store);

  // Create mock project directories
  mkdirSync(join(tempDir, 'project-alpha'));
  mkdirSync(join(tempDir, 'project-beta'));
  mkdirSync(join(tempDir, 'my-app'));
});
```

Then update paths in tests to use `join(tempDir, 'project-alpha')` etc.

**`tests/client/sidebar.test.ts`:**
- Check that the import path `'../../client/shell/sidebar.js'` resolves correctly from `tests/client/`.
- The DOM environment needs `document` and `localStorage` globals. If Bun doesn't provide these by default, you may need to use a `happy-dom` or `jsdom` setup. Check if the tests run and handle accordingly.
- Prefer dynamic `import()` for `.js` modules in this ESM project. Avoid `require()` unless the local runtime explicitly supports it.

## Constraints

- Do NOT implement beyond Story 1 scope. Only project CRUD + sidebar rendering.
- Do NOT implement session creation, chat, tabs, or ACP integration.
- Do NOT modify files outside the specified list.
- Do NOT modify test files in Green. Red tests are the contract and must remain unchanged.
- Before implementation starts, run `bun run guard:test-baseline-record`.
- WebSocket handlers for `session:*` messages should remain as the default case (return "not implemented" error).
- Use `crypto.randomUUID()` for project IDs (Bun supports this natively).
- Use `Bun.file(path).exists()` for directory validation.
- Keep `writeDebounceMs: 0` in tests for immediate persistence.
- Sidebar is vanilla JS -- no TypeScript, no build step.

## If Blocked or Uncertain

- Resolve normal ambiguities using the feature spec + tech design as source of truth and continue.
- If the test environment (DOM globals, module resolution) needs setup, implement the minimal reliable setup in tests and proceed.
- Ask only for true blockers that cannot be resolved from local context.

## Verification

```bash
# Before implementation starts, record the test-change baseline
bun run guard:test-baseline-record

# Server tests (5) must pass
bun run test

# Client tests (4) must pass
bun run test:client

# Expected: all tests pass across both suites

# Typecheck must still pass
bun run typecheck
# Expected: Exit code 0, no errors

# Green quality gate (verify + fail if new test-file changes appear after baseline)
bun run green-verify
```

## Done When

- [ ] `server/projects/project-store.ts` has full CRUD implementation (no more `NotImplementedError`)
- [ ] `server/websocket.ts` routes `project:add`, `project:remove`, `project:list` messages
- [ ] `server/index.ts` wires `ProjectStore` into `handleWebSocket` deps
- [ ] `client/shell/sidebar.js` renders projects, handles add/remove/collapse
- [ ] All server tests pass (`bun run test`) and all client tests pass (`bun run test:client`)
- [ ] `bun run green-verify` passes
- [ ] No new test-file changes beyond the recorded baseline
- [ ] No regressions (there are no prior tests to regress)
