# Prompt 1.R: Story 1 Verification

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. Stack: Bun + Fastify server, vanilla HTML/JS client, WebSocket bridge. CLIs: Claude Code and Codex via ACP protocol (JSON-RPC over stdio).

This is the verification prompt for Story 1: Project Sidebar. All implementation should be complete: ProjectStore has full CRUD, WebSocket routes `project:*` messages, sidebar renders projects with add/remove/collapse. Nine tests should pass.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- Story 0 verified: infrastructure in place
- `prompt-1.1-skeleton-red.md` complete: 9 tests written
- `prompt-1.2-green.md` complete: implementation done
- Files modified:
  - `server/projects/project-store.ts` -- full CRUD
  - `server/websocket.ts` -- project message handlers
  - `server/index.ts` -- ProjectStore wiring
  - `client/shell/sidebar.js` -- full rendering
  - `tests/server/project-store.test.ts` -- 5 tests
  - `tests/client/sidebar.test.ts` -- 4 tests

## Reference Documents
(For human traceability)
- Tech Design: `docs/tech-design-mvp.md` (Flow 1, Story 1 breakdown)
- Feature Spec: `docs/feature-spec-mvp.md` (AC-1.1 through AC-1.4)

## Task

Run all verification checks for Story 1. Fix any issues found.

### Verification Steps

#### Step 1: All Tests Pass

```bash
bun run test && bun run test:client
```

**Expected:**
- `tests/server/project-store.test.ts`: 5 tests PASS
  - TC-1.1a: projects returned in insertion order
  - TC-1.2a: add valid directory creates project
  - TC-1.2b: add nonexistent directory throws
  - TC-1.2d: add duplicate directory throws
  - TC-1.3a: removeProject deletes project (session data untouched -- verified by store separation, full re-add flow in Story 4)
- `tests/client/sidebar.test.ts`: 4 tests PASS
  - TC-1.1b: empty state prompt rendered when no projects
  - TC-1.2c: cancel add project sends no WebSocket message
  - TC-1.4a: collapse hides sessions
  - TC-1.4b: collapse state persists in localStorage across reload

**Total: 9 pass, 0 fail (5 server + 4 client)**

If any tests fail, investigate and fix. Common issues:
- Path validation in project-store tests (need real directories or proper mocking)
- DOM globals not available in sidebar tests (need jsdom/happy-dom setup)
- Module import resolution for `.js` files from TypeScript tests

#### Step 2: TypeScript Typecheck

```bash
bun run typecheck
```

**Expected:** Exit code 0, no errors.

If there are type errors:
- Check that `websocket.ts` types align with `shared/types.ts`
- Check that `project-store.ts` imports are correct
- Check that `index.ts` properly types the `WebSocketDeps` parameter

#### Step 3: Primary Quality Gate

```bash
bun run verify
```

**Expected:** Exit code 0. This is the primary quality gate and runs:
- format check
- biome lint
- eslint (`lint:eslint`)
- eslint-plugin tests (`test:eslint-plugin`)
- typecheck
- Vitest-backed `bun run test`

#### Step 4: Explicit Server + Client Test Execution

Run both suites directly to verify coverage across project boundaries:

```bash
bun run test
bun run test:client
```

**Expected:**
- `tests/server/project-store.test.ts`: 5 PASS
- `tests/client/sidebar.test.ts`: 4 PASS

#### Step 5: No Regressions on Story 0

There are no Story 0 tests (Story 0 had zero tests). But verify that Story 0 infrastructure still works:

```bash
# Server starts
bun run start &
SERVER_PID=$!
sleep 2

# Shell page served
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/shell/index.html)
echo "Shell HTML status: $HTTP_CODE"
# Expected: 200

# WebSocket endpoint
WS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:3000/ws)
echo "WebSocket status: $WS_CODE"
# Expected: 101

kill $SERVER_PID
```

#### Step 6: ProjectStore Integration Check

Verify the ProjectStore works end-to-end with a real JSON store:

