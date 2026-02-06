# Feature: Liminal Builder MVP — Project Sessions & Agent Chat

This specification defines the complete requirements for the Liminal Builder MVP: an organized, session-based interface for parallel AI-assisted development across multiple projects and CLI agents. It serves as the source of truth for the Tech Lead's design work.

---

## User Profile

**Primary User:** Solo developer running parallel agentic coding workflows
**Context:** Working across multiple project directories simultaneously, using AI coding CLIs (Claude Code, Codex) to build features, debug, and iterate — often with several conversations in flight at once
**Mental Model:** "I have projects. Each project has conversations with AI agents. I want to see them all, switch between them instantly, and never lose track of where things are."
**Key Constraint:** This is a local tool — all CLIs run as local processes, no cloud dependencies. Speed of switching between sessions is the core ergonomic win.

---

## Feature Overview

Today, developers using AI coding CLIs manage sessions through scattered terminal windows or tabs. There's no unified view of which projects have active conversations, no way to quickly scan session history across projects, and switching between sessions means hunting through terminal tabs.

After this feature ships, the developer opens Liminal Builder and sees all their projects in a sidebar, with agent sessions listed under each. They click a session to open it in the main area with a tab. They can have multiple sessions tabbed, switch between them instantly, and start new conversations with any supported CLI — all from one interface. The friction of managing parallel agentic workflows drops from "hunt through terminals" to "click the session."

---

## Scope

### In Scope

The MVP delivers organized session management and chat interaction for local AI coding CLIs:

- Project directory sidebar with collapsible session lists
- Chat interface that renders agent responses as structured messages (user turns, assistant turns, tool calls)
- Tab bar for keeping multiple sessions open with instant switching
- Tab reordering via drag-and-drop
- Support for Claude Code and Codex CLI agents
- New session creation with CLI type selection
- Session persistence (sessions survive app restart)
- Cancel/interrupt a running agent response

### Out of Scope

- Gemini, Cursor, or Copilot CLI support (planned post-MVP)
- Project console / terminal panel (planned post-MVP)
- Cloud sync or multi-device support
- File editing or code viewing
- Git integration
- Authentication (single-user local tool)
- Plugin or extension system
- Session deletion (PRD mentions "archive/delete" — MVP implements archive only; delete is post-MVP)
- Session search or filtering
- Session history pagination or virtualization (revisit if performance degrades with long histories)
- Tool call approval/denial controls (tool calls are display-only — agents execute independently; this app is a viewer, not an execution gate)
- Keyboard shortcuts (planned post-MVP: Cmd+W close tab, Cmd+1-9 tab switching, Cmd+N new session)
- Multi-browser-tab usage (app is designed for a single browser tab; behavior with multiple tabs is undefined)

### Assumptions

| ID | Assumption | Status | Notes |
|----|------------|--------|-------|
| A1 | ACP adapters exist for Claude Code and Codex CLI | Validated | claude-code-acp on GitHub; codex adapter in Zed codebase |
| A2 | ACP protocol supports resuming past sessions (via session/load replay) | Validated | No session/list method exists — session listing is local. Resuming works via session/load replay of history. |
| A3 | A single ACP agent process can serve multiple concurrent sessions | Validated | ACP spec confirms multi-session per connection |
| A4 | Bun can spawn and manage child processes with stdio piping | Validated | Bun.spawn supports stdin/stdout piping |
| A5 | All CLIs run in OAuth mode (using existing user subscriptions), not API key mode | Unvalidated | Verify that ACP adapters support OAuth token passthrough |

---

## Persistence Authority Model

The app wraps external agents that own their own data. This section defines what Liminal Builder stores locally vs. what it delegates to the ACP agents.

**Liminal Builder owns (local storage):**
- Project list (which directories are configured)
- Project UI state (collapsed/expanded)
- Session-to-project mapping (`{sessionId → projectId}`)
- Session metadata overlay (archived state, tab order)
- Session titles (derived from first user message; "New Session" as placeholder until first message)
- Session timestamps (lastActiveAt updated on message send/receive, createdAt set on creation)
- Open tabs and active tab state

**ACP agents own:**
- Conversation history (message content, tool call results)

**On app restart:** Liminal Builder loads its local state (projects, session metadata, tab state). Session listing is entirely local — no agent queries needed. When a user opens a specific session, conversation history is loaded from the ACP agent via session/load replay. The agent remains the source of truth for conversation content; the app is the source of truth for everything else (which sessions exist, their titles, their timestamps, their organization).

**Session-to-project mapping:** When a new session is created, Liminal Builder records `{sessionId, projectId}` locally. The session is created with the project's directory path as the agent's working directory. This mapping persists independently of the agent.

**Orphan sessions:** If an ACP agent reports sessions that the app has no local mapping for (e.g., the user ran the CLI directly in a terminal), the app ignores them. Only sessions created through Liminal Builder appear in the sidebar. This keeps the UI predictable and avoids mapping ambiguity.

**Session ID uniqueness:** Session IDs are unique within each ACP agent (guaranteed by the protocol). The app prefixes session IDs with the CLI type internally (e.g., `claude-code:abc123`) to ensure global uniqueness across agent types. This prefixed form is the **canonical ID** used in all local storage, WebSocket messages, and session-to-project mappings. When communicating with an ACP agent, the app strips the prefix to obtain the raw ACP session ID.

---

## UI Architecture

Sessions render using the **shell/portlet (iframe) model**. Each open session is an iframe managed by the shell. The shell controls the sidebar, tab bar, and WebSocket connection. Session iframes render chat content independently.

