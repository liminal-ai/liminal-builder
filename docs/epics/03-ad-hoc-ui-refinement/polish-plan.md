# Epic 03 — Ad-Hoc UI Refinement: Polish Plan

Rough set of intentions to explore and implement as they make sense. Not locked decisions — items will be validated, scoped, and sequenced through conversation and experimentation. As things get nailed down they move into `decision-log.md`.

---

## 1. Remove Tabs

The tab bar may be redundant given the sidebar already provides session navigation. Sidebar with recency sorting and project-level collapse/expand likely covers the same ground without the maintenance burden of curating a working set. Removing tabs simplifies the shell and reclaims vertical space for chat content.

Worth considering: does anything from the tab concept need to be preserved (e.g. visual indicator of "most recently used" sessions in the sidebar)?

---

## 2. Project and Session Creation UX

Adding a project currently triggers a bare system alert with nothing pre-filled. Creating a new session (Claude Code or Codex) is similarly rough. These are the first interactions a user hits and they set the tone for the whole experience.

Areas to explore:
- Replace system alert for "Add Project" with a proper inline modal or sidebar input — pre-populate with something useful if possible (e.g. recent directories, current working directory).
- Unified "New Session" flow that covers both CLI types. Could be a single action with a CLI picker rather than separate paths. The Codex app's "New thread" pattern is a reasonable reference — one button, context inferred from the project.
- Generally: these creation flows should feel lightweight and fast, not like filling out a form.

---

## 3. Session Naming

The sidebar currently shows opaque session IDs. Meaningful session titles are a prerequisite for sidebar-based navigation to feel good — especially after tabs are removed and the sidebar becomes the primary navigation surface.

Approaches to explore:

- **Auto-suggest rename:** Send a prompt to the session's model asking it to generate a concise session name based on the conversation so far. Criteria for a good name TBD (probably task-oriented, short, distinguishing).
- **Manual rename:** User clicks rename on a session, gets a modal with the current name (or auto-suggested name) pre-filled and text highlighted. User can accept as-is, edit, or replace entirely.
- **Single modal, two paths:** Whether the user triggers "rename" or "auto-suggest," the interaction lands in the same modal. The difference is just what's pre-populated — existing name vs. model-suggested name. Text is selected so accepting or overriding is equally low-friction.

The auto-suggest mechanism needs the ability to call the session's backing model with a naming prompt. This may be a lightweight dedicated prompt or could piggyback on an existing session interaction — worth exploring what's simplest.

---

## 4. Text and Markdown Rendering

The most visually obvious gap. Assistant entries currently render as raw plaintext during streaming and get a single markdown pass on finalization. The CSS treatment for rendered markdown is minimal.

Areas to address:
- Prose formatting: headings, bold, italic, lists, blockquotes, horizontal rules, links
- Inline code: visual distinction (background, border, monospace)
- Fenced code blocks: syntax highlighting (hljs is installed but unwired), copy button, language label
- Tables: basic GFM table styling
- General typography and spacing within assistant entries

---

## 5. Tool Call Rendering

Tool calls are functionally rendered but visually crude. Tool results dump as raw `<pre>` text. Tool arguments render as stringified JSON.

Areas to explore:
- Better visual treatment for tool call cards (name, status, collapsible output)
- Markdown/code rendering within tool output (many tool results contain code or structured text)
- Permission request handling — the harness currently errors out when tools request permission. Need to understand what the expected interaction model is here.

---

## 6. Thinking Block Rendering

Currently a bare `<details>` with "Thinking..." summary and raw text content. Functional but unfinished.

Areas to explore:
- Visual treatment that distinguishes thinking from assistant content
- Whether thinking content benefits from markdown rendering
- Collapse/expand behavior and defaults

---

## 7. Codex Streaming Batch Alignment

The Codex ACP provider currently emits an upsert on every `agent_message_chunk` with no batching. This creates the token accumulation problem (1 + 1,2 + 1,2,3 + ...) and excessive WebSocket traffic. The Claude Code provider already has a batch gradient [10, 20, 40, 80, 120 tokens] that mitigates this.

Intention: bring the Codex provider's emission pattern in line with the Claude Code provider's batching approach.

---

## 8. Client-Side Streaming Smoothing

Even with server-side batching, the batch gradient means early updates are small and frequent while later updates are large and infrequent. This creates a visual shift from smooth streaming to chunky jumps as a response gets longer.

Intention: explore client-side progressive reveal of batched content so the visual cadence stays consistent regardless of server batch size. When a large chunk arrives, animate or trickle the new text at a rate that approximates the feel of the smaller early batches.

This interacts with markdown rendering — need to figure out sequencing between "render markdown during streaming" and "smooth the reveal of large chunks."

---

## 9. Side-by-Side View

The core value of Liminal Builder is multi-CLI orchestration. The typical workflow involves moving between sessions on different CLIs (Opus for ideation/planning/design, Codex for implementation/verification) and sometimes needing to see both simultaneously.

Intention: explore a split-pane view that allows two sessions side by side. This may be more valuable than tabs for the multi-CLI coordination workflow. Lower priority than rendering quality — get the content looking good first, then improve the layout for cross-session work.

