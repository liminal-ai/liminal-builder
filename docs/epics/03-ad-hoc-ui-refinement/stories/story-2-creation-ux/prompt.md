# Story 2: Project and Session Creation UX — Pairing Session Prompt

## Project Context

**Liminal Builder** is an agentic IDE that wraps multiple AI coding CLIs (Claude Code via the Agent SDK, Codex via ACP/JSON-RPC) in a unified browser-based interface. The left sidebar shows projects with their sessions grouped underneath. Users add projects (local directories) and create sessions (Claude Code or Codex) within them.

**Architecture:** Bun + Fastify server, vanilla HTML/JS client (no framework). Shell/portlet model — main shell manages sidebar + WebSocket, each session is an iframe portlet. Server manages project and session metadata in JSON files at `~/.liminal-builder/`.

**Stack:** Bun runtime, Fastify 5, vanilla JS client, Tailwind + custom CSS theming (Tokyo Night / Codex Dark / Warm Minimal).

## What We're Working On

The project and session creation flows are rough first-pass implementations. These are the first interactions a user hits and they set the tone for the whole experience.

**Add Project:** Currently triggers a bare browser `window.prompt("Enter absolute directory path")` with no pre-fill, no validation feedback, no directory browsing. See `sidebar.js` line 124-127 and `handleAddProject()` at line 548.

**New Session:** A "New thread" button per project opens an inline CLI picker (`showCliPicker()` at line 468) with three buttons: "Claude Code" / "Codex" / "Cancel". Functional but visually crude — the picker just appears as raw buttons below the "New thread" button. Each option sends `{ type: "session:create", projectId, cliType }` to the server.

We want to make both feel lightweight, fast, and polished.

## Key Files

- `client/shell/sidebar.js` — **Primary file for this work.** Key functions:
  - `initSidebar()` (line 108) — binds the "Add Project" button click to `window.prompt()`
  - `renderProjects()` (line 280) — renders project groups, each with a "New thread" button
  - `showCliPicker(projectId)` (line 468) — creates/shows inline Claude Code / Codex / Cancel buttons
  - `hideCliPicker()` (line 535) — hides all CLI pickers
  - `handleAddProject(path, sendMessage)` (line 548) — validates and sends `project:add`
  - Note: sidebar.js imports `closeTab`, `hasTab`, `openShellTab` from tabs.js — Story 1 (Remove Tabs) will change these. This story should work on top of whatever replaces them, or coordinate.
- `client/shell/index.html` — Shell DOM. The sidebar footer has `<button id="add-project-btn">+ Add Project</button>` (line 22).
- `client/shell/shell.css` — Sidebar and picker styling. Existing classes: `.cli-picker`, `.cli-picker-option`, `.cli-picker-cancel`, `.new-session-btn`
- `client/shared/theme.css` — Theme tokens for colors, spacing, borders
- `server/websocket.ts` — Handles `project:add` (line 798) and `session:create` (line 851). Validates path is string, cliType is "claude-code" or "codex". Returns `project:added` or `session:created`.
- `server/projects/project-store.ts` — `addProject(path)` — validates path exists on disk, derives project name from directory basename
- `shared/types.ts` — `ClientMessage` types: `{ type: "project:add"; path: string }` and `{ type: "session:create"; projectId: string; cliType: CliType }`
- `tests/client/sidebar.test.ts` — Existing sidebar tests, will need updates

## Current UX Flow (Verified)

**Add Project:**
1. User clicks "+ Add Project" button in sidebar footer
2. Browser `window.prompt()` appears with text "Enter absolute directory path"
3. User types a path and clicks OK
4. `handleAddProject()` trims and validates non-empty, sends `project:add`
5. Server validates path exists, creates project entry, responds with `project:added`
6. Sidebar re-renders with new project group

**New Session:**
1. User clicks "New thread" button under a project
2. `showCliPicker(projectId)` renders an inline div with three buttons below the "New thread" button
3. User clicks "Claude Code" or "Codex"
4. Sends `session:create` with projectId and cliType
5. Server creates session, responds with `session:created`
6. Sidebar adds session to list, shell opens tab/iframe for it

## Things to Consider

- **Replace `window.prompt()` for Add Project:** Needs an inline input or modal. The question is what to pre-populate. The server has no "suggest directories" endpoint, and the browser can't access the filesystem for a directory picker. Options: empty input with placeholder text, or a new server endpoint that returns the CWD or recently-used paths. [OPEN: what's the right pre-fill strategy? Discuss in session.]
- **CLI picker refinement:** The current inline three-button picker works mechanically but looks like an afterthought. Options range from styling it better in place, to a small dropdown/popover, to a single "New session" action that defaults to one CLI with an option to switch. [OPEN: what's the right interaction pattern? The Codex app just has "New thread" with no CLI choice since it's single-CLI. Liminal needs the choice but it should be lightweight.]
- **Sequencing with Story 1:** sidebar.js directly imports from tabs.js (`openShellTab`, `hasTab`, `closeTab`). If Story 1 runs first, those imports change. If this story runs first, it needs to work with the existing tab API. Either way, be aware of the dependency.
- **Server-side validation feedback:** Currently `handleAddProject` does no client-side validation beyond non-empty string. The server validates the path exists on disk. If it fails, the error comes back as a generic error message. Could improve with inline validation or at least a visible error state.
- **This is vanilla JS** — no React/Vue component library. Modals, popovers, inputs need to be built with DOM APIs. Keep it simple.

## Confidence Notes

What's verified (read the code):
- `window.prompt()` is the add-project interaction — confirmed at sidebar.js line 125.
- "New thread" → `showCliPicker()` → three inline buttons — confirmed at lines 349-353 and 468-532.
- sidebar.js imports from tabs.js — confirmed at lines 1-6: `closeTab`, `hasTab`, `openShellTab`.
- Session click handler calls `openShellTab()` directly — confirmed at line 409.
- Server `project:add` handler validates path and returns `project:added` — confirmed in websocket.ts line 798.
- Server `session:create` validates cliType is "claude-code" or "codex" — confirmed in websocket.ts line 599-602.

What needs verification in session:
- Whether shell.css has any existing modal or popover patterns to build on, or if this is greenfield UI. (~70% confident it's greenfield — I didn't see modal CSS but didn't exhaustively search.)
- Whether `project-store.ts` returns useful error messages on path validation failure, or just throws generic errors. (~60% confident it throws — needs a read.)
- Whether sidebar.test.ts tests the `showCliPicker` / `handleAddProject` paths specifically, or just project list rendering. (Didn't read the test file.)

## Session Style

This is an interactive pairing session. We'll discuss approaches, prototype inline, and iterate on the UX together. The user has strong product opinions and will guide direction — bring implementation ideas and flag tradeoffs.