This model provides natural isolation between sessions (each iframe is an independent DOM), trivial scroll position preservation on tab switch (the iframe stays alive when hidden), and aligns with the proven pattern from LiminalDB. The shell manages a single WebSocket connection to the Fastify server and relays messages to the appropriate session iframe via `postMessage`.

**Connection status** is per-CLI-type, not per-session. All sessions of the same CLI type share the same agent process and connection status. The shell derives per-session display status by combining the CLI-type connection status with session-specific state (e.g., a session being created shows "launching" even if the agent is "connected").

---

## Flows & Requirements

### 1. Project Directory Management

The sidebar is the primary navigation surface. It shows project directories as collapsible groups, similar to a file explorer's folder tree. Each project folder expands to reveal its agent sessions. The user manages which projects appear in the sidebar — adding directories they're actively working on and removing ones they're done with.

1. User opens Liminal Builder
2. System displays sidebar with previously configured projects (or empty state if first run)
3. User adds a project directory (via folder picker or path input)
4. System validates the directory exists and adds it to the sidebar
5. User can collapse/expand project folders to show/hide sessions
6. User can remove a project from the sidebar (does not delete files or sessions)

#### Acceptance Criteria

**AC-1.1:** Sidebar displays all configured project directories as collapsible groups

- **TC-1.1a: Projects display on app load in insertion order**
  - Given: User has previously added two project directories (ProjectA first, then ProjectB)
  - When: App loads
  - Then: Both projects appear in the sidebar with their directory names as labels, in the order they were added (ProjectA above ProjectB)
- **TC-1.1b: Empty state on first run**
  - Given: No projects have been configured
  - When: App loads
  - Then: Sidebar shows an empty state prompting the user to add a project

**AC-1.2:** User can add a project directory to the sidebar

- **TC-1.2a: Add valid directory**
  - Given: User initiates "add project"
  - When: User provides a valid directory path
  - Then: Project appears in sidebar, sessions for that directory are listed beneath it
- **TC-1.2b: Add invalid directory**
  - Given: User initiates "add project"
  - When: User provides a path that does not exist
  - Then: Error message is shown, project is not added
- **TC-1.2c: Cancel add project**
  - Given: User initiates "add project"
  - When: User cancels (closes picker or clears input)
  - Then: No project is added, sidebar returns to previous state
- **TC-1.2d: Add duplicate directory**
  - Given: A project with path `/Users/lee/code/myapp` is already in the sidebar
  - When: User tries to add the same path
  - Then: Error message "Project already added" is shown, no duplicate is created

**AC-1.3:** User can remove a project from the sidebar

- **TC-1.3a: Remove project**
  - Given: A project is in the sidebar
  - When: User removes the project
  - Then: Project disappears from sidebar; no files or session data are deleted. Local session-to-project mappings are retained. If the same directory is re-added later, previously mapped sessions reappear.
- **TC-1.3b: Remove project with open tabs**
  - Given: A project has sessions open in tabs
  - When: User removes the project
  - Then: Associated tabs are closed, project disappears from sidebar

**AC-1.4:** Project folders are collapsible

- **TC-1.4a: Collapse hides sessions**
  - Given: A project folder is expanded showing sessions
  - When: User clicks to collapse
  - Then: Sessions are hidden, only the project name is visible
- **TC-1.4b: Collapse state persists across app restart**
  - Given: User collapses a project folder
  - When: App is closed and reopened
  - Then: The folder remains collapsed

---

### 2. Session Browsing & Creation

Sessions are the core content unit — each represents a conversation with an AI agent in the context of a project directory. Sessions appear under their project in the sidebar, showing a title (derived locally from the first user message), a timestamp, and which CLI produced them.

Users browse sessions to find previous conversations and create new ones to start fresh work. Session lists are maintained entirely locally by Liminal Builder, which owns all session metadata (titles, timestamps, project mappings, archived state). Conversation content is loaded from ACP agents on demand.

1. User expands a project folder in the sidebar
2. System displays sessions for that project, sorted by most recent activity
3. User clicks "New Session" under a project
4. System presents CLI type selection (Claude Code or Codex)
5. User selects a CLI type
6. System creates a new session (with project directory as working directory) and opens it in the main area

#### Acceptance Criteria

**AC-2.1:** Sessions for a project are listed in the sidebar, sorted by most recent activity

- **TC-2.1a: Sessions display with metadata**
  - Given: A project has three sessions
  - When: User expands the project folder
  - Then: All three sessions are visible with title, relative timestamp (e.g., "2d", "1w"), and CLI type indicator
- **TC-2.1b: Most recent session appears first**
  - Given: A project has sessions with different last-active times
  - When: User expands the project folder
  - Then: Sessions are ordered by last activity, most recent at top
- **TC-2.1c: Project with no sessions**
  - Given: A newly added project with no sessions
  - When: User expands the project folder
  - Then: Empty state is shown with prompt to create a new session

**AC-2.2:** User can create a new session for a project

- **TC-2.2a: Create new session**
  - Given: A project is in the sidebar
  - When: User clicks "New Session" and selects "Claude Code"
  - Then: A new session opens in the main area, a tab appears, and the session appears in the sidebar under the project
- **TC-2.2b: CLI type selection**
  - Given: User clicks "New Session"
  - When: CLI selection is presented
  - Then: Available options are Claude Code and Codex (MVP scope)
- **TC-2.2c: Cancel CLI selection**
  - Given: User clicks "New Session" and CLI selection is presented
  - When: User cancels
  - Then: No session is created, sidebar returns to previous state
