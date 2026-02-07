# Prompt 0.R: Infrastructure Verification

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs. Stack: Bun + Fastify server, vanilla HTML/JS client, WebSocket bridge. CLIs: Claude Code and Codex via ACP protocol (JSON-RPC over stdio).

This is the verification prompt for Story 0: Infrastructure & Project Skeleton. All scaffolding files should already exist. This prompt validates that the infrastructure works: TypeScript compiles, the server starts, static files are served, and the WebSocket endpoint connects.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- All files from `prompt-0.1-setup.md` have been created
- `bun install` has been run

## Reference Documents
(For human traceability)
- Tech Design: `docs/tech-design-mvp.md` (Story 0 breakdown, lines ~1855-1907)

## Task

Run all verification checks for Story 0. Fix any issues found.

### Verification Steps

#### Step 1: Confirm File Structure

Verify these directories and key files exist:

```
server/
  errors.ts
  index.ts
  websocket.ts
  store/json-store.ts
  store/store-types.ts
  projects/project-types.ts
  projects/project-store.ts
  sessions/session-types.ts
  sessions/session-manager.ts
  acp/acp-types.ts
  acp/acp-client.ts
  acp/agent-manager.ts
shared/
  types.ts
client/
  shell/index.html
  shell/shell.js
  shell/sidebar.js
  shell/tabs.js
  shell/shell.css
  portlet/index.html
  portlet/portlet.js
  portlet/chat.js
  portlet/input.js
  portlet/portlet.css
  shared/theme.css
  shared/markdown.js
  shared/constants.js
tests/
  fixtures/projects.ts
  fixtures/sessions.ts
  fixtures/acp-messages.ts
package.json
tsconfig.json
```

Run: `find server shared client tests -type f | sort` and compare against the list above.

#### Step 2: Verification Script

```bash
bun run verify
```

**Expected:** Exit code 0, no errors.

If there are errors, fix them. Common issues:
- Missing imports
- Type mismatches between `shared/types.ts` and server types
- `@fastify/websocket` type issues (may need `WebSocket` import adjustment)

#### Step 3: Server Starts

```bash
# Start the server in the background
bun run start &
SERVER_PID=$!
sleep 2

# Check it's running
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/shell/index.html
# Expected: 200

# Kill the server
kill $SERVER_PID
```

**Expected:** Server starts without errors, shell HTML is served with HTTP 200.

#### Step 4: Shell HTML Content

```bash
bun run start &
SERVER_PID=$!
sleep 2

curl -s http://localhost:3000/shell/index.html | head -3
# Expected output should include: <!DOCTYPE html>

kill $SERVER_PID
```

#### Step 5: WebSocket Connects

```bash
bun run start &
SERVER_PID=$!
sleep 2

# Test WebSocket endpoint responds (using a simple HTTP upgrade check)
curl -s -o /dev/null -w "%{http_code}" \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:3000/ws
# Expected: 101 (Switching Protocols)

kill $SERVER_PID
```

#### Step 6: Stub Methods Throw NotImplementedError

Create a quick verification script and run it:

```bash
bun eval '
import { ProjectStore } from "./server/projects/project-store";
import { JsonStore } from "./server/store/json-store";

const store = new JsonStore({ filePath: "/tmp/test.json", writeDebounceMs: 500 }, []);
const ps = new ProjectStore(store);

try {
  await ps.addProject("/test");
  console.log("FAIL: addProject did not throw");
} catch (e) {
  if (e.name === "NotImplementedError") {
    console.log("PASS: addProject throws NotImplementedError");
  } else {
    console.log("FAIL: addProject threw wrong error:", e.message);
  }
}

try {
  await ps.listProjects();
  console.log("FAIL: listProjects did not throw");
} catch (e) {
  if (e.name === "NotImplementedError") {
    console.log("PASS: listProjects throws NotImplementedError");
  } else {
    console.log("FAIL: listProjects threw wrong error:", e.message);
  }
}
'
```

**Expected:** Both print `PASS`.

#### Step 7: JsonStore Works (Infrastructure Validation)

```bash
bun eval '
import { JsonStore } from "./server/store/json-store";
import { unlinkSync } from "fs";

const testFile = "/tmp/liminal-test-jsonstore.json";

// Cleanup
try { unlinkSync(testFile); } catch {}

const store = new JsonStore({ filePath: testFile, writeDebounceMs: 50 }, []);

// Test 1: Read returns default when file missing
const data1 = await store.read();
console.log("read default:", JSON.stringify(data1) === "[]" ? "PASS" : "FAIL");

// Test 2: writeSync persists immediately
await store.writeSync([{ id: "test" }]);
const data2 = await store.read();
console.log("writeSync:", data2.length === 1 ? "PASS" : "FAIL");

// Cleanup
try { unlinkSync(testFile); } catch {}
'
```

**Expected:** Both print `PASS`.

### Manual Smoke Test Checklist

If you have access to a browser:

- [ ] Open `http://localhost:3000/shell/index.html`
- [ ] Page renders with dark theme (Tokyo Night)
- [ ] Sidebar is visible on the left with "Liminal Builder" header
- [ ] "Add Project" button is visible at the bottom of the sidebar
- [ ] Main area shows empty state message
- [ ] Browser console shows `[shell] WebSocket connected`
- [ ] Browser console shows `[sidebar] Initialized (stub)` and `[tabs] Initialized (stub)`

## Constraints

- Do NOT create new files unless fixing a missing file from the setup prompt
- Do NOT implement business logic -- only fix infrastructure issues
- Do NOT modify files outside of what's needed to pass verification
- If you need to fix type errors, keep fixes minimal and aligned with the tech design interfaces

## If Blocked or Uncertain

- Resolve straightforward inconsistencies against feature spec + tech design and continue.
- Surface any assumptions you made in the verification summary.
- Ask only when blocked by missing local context.

## Verification

All 7 steps above pass. Specifically:

1. All files exist in the correct locations
2. `bun run verify` exits with code 0
3. Server starts and serves shell HTML (HTTP 200)
4. Shell HTML contains the expected content
5. WebSocket endpoint accepts connections (HTTP 101)
6. Stub methods throw `NotImplementedError`
7. `JsonStore` read/write operations work correctly

## Done When

- [ ] File structure matches the expected layout
- [ ] `bun run verify` passes with zero errors
- [ ] Server starts on port 3000
- [ ] Shell HTML is served correctly
- [ ] WebSocket endpoint is functional
- [ ] All stubs throw `NotImplementedError`
- [ ] `JsonStore` reads/writes correctly
- [ ] `bun run verify-all` runs successfully (integration/e2e may be placeholder/no-op in Story 0)
- [ ] No regressions introduced (though there are no prior tests to break)
