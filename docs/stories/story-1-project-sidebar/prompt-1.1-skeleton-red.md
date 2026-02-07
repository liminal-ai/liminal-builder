# Prompt 1.1: TDD Red -- Project Sidebar Test Skeletons

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. Stack: Bun + Fastify server, vanilla HTML/JS client, WebSocket bridge.

This is Story 1: Project Sidebar, which implements project directory management (AC-1.1 through AC-1.4). The sidebar displays configured project directories as collapsible groups. Users can add/remove projects, collapse/expand folders, and the state persists.

This is the TDD Red phase. You are writing 9 test cases across 2 test files. The new tests should fail meaningfully against current stubs/unimplemented behavior. You are NOT implementing anything in this phase -- only writing tests.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- Story 0 complete: all infrastructure files exist
- `server/errors.ts` -- contains `NotImplementedError`, `AppError`
- `server/store/json-store.ts` -- fully implemented
- `server/projects/project-types.ts` -- `Project` interface
- `server/projects/project-store.ts` -- `ProjectStore` class with stub methods
- `client/shell/sidebar.js` -- stub
- `client/shared/constants.js` -- `STORAGE_KEYS`
- `tests/fixtures/projects.ts` -- mock data
- `shared/types.ts` -- `ClientMessage`, `ServerMessage`

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 1, TC Mapping, Low Altitude: ProjectStore)
- Feature Spec: `docs/feature-spec-mvp.md` (AC-1.1 through AC-1.4)

### Key Type Definitions (inlined from tech design)

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
export class NotImplementedError extends Error {
  constructor(methodName: string) {
    super(`Not implemented: ${methodName}`);
    this.name = 'NotImplementedError';
  }
}

export class AppError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}
```

```typescript
// server/projects/project-store.ts (current stubs)
export class ProjectStore {
  constructor(store: JsonStore<Project[]>) { ... }
  async addProject(path: string): Promise<Project> { throw new NotImplementedError('ProjectStore.addProject'); }
  async removeProject(projectId: string): Promise<void> { throw new NotImplementedError('ProjectStore.removeProject'); }
  async listProjects(): Promise<Project[]> { throw new NotImplementedError('ProjectStore.listProjects'); }
}
```

```typescript
// server/store/json-store.ts (already implemented)
export class JsonStore<T> {
  constructor(config: StoreConfig, defaultData: T);
  async read(): Promise<T>;
  async write(data: T): Promise<void>;
  async writeSync(data: T): Promise<void>;
}