- **TC-2.2d: Claude Code session end-to-end**
  - Given: Claude Code agent is available
  - When: User creates a Claude Code session and sends a message
  - Then: Claude Code streams a response rendering user turn, assistant turn with markdown, tool calls with status, and thinking blocks
- **TC-2.2e: Codex session end-to-end**
  - Given: Codex agent is available
  - When: User creates a Codex session and sends a message
  - Then: Codex streams a response with the same rendering as Claude Code sessions (user turn, assistant turn, tool calls, thinking)
- **TC-2.2f: Session creation failure**
  - Given: User clicks "New Session" and selects a CLI type
  - When: The ACP agent fails to create the session (agent error, bad working directory, etc.)
  - Then: Error message is shown, no tab or sidebar entry is created

**AC-2.3:** User can open an existing session

- **TC-2.3a: Open session loads history**
  - Given: A session with previous messages exists
  - When: User clicks the session in the sidebar
  - Then: Session opens in main area showing full conversation history
- **TC-2.3b: Open session that is already tabbed**
  - Given: A session is already open in a tab
  - When: User clicks that session in the sidebar
  - Then: The existing tab is activated (no duplicate tab created)

**AC-2.4:** User can archive a session

Archive is a local UI operation — it hides the session from the sidebar. It does not delete the session from the ACP agent. Unarchive is not in MVP scope.

- **TC-2.4a: Archive removes from sidebar**
  - Given: A session exists in the sidebar
  - When: User archives the session
  - Then: Session is no longer visible in the sidebar session list
- **TC-2.4b: Archive closes associated tab**
  - Given: A session is open in a tab
  - When: User archives the session
  - Then: The tab is closed and the session disappears from the sidebar

**AC-2.4b (addendum):** Orphan sessions are not displayed

- **TC-2.4c: Sessions created outside the app are hidden**
  - Given: A user ran Claude Code directly in a terminal for a project directory, creating a session the app has no mapping for
  - When: User expands that project in the sidebar
  - Then: Only sessions created through Liminal Builder are shown; the external session does not appear

**AC-2.5:** Session data persists across app restart

- **TC-2.5a: Sessions reappear after restart**
  - Given: A project has three sessions (one archived)
  - When: App is closed and reopened
  - Then: Two non-archived sessions appear under the project; the archived one remains hidden
- **TC-2.5b: Session history loads from agent after restart**
  - Given: A session existed before app restart
  - When: User opens that session
  - Then: Full conversation history is loaded from the ACP agent

---

### 3. Chat Interaction

The main content area is a chat interface rendering the conversation between the user and an AI agent. Messages stream in as the agent responds — user messages, assistant messages, thinking/reasoning blocks, and tool calls (file reads, command execution, etc.) all render as distinct visual elements.

The chat interface closely mirrors what the Codex App provides: a scrolling message thread with an input bar at the bottom. The key difference is that Liminal Builder connects to whichever ACP agent owns the session, not just one provider.

1. User opens a session (new or existing)
2. System displays conversation history (if any) and input bar
3. User types a message and sends it
4. System sends message to the agent and displays it as a user turn
5. Agent streams a response — system renders chunks as they arrive
6. If agent makes tool calls, system displays them inline with status
7. Agent response completes, user can send another message
8. (Optional) While agent is responding, user can cancel to stop the response early

#### Acceptance Criteria

**AC-3.1:** User messages display as distinct user turns in the chat

- **TC-3.1a: Sent message appears immediately**
  - Given: User is in an active session
  - When: User types a message and sends it
  - Then: The message appears immediately in the chat as a user turn
- **TC-3.1b: Empty message cannot be sent**
  - Given: User is in an active session
  - When: Input bar is empty
  - Then: Send action is disabled

**AC-3.2:** Agent responses stream into the chat as they arrive

- **TC-3.2a: Streaming response renders incrementally**
  - Given: User has sent a message
  - When: Agent begins responding
  - Then: Response text appears incrementally (not all at once after completion)
- **TC-3.2b: Response renders as markdown**
  - Given: Agent sends a response containing markdown (headers, code blocks, lists)
  - When: Response is fully received
  - Then: Markdown is rendered with formatting (syntax-highlighted code blocks, proper list indentation)

**AC-3.3:** Tool calls display inline with status

- **TC-3.3a: Tool call shows name and status**
  - Given: Agent executes a tool call (e.g., file read, command execution)
  - When: Tool call is in progress
  - Then: Chat shows the tool call name and a "running" indicator
- **TC-3.3b: Tool call shows result on completion**
  - Given: A tool call was in progress
  - When: Tool call completes
  - Then: Result is displayed collapsed by default showing the tool name and a success indicator; expandable to see full output
- **TC-3.3c: Tool call shows error on failure**
  - Given: A tool call was in progress
  - When: Tool call fails
  - Then: Error state is displayed with the error message

**AC-3.4:** Agent thinking/reasoning blocks display distinctly

- **TC-3.4a: Thinking blocks visually distinct**
  - Given: Agent sends thinking/reasoning content
  - When: Content renders in chat
  - Then: Thinking blocks are visually distinct from regular assistant messages (muted styling, collapsible)

**AC-3.5:** Input bar is always accessible at the bottom of the chat

- **TC-3.5a: Input bar visible and functional**
  - Given: User is viewing a session
  - When: Chat has any amount of history (including none)
  - Then: Input bar is pinned to bottom, accepts text input, and has a send action
- **TC-3.5b: Input disabled during agent response**
  - Given: Agent is currently streaming a response
  - When: User views the input bar
  - Then: Send is disabled and a "working" indicator is shown until the response completes