```bash
bun eval '
import { JsonStore } from "./server/store/json-store";
import { ProjectStore } from "./server/projects/project-store";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tempDir = mkdtempSync(join(tmpdir(), "liminal-verify-"));
const storeFile = join(tempDir, "projects.json");
const projectDir = join(tempDir, "my-project");
mkdirSync(projectDir);

const jsonStore = new JsonStore({ filePath: storeFile, writeDebounceMs: 0 }, []);
const store = new ProjectStore(jsonStore);

// Add
const project = await store.addProject(projectDir);
console.log("Add project:", project.name === "my-project" ? "PASS" : "FAIL");

// List
const projects = await store.listProjects();
console.log("List projects:", projects.length === 1 ? "PASS" : "FAIL");

// Duplicate detection
try {
  await store.addProject(projectDir);
  console.log("Duplicate check: FAIL (no error)");
} catch (e) {
  console.log("Duplicate check:", /already added|duplicate/i.test(e.message) ? "PASS" : "FAIL");
}

// Remove
await store.removeProject(project.id);
const afterRemove = await store.listProjects();
console.log("Remove project:", afterRemove.length === 0 ? "PASS" : "FAIL");

// Invalid path
try {
  await store.addProject(join(tempDir, "nonexistent"));
  console.log("Invalid path: FAIL (no error)");
} catch (e) {
  console.log("Invalid path: PASS");
}

rmSync(tempDir, { recursive: true, force: true });
'
```

**Expected:** All 5 checks print `PASS`.

#### Step 7: Sidebar Module Exports Check

Verify the sidebar module exports the expected functions:

```bash
bun eval '
const sidebar = await import("./client/shell/sidebar.js");
const exports = ["initSidebar", "renderProjects", "handleAddProject", "toggleCollapse"];
const results = exports.map(name => {
  const exists = typeof sidebar[name] === "function";
  return `${name}: ${exists ? "PASS" : "FAIL"}`;
});
results.forEach(r => console.log(r));
'
```

**Expected:** All 4 print `PASS`.

### Manual Smoke Test Checklist

Start the server and test in a browser:

```bash
bun run dev
# Open http://localhost:3000/shell/index.html in browser
```

- [ ] **Empty state:** On first run (no `~/.liminal-builder/projects.json`), sidebar shows "Add a project to get started"
- [ ] **Add project:** Click "Add Project" button, enter a valid directory path (e.g., the project's own directory `/Users/leemoore/code/liminal-builder`), project appears in sidebar
- [ ] **Project name:** Displayed name is the directory basename (e.g., `liminal-builder`)
- [ ] **Add invalid path:** Enter a nonexistent path, error is shown (check browser console for error response)
- [ ] **Add duplicate:** Try adding the same path again, error about "already added"
- [ ] **Remove project:** Click the remove button (x), project disappears from sidebar
- [ ] **Collapse/expand:** Click the collapse toggle on a project, sessions hide/show
- [ ] **Collapse persists:** Collapse a project, refresh the page, project is still collapsed
- [ ] **Multiple projects:** Add two projects, they appear in the order added
- [ ] **Browser console:** No JavaScript errors (other than expected "not implemented" for non-project messages)
- [ ] **Server console:** Shows `[ws] Received: project:add` and `[ws] Received: project:list` messages

## Constraints

- Do NOT create new files unless fixing a missing file
- Do NOT implement beyond Story 1 scope
- Only fix issues that are directly related to Story 1 functionality
- If tests need adjustment to pass, the adjustments should be minimal and well-justified

## If Blocked or Uncertain

- Resolve straightforward inconsistencies against feature spec + tech design and continue.
- Surface any assumptions you made in the verification summary.
- Ask only when blocked by missing local context.

## Verification

All steps above pass:

1. `bun run test && bun run test:client` -- all tests pass, 0 fail
2. `bun run typecheck` -- exit code 0
3. `bun run verify` -- exit code 0
4. `bun run test` and `bun run test:client` -- both pass independently
5. Server starts and serves shell HTML (HTTP 200), WebSocket connects (HTTP 101)
6. ProjectStore integration check -- 5/5 PASS
7. Sidebar module exports -- 4/4 PASS

## Done When

- [ ] All tests pass (`bun run test && bun run test:client`)
- [ ] `bun run verify` passes
- [ ] Server starts and serves content correctly
- [ ] ProjectStore integration works (add, list, duplicate, remove, invalid path)
- [ ] Sidebar module exports all required functions
- [ ] Manual smoke test items checked (if browser available)
- [ ] No regressions on Story 0 infrastructure
