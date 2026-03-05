# Story 4: Text and Markdown Rendering — Pairing Session Prompt

## Project Context

**Liminal Builder** is an agentic IDE that wraps multiple AI coding CLIs (Claude Code via the Agent SDK, Codex via ACP/JSON-RPC) in a unified browser-based chat interface. Agent responses arrive as streaming upserts — progressive content updates batched on the server side — and render in per-session iframe portlets.

**Architecture:** Bun + Fastify server, vanilla HTML/JS client. Markdown rendering uses `marked` (GFM mode) + `DOMPurify` for sanitization. `highlight.js` is listed as a dependency in package.json but is not imported or referenced anywhere in the client code. Styling is Tailwind + custom CSS with theme tokens (Tokyo Night / Codex Dark / Warm Minimal palettes).

## Current Rendering Pipeline (Verified)

The rendering has two modes:

1. **During streaming:** Each upsert triggers `applyUpsert()` → `chat.renderEntry()` → `renderAssistantEntry()` (chat.js line 103). When the entry is not finalized, it sets `element.textContent = contentValue` (line 122) — raw plaintext, no markdown. A `.streaming-cursor` CSS class adds a blinking cursor via pseudo-element.

2. **On finalization** (upsert with `status: "complete"` or history load): `chat.finalizeEntry()` (line 360) adds the entryId to `finalizedEntryIds`, then `renderAssistantEntry` takes the finalized path: `element.innerHTML = renderMarkdown(contentValue)` (line 117).

**markdown.js** (14 lines total):
```js
marked.setOptions({ gfm: true, breaks: true });
// No custom renderer, no highlight option, no extensions
const html = marked.parse(text ?? "");
return DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true },
  ADD_TAGS: ["pre", "code", "span"],
  ADD_ATTR: ["class"],
});
```

**Current CSS for rendered markdown** (portlet.css lines 96-131):
- `pre`: margin, padding, border-radius, border, background (`--chat-pre-bg`), overflow-x auto, monospace font, 12px
- `code`: monospace font, 0.94em
- Headings (h1-h4): margin only
- `p, ul, ol, blockquote`: margin only
- `ul, ol`: padding-left 1.25em
- **Missing entirely:** inline code background/border, blockquote visual treatment, table styling, link colors, HR styling, code block language labels, copy buttons

**Critical CSS issue:** `.chat-entry` has `white-space: pre-wrap` (portlet.css line 37). This applies to ALL entry types including assistant entries with rendered markdown. `pre-wrap` will cause rendered HTML to respect literal newlines in the source, which can create double-spacing or unexpected line breaks within markdown block elements. This likely needs to be overridden for `.chat-entry-assistant` once markdown rendering is active.

## Key Files

- `client/shared/markdown.js` — `renderMarkdown(text)`: the 14-line marked + DOMPurify pipeline. This is where hljs integration, custom renderers, and copy-button injection would go.
- `client/portlet/chat.js` — `renderAssistantEntry()` (line 103), `finalizeEntry()` (line 360). The streaming → finalization lifecycle.
- `client/portlet/portlet.css` — Chat entry styling. `.chat-entry` base (line 29), `.chat-entry-assistant` (line 47), `pre` (line 96), `code` (line 108), heading/list margins (line 113-131), `.streaming-cursor` (line 133).
- `client/shared/theme.css` — Theme tokens: `--chat-pre-bg`, `--font-mono`, `--bg-highlight`, `--border-color`, etc. Three theme definitions to work with.
- `client/portlet/index.html` — Import map (line 57-64) maps `marked` and `dompurify` to vendored paths. No hljs mapping exists — would need to add one.
- `package.json` — `highlight.js` ^11.11.0 (dependency), `marked` ^15.0.0, `dompurify` ^3.2.0

## What We're Working On

Making the chat output look good. This is the most visually obvious gap in the app.

Areas to address:
- **Prose:** headings, bold, italic, lists, blockquotes, horizontal rules, links — all need proper CSS treatment
- **Inline code:** needs visual distinction (background, subtle border, monospace) — currently just font change
- **Fenced code blocks:** syntax highlighting via hljs, copy-to-clipboard button, language label
- **Tables:** GFM table rendering with basic styling
- **Typography:** general spacing, line heights, margins within assistant entries
- **The `white-space: pre-wrap` issue** on `.chat-entry` — needs override for assistant entries

Secondary concern: currently streaming shows raw text and finalization swaps to rendered markdown, causing a visual reflow. Whether to do incremental markdown during streaming is a related but separate question (see Story 8: Streaming Smoothing). For this story, focus on making finalized content look great.

## Things to Consider

- **hljs integration with marked:** marked v15 supports a `highlight` callback in renderer options for code blocks. Need to wire that up. Also need to add hljs to the import map in portlet/index.html, and vendor it similarly to marked/dompurify.
- **DOMPurify config:** Currently allows `class` attr on `pre`, `code`, `span`. hljs adds class names like `hljs-keyword`, `hljs-string` on `<span>` elements inside code blocks. The current config should allow this, but verify.
- **Three themes:** CSS should use theme tokens. Code highlighting themes need to work with all three palettes — may need a custom hljs theme or token-based overrides rather than using a stock hljs stylesheet.
- **Code block copy button:** Vanilla JS DOM creation. Needs to be positioned within the code block (probably absolute-positioned top-right), copy the raw code text, and provide visual feedback. This is a common pattern but needs to be built from scratch.
- **Agent responses are code-heavy.** This is a coding IDE — code block quality matters more than prose formatting. Prioritize code block rendering.

## Confidence Notes

What's verified (read the code):
- Streaming path: `applyUpsert` → `renderEntry` → `renderAssistantEntry` → `element.textContent` — confirmed in portlet.js line 340 and chat.js line 122.
- Finalization path: `finalizeEntry` → `renderAssistantEntry` → `element.innerHTML = renderMarkdown()` — confirmed at chat.js lines 117 and 371.
- `marked.setOptions({ gfm: true, breaks: true })` with no custom renderer — confirmed in markdown.js line 4.
- DOMPurify allows `class` on `pre`, `code`, `span` — confirmed in markdown.js line 11.
- `.chat-entry` has `white-space: pre-wrap` — confirmed at portlet.css line 37.
- hljs is not imported or referenced anywhere in client code — confirmed via grep (only hits were unrelated `highlight` in theme.css and tabs.js).
- hljs is not in the import map — confirmed in portlet/index.html lines 57-64.

What needs verification in session:
- Whether marked v15's API for highlight callbacks matches the v12/v13 pattern (`marked.setOptions({ highlight: fn })`) or has changed. (~60% confident it's similar but may have moved to renderer extensions — check marked docs.)
- Whether vendored hljs exists at `node_modules/highlight.js/` in a format suitable for ESM import in the browser, or if it needs a build step. (~70% confident it ships ESM but need to check the dist structure.)
- How large hljs is with common language packs — importing all languages may be too heavy. A subset (js, ts, python, bash, json, html, css, diff) is probably sufficient. (No data on bundle size.)

## Session Style

This is an interactive pairing session. We'll research approaches, POC rendering improvements, and iterate on the visual output together. Expect to try things, look at results, and adjust. The user cares about design quality and will provide feedback on visual output.