**AC-3.6:** Chat auto-scrolls to show latest content during streaming

- **TC-3.6a: Auto-scroll during response**
  - Given: Agent is streaming a response
  - When: New content arrives
  - Then: Chat scrolls to keep the latest content visible
- **TC-3.6b: Auto-scroll pauses if user scrolls up**
  - Given: Agent is streaming a response
  - When: User manually scrolls up to review earlier messages
  - Then: Auto-scroll stops; a "scroll to bottom" button appears
- **TC-3.6c: Scroll-to-bottom resumes auto-scroll**
  - Given: Auto-scroll is paused and the scroll-to-bottom button is visible
  - When: User clicks the scroll-to-bottom button
  - Then: Chat scrolls to bottom and auto-scroll resumes

**AC-3.7:** User can cancel a running agent response

- **TC-3.7a: Cancel action visible during agent response**
  - Given: Agent is streaming a response
  - When: User views the chat
  - Then: A cancel action is visible (button near the input bar or streaming indicator)
- **TC-3.7b: Cancel stops response and re-enables input**
  - Given: Agent is streaming a response
  - When: User clicks cancel
  - Then: Streaming stops, partial response content remains visible in the chat, and the input bar re-enables for the next message
- **TC-3.7c: Cancel not visible when agent is idle**
  - Given: No agent response is in progress
  - When: User views the chat
  - Then: Cancel action is not visible

---

### 4. Tab Management

The tab bar sits above the main content area. Each open session gets a tab. Tabs provide instant switching — clicking a tab shows that session within 100ms because the content stays alive in the background (not re-fetched).

The critical behavior: clicking a session in the sidebar that already has an open tab does not create a duplicate — it activates the existing tab. This prevents tab sprawl and makes the sidebar-to-tab relationship predictable.

1. User opens a session → tab appears in the tab bar
2. User opens another session → second tab appears, becomes active
3. User clicks first tab → switches back within 100ms
4. User clicks a sidebar session that's already tabbed → activates existing tab
5. User closes a tab → session remains in sidebar, just no longer tabbed
6. User drags a tab to reorder → tab order updates and persists

#### Acceptance Criteria

**AC-4.1:** Opening a session creates a tab

- **TC-4.1a: New tab on session open**
  - Given: No tabs are open
  - When: User opens a session
  - Then: A tab appears showing the session title, and the session is displayed in the main area
- **TC-4.1b: Multiple tabs**
  - Given: One session is open in a tab
  - When: User opens a different session
  - Then: A second tab appears and becomes active; the first tab remains

**AC-4.2:** Clicking a tab switches to that session within 100ms

- **TC-4.2a: Tab switch preserves scroll position**
  - Given: User has scrolled partway through Session A, then switched to Session B
  - When: User clicks the Session A tab
  - Then: Session A is displayed at the same scroll position as before
- **TC-4.2b: Tab switch renders within 100ms**
  - Given: Two sessions are open in tabs
  - When: User clicks the inactive tab
  - Then: The session content is visible within 100ms (no re-fetch or re-render delay)

**AC-4.3:** Opening an already-tabbed session activates the existing tab (no duplicates)

- **TC-4.3a: Sidebar click deduplicates**
  - Given: Session X is open in a tab
  - When: User clicks Session X in the sidebar
  - Then: The existing tab for Session X is activated; no new tab is created
- **TC-4.3b: Tab count stays constant**
  - Given: 3 tabs are open, one of which is Session X
  - When: User clicks Session X in the sidebar
  - Then: Tab count remains 3

**AC-4.4:** User can close a tab without losing the session

- **TC-4.4a: Close tab via close button**
  - Given: A session is open in a tab
  - When: User clicks the tab's close button
  - Then: Tab is removed; session remains in the sidebar and can be reopened
- **TC-4.4b: Close active tab switches to adjacent tab**
  - Given: Three tabs are open, the middle one is active
  - When: User closes the active tab
  - Then: The next tab becomes active (or previous if closing the last tab)
- **TC-4.4c: Close last remaining tab**
  - Given: One tab is open
  - When: User closes it
  - Then: Tab bar is empty and main area shows a "No session open" empty state

**AC-4.5:** Tabs display the session title and CLI type

- **TC-4.5a: Tab content**
  - Given: A session with title "Fix auth bug" from Claude Code is tabbed
  - When: User views the tab bar
  - Then: Tab shows "Fix auth bug" and a Claude Code indicator (icon or label)
- **TC-4.5b: Placeholder title for new session**
  - Given: A newly created session has not yet received a title from the agent
  - When: User views the tab
  - Then: Tab displays "New Session" as the title until the agent provides one

**AC-4.6:** User can reorder tabs via drag-and-drop

- **TC-4.6a: Drag to reorder**
  - Given: Three tabs are open in order A, B, C
  - When: User drags tab C between A and B
  - Then: Tab order updates to A, C, B
- **TC-4.6b: Tab order persists across app restart**
  - Given: User has reordered tabs
  - When: App is closed and reopened
  - Then: Tabs restore in the user's custom order

**AC-4.7:** Open tabs restore on full app restart (not just browser refresh)

- **TC-4.7a: Tabs restore after server restart**
  - Given: User has 3 tabs open with Session B active, then stops and restarts the server
  - When: User opens the app
  - Then: All 3 tabs are restored and Session B is active

---

### 5. Agent Connection Lifecycle

The system manages AI agent processes transparently — the user never explicitly starts or stops an agent. When a session needs an agent, the system ensures one is available. Connection issues surface as clear status indicators, not cryptic errors.