// server/store/store-types.ts
export interface StoreConfig {
  filePath: string;
  writeDebounceMs: number;
}
```

### Acceptance Criteria (inlined from feature spec)

**AC-1.1:** Sidebar displays all configured project directories as collapsible groups
- **TC-1.1a:** Projects display in insertion order (ProjectA first, then ProjectB)
- **TC-1.1b:** Empty state on first run -- sidebar shows prompt to add a project

**AC-1.2:** User can add a project directory to the sidebar
- **TC-1.2a:** Add valid directory -- project appears in sidebar with ID
- **TC-1.2b:** Add invalid directory -- error message, project not added
- **TC-1.2c:** Cancel add project -- no WebSocket message sent, sidebar unchanged
- **TC-1.2d:** Add duplicate directory -- "Project already added" error, no duplicate

**AC-1.3:** User can remove a project from the sidebar
- **TC-1.3a:** Remove project -- disappears from sidebar, session mappings retained

**AC-1.4:** Project folders are collapsible
- **TC-1.4a:** Collapse hides sessions -- only project name visible
- **TC-1.4b:** Collapse state persists across app restart (localStorage)

## Task

### Files to Create

1. **`tests/server/project-store.test.ts`** -- 5 tests (TC-1.1a, TC-1.2a, TC-1.2b, TC-1.2d, TC-1.3a)
2. **`tests/client/sidebar.test.ts`** -- 4 tests (TC-1.1b, TC-1.2c, TC-1.4a, TC-1.4b)

### Implementation Requirements

#### File 1: `tests/server/project-store.test.ts`

This tests `ProjectStore` methods directly. Use a real `JsonStore` instance pointed at a temp file, so persistence is tested too. Use real temp directories for valid-path cases and a missing temp subdirectory for invalid-path cases so tests stay aligned with `fs/promises.stat` directory validation. Each test should use a fresh temp file to avoid state leakage between tests.

```typescript
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { ProjectStore } from '../../server/projects/project-store';
import { JsonStore } from '../../server/store/json-store';
import type { Project } from '../../server/projects/project-types';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ProjectStore', () => {
  let store: JsonStore<Project[]>;
  let projectStore: ProjectStore;
  let tempDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'liminal-test-'));
    const filePath = join(tempDir, 'projects.json');
    store = new JsonStore<Project[]>({ filePath, writeDebounceMs: 0 }, []);
    projectStore = new ProjectStore(store);
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('TC-1.1a: projects returned in insertion order', async () => {
    // Setup: Add two projects in order
    // Use real temp directories for valid paths (created in test setup)
    // For now, stubs will throw NotImplementedError

    const projectA = await projectStore.addProject('/Users/test/code/project-alpha');
    const projectB = await projectStore.addProject('/Users/test/code/project-beta');

    const projects = await projectStore.listProjects();

    // Assert: returned in insertion order (A before B)
    expect(projects).toHaveLength(2);
    expect(projects[0].path).toBe('/Users/test/code/project-alpha');
    expect(projects[1].path).toBe('/Users/test/code/project-beta');
    expect(projects[0].name).toBe('project-alpha');
    expect(projects[1].name).toBe('project-beta');
  });

  test('TC-1.2a: add valid directory creates project', async () => {
    // Setup: Path exists on filesystem (will need mock in Green phase)
    const project = await projectStore.addProject('/Users/test/code/my-app');

    // Assert: Project returned with all required fields
    expect(project.id).toBeDefined();
    expect(typeof project.id).toBe('string');
    expect(project.id.length).toBeGreaterThan(0);
    expect(project.path).toBe('/Users/test/code/my-app');
    expect(project.name).toBe('my-app');
    expect(project.addedAt).toBeDefined();
    // addedAt should be a valid ISO 8601 string
    expect(new Date(project.addedAt).toISOString()).toBe(project.addedAt);
  });

  test('TC-1.2b: add nonexistent directory throws', async () => {
    // Setup: Path does NOT exist on filesystem
    // In Green phase, the path check will be mocked to return false

    // Assert: Throws an error for invalid path
    await expect(
      projectStore.addProject('/Users/test/code/does-not-exist')
    ).rejects.toThrow();
  });

  test('TC-1.2d: add duplicate directory throws', async () => {
    // Setup: Add a project, then try to add the same path again
    await projectStore.addProject('/Users/test/code/my-app');

    // Assert: Second add throws a duplicate error
    await expect(
      projectStore.addProject('/Users/test/code/my-app')
    ).rejects.toThrow(/already added|duplicate/i);
  });

  test('TC-1.3a: remove project retains session mappings', async () => {
    // Setup: Add a project, then remove it
    const project = await projectStore.addProject('/Users/test/code/my-app');
    await projectStore.removeProject(project.id);

    // Assert: Project is no longer in the list
    const projects = await projectStore.listProjects();
    expect(projects).toHaveLength(0);

    // Note: Session mappings are in a separate file (sessions.json)
    // managed by SessionManager. Removing a project from project-store
    // does NOT touch session data. This is validated by the fact that
    // project-store has no dependency on session-manager.
    // The full "re-add and sessions reappear" flow is tested in Story 4.
  });
});
```

#### File 2: `tests/client/sidebar.test.ts`

This tests the sidebar DOM rendering using jsdom. Since the sidebar module (`client/shell/sidebar.js`) is vanilla JS that manipulates the DOM, we need to set up a minimal DOM environment.

The sidebar module will export functions that:
- Render a project list into `#project-list`
- Handle add project button click
- Handle collapse/expand with localStorage persistence

For jsdom testing, we simulate the DOM and mock the WebSocket `sendMessage` function.

