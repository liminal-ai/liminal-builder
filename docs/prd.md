# Product Requirements Document: Liminal Builder

## Vision

An agentic IDE that replaces the friction of juggling CLI terminals with an organized, session-based interface for parallel AI-assisted development. Move between projects and agent conversations fluidly — no more lost terminal windows, no more "which tab was that codex session in?"

The core value: **ergonomic session management across multiple AI coding CLIs**, organized by project, switchable in a click.

## User Persona

**Lee — Solo developer running parallel agentic coding workflows**

- Runs multiple AI CLIs (Claude Code, Codex, Gemini) across several project directories simultaneously
- Needs to context-switch between projects and sessions rapidly without losing place
- Values speed, simplicity, and tools that stay out of the way
- Prefers vanilla HTML/JS, Fastify/Bun stack — avoids framework complexity (React, Next.js SSR)
- Builds with agentic coding — tech choices must be model-friendly

---

## Feature Overview

### Feature 1: Project Sidebar & Session Management
**Priority:** Must-have (MVP)
**Summary:** Left sidebar showing project root folders as collapsible groups, with agent sessions listed under each. Click a session to open it. See session title, age, and which CLI produced it.
**Key Flows:**
- Add a project directory
- Browse sessions grouped by project
- Click to open a session in the main area
- Create a new session for a project (pick CLI type)
- Archive/delete old sessions

### Feature 2: Chat Session UI
**Priority:** Must-have (MVP)
**Summary:** Main content area renders an ACP agent session as a chat interface — user messages, assistant messages, tool calls, thinking blocks. Supports streaming output. Input bar at bottom to send messages.
**Key Flows:**
- View streaming agent responses (message chunks, tool call status)
- Send a message to the agent
- See tool calls and their results inline
- Resume a previous session

### Feature 3: Tab Management
**Priority:** Must-have (MVP)
**Summary:** Tab bar above the main content area. Opening a session adds a tab. Clicking a session that's already tabbed switches to that tab (no duplicate). Close tabs. Tabs are lightweight — switching is instant because the portlet iframe stays alive.
**Key Flows:**
- Open session → tab appears
- Click session already in tab → switches to it
- Close a tab (session stays in sidebar, just not pinned to a tab)
- Reorder tabs (drag)

### Feature 4: ACP CLI Integration
**Priority:** Must-have (MVP — Claude Code + Codex)
**Summary:** Fastify server manages ACP agent processes. Spawns CLI subprocesses, communicates via JSON-RPC over stdio, bridges to browser via WebSocket. One process per CLI type can serve multiple sessions.
**Key Flows:**
- Spawn ACP agent process on first session creation for that CLI type
- Route session messages through ACP protocol
- Handle agent capabilities negotiation
- Graceful shutdown of agent processes
**High-Level ACs:**
- Claude Code sessions work end-to-end (send message, receive streaming response, see tool calls)
- Codex sessions work end-to-end
- Agent process survives across multiple sessions
- WebSocket reconnects gracefully on browser refresh

### Feature 5: Gemini CLI Integration
**Priority:** Should-have (post-MVP)
**Summary:** Add Gemini CLI as a third ACP agent. Gemini speaks ACP natively, so this is lighter than Claude Code/Codex which need adapters.
**Key Flows:**
- Same as Feature 4, for Gemini

### Feature 6: Project Console
**Priority:** Nice-to-have
**Summary:** A collapsible terminal panel per project directory for running services (dev servers, builds, etc.). Stays out of the way but accessible. Associated with the project directory, not a specific session.
**Key Flows:**
- Open console for a project
- Run commands in the project directory
- Console persists while switching between sessions
- Stop/restart services

### Feature 7: Cursor & Copilot CLI Integration
**Priority:** Nice-to-have (future)
**Summary:** Extend to Cursor CLI and GitHub Copilot CLI. May require building ACP adapters if they don't support it natively.

---

## Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Bun | Fast, native TS, proven in existing stack |
| HTTP Framework | Fastify | Existing expertise, fast, plugin ecosystem |
| CLI Integration | ACP (Agent Client Protocol) | Open standard (Zed + JetBrains), JSON-RPC over stdio, existing adapters for Claude Code and Codex |
| Frontend | Vanilla HTML + JS | Model-friendly, no build complexity, proven shell/portlet pattern |
| UI Architecture | Shell + Portlets (iframes) | Isolation per session, independent lifecycle, existing proven pattern from LiminalDB |
| Real-time | WebSocket (Fastify → browser) | Bridges ACP stdio to browser, low latency streaming |
| Session Storage | Local filesystem | No cloud dependency for a local tool. JSON files or SQLite. |
| Theming | CSS custom properties (Tokyo Night) | Existing theme system, dark-mode IDE aesthetic |

### Why Not Electron/Tauri/SwiftUI?

- **Electron:** Learning curve, heavy, same web code underneath. Can wrap later if needed.
- **Tauri:** Eliminated — not considered.
- **SwiftUI:** macOS lock-in acceptable, but harder markdown/code rendering, smaller ecosystem for chat UI. Revisit if browser-based UX proves insufficient.

The web app approach gets to a working product fastest with the existing stack and skills. The architecture is identical to what Electron would require — wrapping it later is a well-trodden path.

---

## Out of Scope

- Cloud sync / multi-device (local-only for now)
- Authentication (local tool, single user)
- File editor / code editing (use the CLIs for that)
- Git integration (use the CLIs or separate terminal)
- Plugin/extension system
- Mobile

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Session switch time | < 100ms (tab click to visible content) |
| New session creation | < 2s (including ACP handshake) |
| Concurrent active sessions | 10+ without degradation |
| CLI support at launch | Claude Code + Codex |
| Daily usability | Replaces raw terminal for agentic coding workflows |

---

## MVP Scope (Features 1-4)

The minimum viable product is Features 1-4: project sidebar, chat UI, tabs, and ACP integration for Claude Code + Codex. This delivers the core value — organized, switchable agent sessions across projects — without the nice-to-haves.

**MVP delivers:** "I can see all my projects, open agent sessions, switch between them with tabs, and chat with Claude Code or Codex — all in one place instead of scattered terminal windows."