1. User creates or opens a session
2. System checks if an agent process for that CLI type is running
3. If not running, system spawns the agent process
4. System establishes a session with the agent
5. User interacts with the session (Flow 3)
6. If the agent connection drops, system shows a status indicator and attempts reconnection
7. When the app closes, system gracefully shuts down agent processes

#### Acceptance Criteria

**AC-5.1:** Agent processes start automatically when needed

- **TC-5.1a: First session triggers agent launch**
  - Given: No Claude Code agent process is running
  - When: User creates a new Claude Code session
  - Then: Agent process starts, session is established, and user can send messages
- **TC-5.1b: Subsequent sessions reuse existing process**
  - Given: A Claude Code agent process is already running
  - When: User creates another Claude Code session
  - Then: New session is created on the existing process (no second process spawned)

**AC-5.2:** Agent connection status is visible to the user

- **TC-5.2a: Connected state**
  - Given: Agent process is running and responsive
  - When: User views a session
  - Then: A status icon in the session header shows "connected" state (green dot or similar)
- **TC-5.2b: Disconnected state**
  - Given: Agent process has crashed or become unresponsive
  - When: User views a session
  - Then: Status icon shows "disconnected" (red/gray), input bar is disabled, and a "Reconnect" button is shown
- **TC-5.2c: Reconnecting state**
  - Given: Agent process was disconnected
  - When: System is attempting to reconnect
  - Then: Status icon shows "reconnecting" (yellow/animated) and input bar remains disabled
- **TC-5.2d: Manual reconnect**
  - Given: Agent is disconnected and "Reconnect" button is shown
  - When: User clicks "Reconnect"
  - Then: System attempts to restart the agent process and status changes to "reconnecting"

**AC-5.3:** Agent processes shut down gracefully on app close

- **TC-5.3a: Clean shutdown**
  - Given: Agent processes are running
  - When: User closes the app
  - Then: All agent processes receive shutdown signals and terminate cleanly (no orphaned processes)

**AC-5.4:** Starting a session shows progress feedback

- **TC-5.4a: Launching indicator**
  - Given: User creates a session and the agent process needs to start
  - When: Agent process is initializing
  - Then: The main area shows a loading/launching indicator until the session is ready

**AC-5.5:** System shows actionable error if agent process fails to start

- **TC-5.5a: CLI not installed**
  - Given: User creates a session for a CLI that is not installed
  - When: Agent process fails to start
  - Then: Error message "Could not start [CLI name]. Check that it's installed." is shown with a retry button
- **TC-5.5b: ACP handshake failure**
  - Given: CLI is installed but ACP handshake fails
  - When: Session creation fails
  - Then: Error message "Could not connect to [CLI name]" is shown with a retry button

**AC-5.6:** Browser refresh restores session state

- **TC-5.6a: Tabs restore after refresh**
  - Given: User has 3 tabs open with Session B active
  - When: User refreshes the browser
  - Then: All 3 tabs are restored and Session B is active
- **TC-5.6b: Running agent processes survive refresh**
  - Given: Agent processes are running
  - When: User refreshes the browser
  - Then: Browser reconnects to existing agent processes (no restart needed)

---

## Data Contracts

### Project Configuration

```typescript
interface Project {
  id: string;              // Unique identifier
  path: string;            // Absolute filesystem path
  name: string;            // Display name (derived from directory name)
  addedAt: string;         // ISO 8601 UTC — determines sidebar display order (insertion order)
}
```

Note: Collapse state (expanded/collapsed sidebar folders) is stored client-side in browser localStorage, not in the Project type. This avoids unnecessary server round-trips for a purely UI preference while still persisting across app restart (TC-1.4b).

### Session Metadata (local overlay)

```typescript
interface SessionMeta {
  id: string;              // Canonical ID: prefixed form (e.g., "claude-code:abc123")
  projectId: string;       // Parent project
  cliType: 'claude-code' | 'codex';
  archived: boolean;       // Local-only: hidden from sidebar
  title: string;           // Derived from first user message; "New Session" until first message
  lastActiveAt: string;    // ISO 8601 UTC — updated on message send/receive
  createdAt: string;       // ISO 8601 UTC — set on session creation
}
```

Note: All session metadata is stored locally. The ACP agent provides conversation content (via session/load replay) but has no session listing capability.

### Chat Message (UI representation)

```typescript
type ChatEntry =
  | { entryId: string; type: 'user'; content: string; timestamp: string }      // timestamp: ISO 8601 UTC (e.g., "2026-02-05T21:14:00Z")
  | { entryId: string; type: 'assistant'; content: string; timestamp: string } // timestamp: ISO 8601 UTC
  | { entryId: string; type: 'thinking'; content: string }
  | { entryId: string; type: 'tool-call'; toolCallId: string; name: string; status: 'running' | 'complete' | 'error'; result?: string; error?: string }
```

### WebSocket Messages (browser ↔ server)

All client messages include an optional `requestId` for correlating responses to requests when multiple operations are in flight concurrently.

