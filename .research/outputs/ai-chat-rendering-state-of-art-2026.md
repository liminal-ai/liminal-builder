# AI Chat Rendering: State of the Art (2025-2026)

Research conducted 2026-02-17. Focused on what produces the best-looking AI assistant output in web applications, with emphasis on streaming markdown, code blocks, and the rendering stacks used by major products.

---

## Summary

The AI chat rendering landscape has consolidated rapidly. **Vercel's Streamdown** (v2, released Jan 2026) has emerged as the clear winner for React-based web applications -- it is purpose-built for streaming AI output and now ships at 910K+ weekly npm downloads. It handles every hard problem: unterminated markdown blocks, streaming code highlighting via Shiki, LaTeX via KaTeX, Mermaid diagrams, CJK support, and security hardening. The underlying architecture uses `marked` for parsing with a custom healing layer called `remend` that completes partial syntax on the fly.

For terminal rendering, the pattern is **Ink (React for CLI) + marked-terminal** (Codex CLI) or **Ink + custom renderers** (Claude Code, Gemini CLI). Both major AI CLIs use Ink as their TUI framework, with React components driving layout and interaction.

The most important insight: the gap between "good enough" and "best looking" comes down to two things -- (1) handling incomplete/streaming markdown without visual jitter, and (2) code block syntax highlighting that works incrementally. Streamdown solves both. For non-React stacks, `streaming-markdown` (3KB, framework-agnostic) and `incremark` (O(n) incremental parser with Vue/React/Svelte/Solid bindings) are the primary alternatives.

---

## Key Findings