```typescript
import { describe, test, expect, beforeEach } from 'bun:test';

// Minimal DOM setup for client-side testing
function setupDOM() {
  // Create a minimal document structure matching client/shell/index.html
  document.body.innerHTML = `
    <div id="app" class="shell-layout">
      <aside id="sidebar" class="sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-title">Liminal Builder</h1>
        </div>
        <div id="project-list" class="project-list"></div>
        <div class="sidebar-footer">
          <button id="add-project-btn" class="btn btn-primary">+ Add Project</button>
        </div>
      </aside>
    </div>
  `;
}

// Mock WebSocket send function
let sentMessages: object[] = [];
function mockSendMessage(msg: object) {
  sentMessages.push(msg);
}

describe('Sidebar', () => {
  beforeEach(() => {
    setupDOM();
    sentMessages = [];
    // Clear localStorage
    localStorage.clear();
  });

  test('TC-1.1b: empty state prompt rendered when no projects', async () => {
    // Setup: No projects configured
    // Import sidebar module and call render with empty project list
    // The sidebar should render an empty state message in #project-list

    // We need to dynamically import the sidebar module.
    // Since sidebar.js is not yet implemented (stub), this will need
    // the module to export a renderProjects function.
    //
    // For the Red phase, we import and call the function.
    // It will throw NotImplementedError or the DOM won't have the expected content.

    const { renderProjects } = await import('../../client/shell/sidebar.js');
    renderProjects([], mockSendMessage);

    const projectList = document.getElementById('project-list')!;
    const emptyState = projectList.querySelector('.empty-state');

    expect(emptyState).not.toBeNull();
    expect(emptyState!.textContent).toMatch(/add a project/i);
  });

  test('TC-1.2c: cancel add project sends no WebSocket message', async () => {
    // Setup: Import sidebar, simulate opening add dialog then cancelling

    const { renderProjects, handleAddProject } = await import('../../client/shell/sidebar.js');
    renderProjects([], mockSendMessage);

    // Simulate: user clicks add, then cancels (provides empty/null path)
    handleAddProject(null, mockSendMessage);

    // Assert: No WebSocket message was sent
    expect(sentMessages).toHaveLength(0);
  });

  test('TC-1.4a: collapse hides sessions', async () => {
    // Setup: Render projects with sessions, then click collapse

    const { renderProjects, toggleCollapse } = await import('../../client/shell/sidebar.js');

    const mockProjects = [
      { id: 'proj-1', path: '/test/alpha', name: 'alpha', addedAt: '2026-01-15T10:00:00.000Z' }
    ];

    const mockSessions = [
      { id: 'claude-code:s1', title: 'Session 1', lastActiveAt: '2026-01-15T14:00:00.000Z', cliType: 'claude-code' }
    ];

    renderProjects(mockProjects, mockSendMessage, { 'proj-1': mockSessions });

    // Assert: Sessions are visible before collapse
    const sessionList = document.querySelector('[data-project-id="proj-1"] .session-list');
    expect(sessionList).not.toBeNull();
    expect((sessionList as HTMLElement).hidden).toBe(false);

    // Act: Toggle collapse
    toggleCollapse('proj-1');

    // Assert: Sessions are hidden after collapse
    expect((sessionList as HTMLElement).hidden).toBe(true);
  });

  test('TC-1.4b: collapse state persists in localStorage across reload', async () => {
    // Setup: Set collapsed state in localStorage, then "reload" (re-render)

    const COLLAPSED_KEY = 'liminal:collapsed';

    // Simulate: user previously collapsed proj-1
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify({ 'proj-1': true }));

    const { renderProjects } = await import('../../client/shell/sidebar.js');

    const mockProjects = [
      { id: 'proj-1', path: '/test/alpha', name: 'alpha', addedAt: '2026-01-15T10:00:00.000Z' }
    ];

    const mockSessions = [
      { id: 'claude-code:s1', title: 'Session 1', lastActiveAt: '2026-01-15T14:00:00.000Z', cliType: 'claude-code' }
    ];

    // Act: Re-render (simulating app restart/reload)
    renderProjects(mockProjects, mockSendMessage, { 'proj-1': mockSessions });

    // Assert: Project is still collapsed (sessions hidden)
    const sessionList = document.querySelector('[data-project-id="proj-1"] .session-list');
    expect(sessionList).not.toBeNull();
    expect((sessionList as HTMLElement).hidden).toBe(true);
  });
});
```

**Important notes for the test file:**
- Import `client/shell/sidebar.js` with `await import(...)` from the TypeScript tests (ESM-safe in this repo).
- The sidebar module currently only exports `initSidebar()`. The tests expect it to also export: `renderProjects`, `handleAddProject`, `toggleCollapse`. These will be added in the Green phase. During Red, the imports will fail or throw.
- `localStorage` and `document` are available via Bun's built-in jsdom support (or we configure the test environment). If Bun's test runner doesn't provide DOM globals by default, we'll need to set `jsdom` in the test's environment config. This may require adding `"dom"` to the environment or using a setup file. The tests should include a comment noting this requirement.

## Constraints

- Do NOT implement any production code. Only write test files.
- Do NOT modify `server/projects/project-store.ts`, `server/websocket.ts`, or `client/shell/sidebar.js`.
- Do NOT modify any other existing files.
- Tests MUST include the TC ID in the test name (e.g., `TC-1.1a: ...`).
- Each test must be independent -- no shared mutable state between tests.
- Use real `JsonStore` instances with temp files for server tests (not mocked stores).
- Clean up temp files in `afterEach`.

## If Blocked or Uncertain

- If Bun's test runner doesn't support DOM globals (`document`, `localStorage`) out of the box, add a note about what configuration is needed, and use a setup function within the test file to polyfill minimally.
- If the sidebar module import path doesn't resolve, keep ESM import semantics (`await import(...)`) and correct the relative path.
- If you encounter inconsistencies, resolve straightforward cases using the feature spec + tech design as source of truth; ask only for true blockers.

## Verification

```bash
bun test
```

**Expected output:**
- 9 tests run
- New Story 1 tests should fail against current stubs/unimplemented behavior (exact error shape may vary)
- The new Story 1 tests should fail meaningfully against current stubs; exact pass/fail split is less important than asserting intended behavior.

The specific expected outcome:
- `tests/server/project-store.test.ts`: 5 tests should fail against unimplemented stubs
- `tests/client/sidebar.test.ts`: 4 tests should fail until sidebar behavior is implemented

```bash
bun run typecheck
```

**Expected:** Still passes (test files should typecheck even though runtime will fail).

## Done When

- [ ] `tests/server/project-store.test.ts` exists with 5 tests (TC-1.1a, TC-1.2a, TC-1.2b, TC-1.2d, TC-1.3a)
- [ ] `tests/client/sidebar.test.ts` exists with 4 tests (TC-1.1b, TC-1.2c, TC-1.4a, TC-1.4b)
- [ ] `bun test` runs all 9 tests
- [ ] New Story 1 tests fail against current stubs, with clear assertions for Green
- [ ] `bun run typecheck` still passes
- [ ] No production code was modified