```typescript
// Client → Server
type ClientMessage = {
  requestId?: string;  // Optional correlation ID for concurrent operations
} & (
  | { type: 'session:open'; sessionId: string }
  | { type: 'session:create'; projectId: string; cliType: 'claude-code' | 'codex' }
  | { type: 'session:send'; sessionId: string; content: string }
  | { type: 'session:cancel'; sessionId: string }
  | { type: 'session:archive'; sessionId: string }
  | { type: 'session:reconnect'; cliType: 'claude-code' | 'codex' }
  | { type: 'project:add'; path: string }
  | { type: 'project:remove'; projectId: string }
  | { type: 'project:list' }
  | { type: 'session:list'; projectId: string }
)

// Server → Client
type ServerMessage =
  | { type: 'session:history'; sessionId: string; entries: ChatEntry[]; requestId?: string }  // Response to session:open
  | { type: 'session:update'; sessionId: string; entry: ChatEntry }
  | { type: 'session:chunk'; sessionId: string; entryId: string; content: string }
  | { type: 'session:complete'; sessionId: string; entryId: string }
  | { type: 'session:created'; sessionId: string; projectId: string; requestId?: string }
  | { type: 'session:cancelled'; sessionId: string; entryId: string }
  | { type: 'session:archived'; sessionId: string; requestId?: string }
  | { type: 'session:title-updated'; sessionId: string; title: string }
  | { type: 'session:list'; projectId: string; sessions: Array<{ id: string; title: string; lastActiveAt: string; cliType: 'claude-code' | 'codex' }> } // lastActiveAt: ISO 8601 UTC
  | { type: 'project:added'; project: Project; requestId?: string }
  | { type: 'project:removed'; projectId: string; requestId?: string }
  | { type: 'project:list'; projects: Project[] }
  | { type: 'agent:status'; cliType: 'claude-code' | 'codex'; status: 'starting' | 'connected' | 'disconnected' | 'reconnecting' }
  | { type: 'error'; requestId?: string; message: string }
```

### Message Reconciliation Rules

The client maintains a list of `ChatEntry` objects per session, keyed by `entryId`:

- **`session:history`** — replaces the entire entry list for that session (response to `session:open`; see Session Open Sequence)
- **`session:update`** — upserts: if an entry with the same `entryId` exists, replace it; otherwise append. This is how tool calls transition from `running` to `complete`.
- **`session:chunk`** — appends `content` to the existing entry's `content` field (streaming text). The entry must already exist (created by a prior `session:update`).
- **`session:complete`** — marks the entry as finalized. No further chunks will arrive for this `entryId`.
- **`session:cancelled`** — marks the entry as finalized due to user cancellation. Treated like `session:complete` — no further chunks will arrive. Partial content remains visible.

### Session Creation Sequence

When a client sends `session:create`:
1. If no agent process is running for that CLI type: server sends `agent:status { status: 'starting' }`, spawns agent, then sends `agent:status { status: 'connected' }` on success
2. Server creates a session via ACP and sends `session:created { sessionId, projectId }`
3. After `session:created`, the input bar is enabled — the session is ready for messages
4. If any step fails, server sends `error { requestId, message }` — no session is created

### Session Open Sequence

When a client sends `session:open`:
1. Server looks up the session in the ACP agent (using the raw ACP ID, stripped of the cliType prefix)
2. If the session exists: server sends `session:history { sessionId, entries, requestId }`
3. After `session:history`, the input bar is enabled — the session is ready for messages
4. If the session does not exist (stale mapping): server sends `error { requestId, message: "Could not load session" }`

### Send Message Sequence

When a client sends `session:send`:
1. Client displays the user message optimistically as a user turn (no server acknowledgment needed)
2. Server relays the message to the ACP agent for that session
3. As the agent responds, server streams `session:update` (new entries for assistant text, thinking blocks, tool calls) and `session:chunk` (text increments for streaming content)
4. When the agent finishes responding, server sends `session:complete` for each open entry
5. If the send fails (agent disconnected, session not found): server sends `error { requestId, message }`

### Cancel Response Sequence

When a client sends `session:cancel`:
1. Server sends cancellation to the ACP agent for that session
2. Server sends `session:cancelled { sessionId, entryId }` for the active streaming entry
3. Client treats `session:cancelled` like `session:complete` — no further chunks expected for that entry; partial content remains visible
4. Input bar re-enables
5. If no response is in progress: server ignores the cancel (no error sent)

### Reconnect Sequence

When a client sends `session:reconnect`:
1. Server sends `agent:status { cliType, status: 'reconnecting' }`
2. Server attempts to restart the agent process for that CLI type
3. On success: server sends `agent:status { cliType, status: 'connected' }` — all sessions of that type become usable again
4. On failure: server sends `agent:status { cliType, status: 'disconnected' }` and `error { message }` — the "Reconnect" button remains visible

### Error States

| Condition | User-facing message | Recovery |
|-----------|-------------------|----------|
| Agent process fails to start | "Could not start [CLI name]. Check that it's installed." | Retry button |
| Agent process crashes mid-session | "Connection to [CLI name] lost. Reconnecting..." | Auto-retry, then manual retry |
| Directory not found (on add) | "Directory does not exist" | User corrects path |
| ACP handshake failure | "Could not connect to [CLI name]" | Retry button |
| Session open fails | "Could not load session" | Retry button |
| Session creation fails | "Could not create session" | Retry button |
| Duplicate project directory | "Project already added" | None (informational) |
| Cancel with no active response | (no user-facing message) | Ignored silently |

---

## Non-Functional Requirements

### Performance
- Tab switch renders content within 100ms (content stays alive in background)
- New session is usable within 2 seconds of creation (including agent startup if needed)
- Sidebar handles 20+ projects with 50+ sessions each without scroll jank
- Streaming responses render at the rate they arrive (no batching delay)

### Reliability
- Agent process crash does not crash the app
- Browser refresh reconnects to existing agent processes (no session loss)
- Session metadata survives app restart
- App functions with 10+ concurrent active sessions across 2 CLI types

### Resource Management
- Idle agent processes should not consume significant CPU
- Agent processes are long-lived (not restarted per session)