- **Vercel Streamdown is the current standard-bearer** for web AI chat rendering. 910K weekly downloads. Drop-in replacement for react-markdown. Used by Vercel's AI Elements and adopted across the ecosystem.
- **Codex CLI uses: Ink (React for terminal) + marked-terminal (patched) + chalk** for its TypeScript TUI. The Rust TUI uses `tui-markdown`. Both have known rendering issues being actively worked on.
- **Claude Code also uses Ink** as its terminal UI framework (confirmed in Ink's own README as a notable user).
- **ChatGPT's web interface uses highlight.js** for code syntax highlighting, which has known rendering issues (community userscripts exist to fix broken highlighting). The markdown renderer is not publicly documented but appears to be a custom implementation.
- **shiki-stream** (by Anthony Fu, 568 stars) provides streaming syntax highlighting via Shiki's `CodeToTokenTransformStream` -- a Web Streams API that pipes text through for incremental token highlighting. This is what Streamdown uses internally.
- **streaming-markdown** (by thetarnav, 355 stars, 3KB gzipped) is the lightweight option recommended by Google Chrome's dev documentation for rendering streamed LLM responses. Framework-agnostic, DOM-only.
- **Incremark** is a new entrant claiming 2-10x faster than Streamdown via true O(n) incremental parsing (vs Streamdown's re-parse approach). Supports Vue/React/Svelte/Solid. Worth watching.
- **`marked`'s `walkTokens` with `async: true`** enables async token processing and returns a Promise from `marked.parse()`. This is the hook for custom streaming pipelines -- but it's not true incremental parsing; it still re-lexes/parses on each call.

---

## Detailed Analysis

### 1. Codex CLI Rendering Stack

The Codex CLI (TypeScript version) rendering architecture:

| Layer | Library | Role |
|-------|---------|------|
| TUI Framework | `ink` v6.x | React-based terminal UI (flexbox layout via Yoga) |
| Markdown | `marked-terminal` v7.3.0 (patched) | Renders markdown AST to terminal escape codes |
| Markdown Parser | `marked` (via marked-terminal) | Parses markdown to tokens |
| CLI Framework | `meow` | Argument parsing |
| Colors | `chalk` | Terminal color output |
| Components | Custom React/Ink | `TerminalChat`, `TerminalChatInput`, `TerminalChatResponseItem`, etc. |

Key details from the source:
- They maintain a **patched version** of `marked-terminal@7.3.0` to fix rendering bugs
- The Rust TUI uses `tui-markdown` from joshka, a separate Rust crate
- Known issues (from GitHub Issue #1246): heading rendering, hyperlink formatting, code block backtick display, bulleted list styling with inline formatting
- The entry point is `src/cli.tsx` using Ink's React renderer
- Components live in `src/components/chat/`

The Codex CLI rendering is **good but not great** -- the maintainers themselves acknowledge `marked-terminal` has issues requiring patches, and the Rust version has similar problems.

### 2. Claude Code Rendering

Claude Code uses **Ink** as its terminal UI framework (confirmed by Ink's npm README which lists Claude Code as a prominent user alongside Gemini CLI). This means it shares the same fundamental architecture as Codex CLI:

- React components rendered to terminal via Ink
- Flexbox-based terminal layout via Yoga
- Custom components for chat messages, tool calls, thinking indicators

The specific markdown rendering library used by Claude Code is not publicly documented, but given the Ink ecosystem, it likely uses either `marked-terminal` or a custom marked/unified pipeline.

### 3. ChatGPT Web Interface

ChatGPT's web rendering stack is **not open source**, but reverse engineering by the community reveals:

- **Syntax highlighting**: Uses **highlight.js** (not Shiki). Community members have created userscripts to fix broken highlighting (e.g., HTML not correctly highlighted, Vue code missing highlighting entirely)
- **Math**: KaTeX for LaTeX rendering
- **Markdown**: Custom implementation, likely a modified react-markdown or unified pipeline
- The rendering quality has had **known issues** -- a Reddit thread from Nov 2024 documented broken syntax highlighting requiring community fixes via Tampermonkey/Greasemonkey scripts
- GPT-5 introduced markdown formatting regressions reported on the OpenAI developer forums

ChatGPT's rendering is polished in its overall UX but has had persistent code highlighting quality issues.

### 4. Vercel Streamdown (The Current Best)

**Version**: 2.2.0 (Feb 2026)
**Weekly Downloads**: 910,700
**License**: Apache-2.0
**Bundle**: 83.5% smaller than v1 thanks to CDN-loaded languages/themes

#### Architecture

```
Streamdown Component
  |
  +-- marked v17 (parsing)
  +-- remend (markdown healing for unterminated blocks)
  +-- remark-gfm (GitHub Flavored Markdown)
  +-- remark-parse + remark-rehype (unified pipeline)
  +-- rehype-harden + rehype-sanitize (security)
  +-- rehype-raw (raw HTML passthrough)
  |
  +-- @streamdown/code (Shiki syntax highlighting, lazy-loaded)
  +-- @streamdown/math (KaTeX, lazy-loaded)
  +-- @streamdown/mermaid (Mermaid diagrams, lazy-loaded)
  +-- @streamdown/cjk (CJK language support)
```

#### Key Capabilities

- **Unterminated block handling**: `remend` library auto-completes partial markdown (unclosed bold, code blocks, links, KaTeX, etc.)
- **Streaming cursor/caret**: Built-in animated caret at the end of streaming content
- **200+ languages**: Via Shiki, lazy-loaded on demand from CDN
- **Dual-theme support**: Light/dark mode with any Shiki theme pair
- **Interactive code blocks**: Copy button, download button, language badge, line numbers
- **Mermaid**: SVG/PNG export, zoom, pan, fullscreen, custom error components
- **Static mode**: For non-streaming content (blogs, docs) with reduced overhead
- **Plugin architecture**: Tree-shakeable, install only what you need
- **Performance**: Memoized rendering, LRU caching, no regex in hot paths (v1.6+)
- **Security**: `rehype-harden` + `rehype-sanitize` for XSS prevention

#### Usage with AI SDK

```tsx
import { useChat } from "@ai-sdk/react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import "katex/dist/katex.min.css";

export default function Chat() {
  const { messages, status } = useChat();
  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          {message.parts.map((part, index) =>
            part.type === "text" ? (
              <Streamdown
                key={index}
                plugins={{ code, mermaid, math }}
                isAnimating={status === "streaming"}
              >
                {part.text}
              </Streamdown>
            ) : null
          )}
        </div>
      ))}
    </div>
  );
}
```

### 5. Shiki Ecosystem for Code Highlighting

Shiki (12.9K stars, v3.22) has become the dominant syntax highlighter, replacing highlight.js and Prism in the AI rendering space:

| Package | Stars | Purpose |
|---------|-------|---------|
| `shiki` | 12,900 | Core syntax highlighter (TextMate grammars, 200+ languages) |
| `shiki-stream` | 568 | Streaming highlighting via Web Streams API (`CodeToTokenTransformStream`) |
| `shiki-magic-move` | 1,400 | Animated code block transitions (used in Slidev) |
| `react-shiki` | -- | React component/hook wrapper for Shiki (24 versions, streaming-optimized) |
| `@shikijs/markdown-it` | -- | Shiki plugin for markdown-it |

**shiki-stream** is particularly relevant. It provides:
```ts
import { CodeToTokenTransformStream } from "shiki-stream";

const tokensStream = textStream.pipeThrough(
  new CodeToTokenTransformStream({
    highlighter,
    lang: "javascript",
    theme: "nord"
  })
);
```

Framework renderers available for Vue (`ShikiStreamRenderer`) and as a `ShikiCachedRenderer` for incremental code updates.

### 6. Alternative Full-Stack AI Chat Components

| Library | Stars | Downloads/wk | Framework | Notes |
|---------|-------|-------------|-----------|-------|
| **Streamdown** (Vercel) | 4,363 | 910K | React | Current leader. Streaming-first. |
| **NLUX** | 1,400 | 5.4K | React + JS | Full chat UI with adapters for OpenAI/LangChain/HuggingFace. `<AiChat>` component. Includes `@nlux/highlighter` for code. |
| **Stream.io Chat React AI** | -- | New | React | AI-specific components from Stream. Renders markdown, code, tables, streaming messages. |
| **Incremark** | New | New | Vue/React/Svelte/Solid | O(n) incremental parser. Claims 2-10x faster than Streamdown. Framework-agnostic core. |
| **vue-stream-markdown** | 177 | -- | Vue | Shiki-powered, inspired by Streamdown. |

### 7. Lightweight / Framework-Agnostic Options

| Library | Size | Stars | Approach |
|---------|------|-------|----------|
| **streaming-markdown** (thetarnav) | 3KB gzip | 355 | DOM-only renderer. Google Chrome recommended. Append-only (never modifies existing DOM nodes). |
| **tokenloom** | Small | -- | Progressive event parser for streamed text. Framework-agnostic. |

### 8. `marked` Streaming / Incremental Capabilities

`marked` (v17) supports:
- **`walkTokens`**: Function called for every token. Can be async when `async: true` is set.
- **`async: true` option**: Makes `marked.parse()` return a Promise, allowing async `walkTokens` functions.
- **`processAllTokens` hook**: Pre-processing of full token list before `walkTokens`.
- **`provideLexer` / `provideParser` hooks**: Override lexing/parsing entirely.
- **Custom `renderer` objects**: Override rendering of any token type.

However: **`marked` does NOT have true incremental/streaming parsing.** Every call to `marked.parse()` re-lexes and re-parses the entire input. For streaming scenarios, you either:
1. Re-parse the full accumulated text each time (O(n^2) over the stream)
2. Use a wrapper like Streamdown's `remend` that heals partial syntax before feeding to `marked`
3. Use `incremark` which genuinely parses incrementally

### 9. Google Chrome Best Practices (Official Guidance)

Chrome's developer documentation recommends:
1. **Plain text streaming**: Use `element.append(chunk)` -- never set `textContent` or `innerHTML` on each chunk
2. **Markdown streaming**: Use **streaming-markdown** (thetarnav) for DOM-append-only rendering
3. **Security**: Always use DOMPurify or sanitize-html on LLM output
4. **Avoid**: Concatenating all chunks and re-setting `innerHTML` (causes full re-parse/re-render on each update)

---

## The Stack That Produces the Best-Looking Output

For a **web application** building an AI chat interface in 2026, the optimal stack is:

```
Streamdown v2 (streaming markdown renderer)
  + @streamdown/code (Shiki syntax highlighting, CDN-loaded)
  + @streamdown/math (KaTeX)
  + @streamdown/mermaid (diagrams)
  + Tailwind CSS (typography via built-in classes)
  + Vercel AI SDK useChat() (streaming integration)
```

This gives you:
- Proper handling of incomplete markdown during streaming
- Beautiful code blocks with 200+ language support and copy/download buttons
- Math rendering
- Diagrams
- Security hardening out of the box
- 83.5% smaller bundle than v1 via CDN loading
- Static mode for non-streaming content

For a **terminal application** (like what Builder wraps), the stack is:
```
Ink v6 (React for terminal)
  + marked-terminal (markdown -> ANSI)
  + chalk (colors)
  + Custom React components for chat UI
```

---

## Sources

- [Vercel Streamdown](https://github.com/vercel/streamdown) - Official repo, 4.3K stars, Apache-2.0. Authoritative.
- [Streamdown Docs](https://streamdown.ai/docs) - Official documentation. Authoritative.
- [Streamdown v2 Changelog](https://vercel.com/changelog/streamdown-v2) - Jan 2026 release notes. Authoritative.
- [Streamdown v1.6 Changelog](https://vercel.com/changelog/streamdown-1-6-is-now-available-to-run-faster-and-ship-less-code) - Nov 2025. Authoritative.
- [Codex CLI Issue #1246](https://github.com/openai/codex/issues/1246) - "Improve Markdown rendering" discussion. First-party, highly informative.
- [Codex CLI Architecture Analysis](https://www.philschmid.de/openai-codex-cli) - Philipp Schmid, April 2025. Expert analysis.
- [shiki-stream](https://github.com/antfu/shiki-stream) - Anthony Fu, 568 stars. Authoritative.
- [Shiki](https://github.com/shikijs/shiki) - 12.9K stars, core syntax highlighter. Authoritative.
- [react-shiki](https://www.npmjs.com/react-shiki) - React wrapper for Shiki. Published.
- [streaming-markdown](https://github.com/thetarnav/streaming-markdown) - 355 stars, 3KB. Published.
- [Incremark](https://www.incremark.com/) - New incremental parser with benchmarks. Published.
- [Ink](https://www.npmjs.com/package/ink) - 2.3M weekly downloads, lists Claude Code and Gemini CLI as users. Authoritative.
- [marked-terminal](https://www.npmjs.com/package/marked-terminal) - Used by Codex CLI (patched). Published.
- [Chrome Dev: Render LLM Responses](https://developer.chrome.com/docs/ai/render-llm-responses) - Google official best practices. Authoritative.
- [NLUX](https://github.com/nlkitai/nlux) - 1.4K stars. Published.
- [Stream.io Chat React AI](https://www.npmjs.com/package/@stream-io/chat-react-ai) - Official Stream package. Published.
- [ChatGPT syntax highlighting fix](https://www.reddit.com/r/ChatGPT/comments/1h3bh0o/) - Community reverse engineering, Nov 2024.
- [vue-stream-markdown](https://github.com/jinghaihan/vue-stream-markdown) - 177 stars. Published.
- [marked documentation](https://marked.js.org/using_pro) - Official. walkTokens, async, hooks API.

---

## Confidence Assessment

- **Overall confidence**: HIGH for the web rendering landscape. The Streamdown/Shiki/KaTeX stack is well-documented, heavily adopted, and actively maintained by Vercel.
- **Codex CLI stack**: HIGH confidence on Ink + marked-terminal (confirmed by source code and issue discussions).
- **Claude Code stack**: MEDIUM confidence. Confirmed it uses Ink, but specific markdown rendering internals are not publicly documented.
- **ChatGPT web stack**: MEDIUM confidence. Highlight.js usage confirmed by community reverse engineering but not officially documented by OpenAI.
- **Incremark claims**: LOW-MEDIUM. Benchmarks are self-reported, limited community validation so far.
- **Areas of uncertainty**: Claude.ai web interface rendering stack (completely undocumented). Anthropic has not published any details about their web app's markdown renderer.
- **Recommendation**: For Builder's web rendering needs, Streamdown v2 is the clear choice. If you need non-React or framework-agnostic, investigate streaming-markdown or incremark. For terminal rendering within Builder's Ink layer, marked-terminal with patches (following Codex CLI's pattern) is the pragmatic path.