---

## Dependencies

Technical dependencies:
- ACP adapter for Claude Code (claude-code-acp)
- ACP adapter for Codex CLI (from Zed codebase or built)
- Claude Code CLI installed locally (OAuth mode)
- Codex CLI installed locally (OAuth mode)

---

## Tech Design Questions

The following questions were raised during spec validation and should be answered in Tech Design (Phase 3). They are implementation decisions, not feature requirements.

| Question | Context |
|----------|---------|
| Which markdown flavor to render (CommonMark, GFM)? | AC-3.2b requires markdown rendering with code highlighting |
| State machine for agent lifecycle (starting → connected → disconnected → reconnecting → stopped) | AC-5.2 defines user-visible states; Tech Design should formalize transitions |
| State machine for WebSocket lifecycle (connected → reconnecting → resumed) | AC-5.6 requires browser refresh recovery |
| Storage backend for local state (JSON files vs SQLite) | Persistence authority model defines what's stored; Tech Design picks how |
| How to pass project directory as working directory to ACP agent on session creation | A5 assumes OAuth mode; session creation needs cwd parameter |
| Markdown sanitization strategy for XSS prevention | Chat renders agent-provided markdown; needs sanitization |
| Session history loading strategy for very long sessions | Out of scope for MVP pagination, but Tech Design should consider lazy loading |
| Reconnection strategy (retry count, backoff) | AC-5.2 defines user-visible states; Tech Design defines auto-retry policy before showing manual reconnect |
| postMessage relay protocol between shell and session iframes | UI Architecture section defines the model; Tech Design specifies the message format |
| App state versioning and migration strategy | Local persistence will evolve; Tech Design should define schema versioning approach |
| Session title update mechanism | `session:title-updated` message defined; titles are derived locally from first user message. Tech Design determines extraction logic and when to emit the update to clients |

---

## Recommended Story Breakdown

### Story 0: Infrastructure & Project Skeleton

Sets up the Fastify server, static file serving, shell HTML, WebSocket endpoint, project configuration storage, and basic CSS theme. No agent integration yet — just the app skeleton that serves the UI shell.

**Delivers:** App launches, serves the shell page, WebSocket connects, project config can be read/written to filesystem.

### Story 1: Project Sidebar

The sidebar displays configured projects, supports add/remove, and collapse/expand. Sessions are mocked (not yet connected to agents).

**Delivers:** User can add projects, see them in the sidebar, collapse/expand them, and remove them. Session list shows placeholder data.

**ACs covered:**
- AC-1.1 (sidebar displays projects)
- AC-1.2 (add project)
- AC-1.3 (remove project)
- AC-1.4 (collapsible folders)

### Story 2a: ACP Client (Protocol Layer)

The server can communicate with ACP agent processes over stdio using JSON-RPC. Handles initialization handshake, session creation, message sending, streaming response collection, and cancellation. No browser integration yet — this is pure protocol plumbing.

**Delivers:** AcpClient class that can spawn an agent process, initialize it, create sessions, send prompts, receive streaming responses, and cancel in-progress prompts.

**ACs covered:**
- AC-5.1 (partial — agent process spawning)
- AC-5.3 (partial — process termination)

### Story 2b: Agent Manager + WebSocket Bridge

The server manages agent process lifecycles and bridges browser WebSocket messages to ACP. Multiple sessions share one agent process per CLI type. WebSocket messages from the browser route through to ACP and responses stream back.

**Delivers:** Server-side ACP integration works end-to-end for Claude Code. Messages flow from browser → WebSocket → AgentManager → AcpClient → agent → back.

**ACs covered:**
- AC-5.1 (auto-start agent, reuse existing)
- AC-5.3 (graceful shutdown)
- AC-5.5 (agent start failure)

### Story 3: Chat Session UI

The main area renders a chat interface — user messages, assistant messages with markdown, tool calls, thinking blocks. Input bar at bottom. Launching indicator when session is starting. Connected to real agent via Story 2b's pipeline.

**Delivers:** User can chat with Claude Code through the app. Messages stream in, tool calls display, markdown renders.

**ACs covered:**
- AC-3.1 (user messages display)
- AC-3.2 (streaming responses)
- AC-3.3 (tool calls inline)
- AC-3.4 (thinking blocks)
- AC-3.5 (input bar)
- AC-3.6 (auto-scroll)
- AC-3.7 (cancel running response)
- AC-5.4 (launching indicator)

### Story 4: Session Management

Sessions are real — created via ACP, listed in the sidebar from local metadata, openable with full conversation history loaded from the agent. New session creation with CLI type picker. Archive support. Session persistence across restart.

**Delivers:** User can create new sessions, browse existing ones in the sidebar, open them to see full history, and archive sessions.

**ACs covered:**
- AC-2.1 (session listing)
- AC-2.2 (create session)
- AC-2.3 (open existing session)
- AC-2.4 (archive session)
- AC-2.5 (session persistence)

### Story 5: Tab Management

Tab bar with open/switch/close/deduplicate/reorder behavior. Tabs keep session content alive for instant switching.

**Delivers:** User can have multiple sessions tabbed, switch within 100ms, close tabs, reorder via drag, and sidebar clicks deduplicate.

**ACs covered:**
- AC-4.1 (tab creation)
- AC-4.2 (tab switching)
- AC-4.3 (tab deduplication)
- AC-4.4 (close tab)
- AC-4.5 (tab display)
- AC-4.6 (tab reorder)
- AC-4.7 (tab restore on app restart)

### Story 6: Codex CLI + Connection Status + Browser Refresh

Add Codex as a second CLI type. Implement agent connection status indicators, reconnection behavior, and browser refresh recovery.

**Delivers:** User can create Codex sessions alongside Claude Code. Connection health is visible. Browser refresh restores state.

**ACs covered:**
- AC-5.2 (connection status)
- AC-5.6 (browser refresh recovery)
- TC-2.2d (Claude Code end-to-end)
- TC-2.2e (Codex end-to-end)

---

## Traceability Matrix

### PRD → Feature Spec → Story

| PRD Feature | Spec Flow | ACs | Stories |
|---|---|---|---|
| Feature 1: Project Sidebar & Session Management | Flow 1 (Project Directory Management) | AC-1.1, AC-1.2, AC-1.3, AC-1.4 | Story 1 |
| Feature 1: Project Sidebar & Session Management | Flow 2 (Session Browsing & Creation) | AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-2.5 | Story 4 |
| Feature 2: Chat Session UI | Flow 3 (Chat Interaction) | AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-3.5, AC-3.6, AC-3.7 | Story 3 |
| Feature 3: Tab Management | Flow 4 (Tab Management) | AC-4.1, AC-4.2, AC-4.3, AC-4.4, AC-4.5, AC-4.6, AC-4.7 | Story 5 |
| Feature 4: ACP CLI Integration | Flow 5 (Agent Connection Lifecycle) | AC-5.1, AC-5.2, AC-5.3, AC-5.4, AC-5.5, AC-5.6 | Stories 2a, 2b, 3, 6 |

### AC → TC Coverage

| AC | TCs | Happy Path | Error/Edge | Cancel |
|---|---|---|---|---|
| AC-1.1 | TC-1.1a, TC-1.1b | Yes | — | — |
| AC-1.2 | TC-1.2a, TC-1.2b, TC-1.2c, TC-1.2d | Yes | Yes (invalid, duplicate) | Yes |
| AC-1.3 | TC-1.3a, TC-1.3b | Yes | Edge (tabs) | — |
| AC-1.4 | TC-1.4a, TC-1.4b | Yes | Persistence | — |
| AC-2.1 | TC-2.1a, TC-2.1b, TC-2.1c | Yes | Empty | — |
| AC-2.2 | TC-2.2a, TC-2.2b, TC-2.2c, TC-2.2d, TC-2.2e, TC-2.2f | Yes | Yes (creation failure) | Yes |
| AC-2.3 | TC-2.3a, TC-2.3b | Yes | Dedup | — |
| AC-2.4 | TC-2.4a, TC-2.4b, TC-2.4c | Yes | Tab close, Orphan | — |
| AC-2.5 | TC-2.5a, TC-2.5b | Yes | Agent reload | — |
| AC-3.1 | TC-3.1a, TC-3.1b | Yes | Empty input | — |
| AC-3.2 | TC-3.2a, TC-3.2b | Yes | — | — |
| AC-3.3 | TC-3.3a, TC-3.3b, TC-3.3c | Yes | Error | — |
| AC-3.4 | TC-3.4a | Yes | — | — |
| AC-3.5 | TC-3.5a, TC-3.5b | Yes | Disabled state | — |
| AC-3.6 | TC-3.6a, TC-3.6b, TC-3.6c | Yes | Scroll pause | Resume |
| AC-3.7 | TC-3.7a, TC-3.7b, TC-3.7c | Yes | — | — |
| AC-4.1 | TC-4.1a, TC-4.1b | Yes | — | — |
| AC-4.2 | TC-4.2a, TC-4.2b | Yes | Performance | — |
| AC-4.3 | TC-4.3a, TC-4.3b | Yes | Dedup count | — |
| AC-4.4 | TC-4.4a, TC-4.4b, TC-4.4c | Yes | Adjacent/last | — |
| AC-4.5 | TC-4.5a, TC-4.5b | Yes | Placeholder title | — |
| AC-4.6 | TC-4.6a, TC-4.6b | Yes | Persistence | — |
| AC-4.7 | TC-4.7a | Yes | Restart | — |
| AC-5.1 | TC-5.1a, TC-5.1b | Yes | Reuse | — |
| AC-5.2 | TC-5.2a, TC-5.2b, TC-5.2c, TC-5.2d | Yes | Disconnected | Reconnecting, Manual reconnect |
| AC-5.3 | TC-5.3a | Yes | — | — |
| AC-5.4 | TC-5.4a | Yes | — | — |
| AC-5.5 | TC-5.5a, TC-5.5b | — | Yes (both) | — |
| AC-5.6 | TC-5.6a, TC-5.6b | Yes | — | — |

---

## Validation Checklist

- [x] User Profile has all four fields + Feature Overview
- [x] Flows cover all paths (happy, alternate, cancel/error)
- [x] Every AC is testable (no vague terms)
- [x] Every AC has at least one TC
- [x] TCs cover happy path, edge cases, and errors
- [x] Data contracts are fully typed with IDs for streaming correlation
- [x] Scope boundaries are explicit (in/out/assumptions)
- [x] Persistence authority model is defined (ours vs ACP's)
- [x] Story breakdown covers all ACs
- [x] Stories sequence logically (infrastructure → sidebar → ACP protocol → agent manager → chat → sessions → tabs → second CLI)
- [x] Traceability matrix maps PRD → Flows → ACs → TCs → Stories
- [x] PRD metrics reconciled with NFRs
- [x] Tech Design questions captured for Phase 3
- [ ] Self-review complete
- [ ] Human review complete
- [ ] Tech Lead validation: "I can design from this"
