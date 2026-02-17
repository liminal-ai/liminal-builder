# Markdown Rendering Stack for AI Coding Assistant Output

**Date**: 2026-02-17
**Context**: Liminal Builder -- vanilla JS web app receiving streaming markdown from coding CLIs (Claude Code, Codex). Dark theme. Needs rich rendering of code blocks, math, tool calls, thinking blocks.

---

## Summary

The streaming AI markdown rendering space has matured significantly in 2025-2026, with purpose-built solutions emerging. For a **vanilla JS app**, the strongest approach is a layered stack: **marked** (fast, small markdown parser) + **Shiki** via **shiki-stream** (VS Code-quality syntax highlighting with true streaming support) + **KaTeX** (fast math) + native browser APIs for clipboard and collapsible sections. If you decide to adopt React for just the chat layer, **Streamdown** (by Vercel) is the clear winner -- it was purpose-built for exactly this use case and powers Vercel's AI Elements.

The critical insight: most markdown parsers were designed for complete documents, not streaming. The key challenge is handling **unterminated blocks** (incomplete code fences, half-written bold markers, partial tables). Two approaches exist: (1) "healing" the markdown before parsing (what Streamdown's `remend` library does), or (2) incremental parsing that only re-parses changed content (what Incremark does). For vanilla JS, you'll likely need to implement your own lightweight healing layer on top of marked.

---

## 1. Markdown-to-HTML Libraries

### marked

- **Bundle size**: ~40 KB minified, ~13 KB gzipped (npm package size 433 KB includes source, docs, etc.)
- **Framework**: Pure JS, no framework dependency
- **Streaming**: No built-in streaming mode, but it is the fastest parser and re-parsing the full document on each chunk is viable for typical AI output lengths (a few KB). The Incremark project uses marked as its "fast engine" for exactly this reason.
- **Quality**: Good GFM support. Active maintenance (v17.0, updated regularly).
- **Extensibility**: Custom renderer, tokenizer, and walker. Can intercept code blocks to route to Shiki.
- **Stars**: 36,500+ | Weekly downloads: ~20M
- **Verdict**: **Best choice for vanilla JS streaming**. Fast enough to re-parse on every chunk for documents under ~50KB. Simple API: `marked.parse(markdown)` returns HTML string.

### markdown-it

- **Bundle size**: ~100 KB minified, ~35 KB gzipped (npm package 767 KB)
- **Framework**: Pure JS
- **Streaming**: No streaming mode. Plugin architecture is its strength.
- **Quality**: Excellent CommonMark compliance. Rich plugin ecosystem (footnotes, containers, math, etc.).
- **Extensibility**: Token-based pipeline with fine-grained plugin hooks. The `stream-markdown-parser` project is built on a TypeScript fork of markdown-it.
- **Note**: Last published 2+ years ago (v14.1.0). Still works fine but not actively evolving.
- **Stars**: 21,000+ | Weekly downloads: ~13M
- **Verdict**: More extensible than marked but larger and slower. Good if you need heavy plugin customization. Overkill for this use case.

### micromark

- **Bundle size**: ~25 KB minified, ~10 KB gzipped (npm package 210 KB)
- **Framework**: Pure JS
- **Streaming**: **Has a streaming interface** -- the only major parser that does. `micromark` can process chunks incrementally via its `postprocess` / `preprocess` pipeline.
- **Quality**: 100% CommonMark compliant. Used internally by remark/unified.
- **Extensibility**: Low-level. Designed as a foundation, not a user-facing tool. Extension authoring is complex.
- **Note**: The Incremark project uses micromark as its "compliant engine" for complex documents.
- **Stars**: 2,100+ | Downloads: moderate (mostly consumed via remark)
- **Verdict**: True streaming, but low-level API makes it harder to work with directly. Best consumed through higher-level wrappers.

### remark / rehype (unified ecosystem)

- **Bundle size**: Large when combined. remark-parse alone is ~20 KB, but the full pipeline (remark + rehype + plugins) can easily reach 150-300 KB.
- **Framework**: Pure JS
- **Streaming**: No streaming mode. AST-based: parse to mdast, transform, serialize to hast, stringify to HTML.
- **Quality**: Gold standard for correctness and extensibility. Powers MDX, Docusaurus, Next.js docs.
- **Extensibility**: Unmatched. rehype-katex, rehype-shiki, remark-gfm, etc. -- huge plugin ecosystem.
- **Note**: This is what Streamdown and react-markdown use under the hood.
- **Verdict**: Too heavy for vanilla JS streaming. Perfect for React (where Streamdown wraps it). The plugin ecosystem is its killer feature.

### Recommendation: Markdown Parser

**For vanilla JS**: Use **marked**. It is the fastest, smallest, most actively maintained parser. Re-parse the full accumulated text on each streaming chunk. For a typical AI response (~2-10 KB of markdown), re-parsing takes <1ms.

**If you adopt React**: Let **Streamdown** handle everything -- it wraps remark/rehype with streaming-optimized healing.

---

## 2. Syntax Highlighting for Code Blocks

### Shiki

- **Bundle size**: ~280 KB gzipped (core + WASM engine + one theme + one grammar). Languages and themes load on demand.
- **Quality**: Uses VS Code's TextMate grammars. Identical highlighting to VS Code. **Best quality by far.**
- **Theme support**: 40+ built-in themes including all VS Code defaults. Supports any VS Code theme. Dual light/dark themes via CSS variables.
- **Streaming**: **shiki-stream** (by Anthony Fu, author of Shiki) provides true streaming highlighting via Web Streams API. 571 stars. Works with vanilla JS, React, and Vue. Uses a "recall" mechanism to correct tokens as more context arrives.
- **Performance**: 3.5-5ms per highlight operation (7x slower than Prism). But shiki-stream amortizes this across streaming chunks.
- **Framework**: Pure JS + WASM. Works everywhere.
- **Verdict**: **Clear winner**. The quality gap is enormous. shiki-stream solves the streaming problem. The bundle size is the only downside, but CDN loading (as Streamdown v2 does) can mitigate this.

### Prism.js

- **Bundle size**: ~12 KB gzipped (core + one theme + one grammar)
- **Quality**: Regex-based. Decent but noticeably worse than Shiki for TypeScript, JSX, nested generics. Fails on complex constructs.
- **Theme support**: ~10 built-in themes. Community themes available.
- **Streaming**: No streaming support. Must highlight complete code blocks.
- **Performance**: 0.5-0.7ms per operation. Fastest option.
- **Framework**: Pure JS
- **Note**: Prism v2 has been "in development" for years. The project appears stalled.
- **Verdict**: Fast and tiny but visually inferior. Not recommended when quality matters.

### highlight.js

- **Bundle size**: ~16 KB gzipped (core + one theme + one grammar)
- **Quality**: Better than Prism for some languages, worse for others. Regex-based. Misidentifies JSX attributes, generic function names. Limited token differentiation.
- **Theme support**: ~90+ built-in themes. Best theme variety.
- **Performance**: 1.1-1.4ms per operation.
- **Framework**: Pure JS
- **Streaming**: No streaming support.
- **Verdict**: More themes but worse quality than Shiki. No streaming. Middle ground nobody needs.

### Recommendation: Syntax Highlighting

**Use Shiki + shiki-stream**. The quality is VS Code-level, and shiki-stream provides real streaming support. For vanilla JS:

```javascript
import { createHighlighter } from 'shiki'
import { CodeToTokenTransformStream } from 'shiki-stream'

const highlighter = await createHighlighter({
  themes: ['github-dark'],
  langs: ['typescript', 'javascript', 'python', 'bash', 'json']
})

// For each code block detected in the stream:
const stream = readableStream
  .pipeThrough(new CodeToTokenTransformStream({
    highlighter,
    lang: 'typescript',
    theme: 'github-dark',
    allowRecalls: true
  }))
```

For the dark theme requirement, `github-dark`, `one-dark-pro`, `vitesse-dark`, and `tokyo-night` are all excellent built-in options.

---

## 3. Math / LaTeX Rendering

### KaTeX

- **Bundle size**: ~100 KB minified JS + ~75 KB CSS + fonts (~300 KB total with fonts)
- **Performance**: Synchronous rendering, no page reflows. Renders in <1ms for typical expressions.
- **Coverage**: Covers ~95% of common LaTeX. Missing: `\label`/`\eqref` cross-references, some obscure environments.
- **Framework**: Pure JS. `katex.renderToString(expr)` returns HTML.
- **Streaming**: Works fine -- render math expressions as they're detected in the stream.
- **Font loading**: Smaller fonts than MathJax (~70% smaller gzipped). Faster initial load.
- **Verdict**: **Recommended**. Faster, smaller, sufficient for AI output (which rarely uses obscure LaTeX).

### MathJax (v3)

- **Bundle size**: ~170 KB minified JS + fonts (~500 KB total)
- **Performance**: MathJax 3 is a complete rewrite. Performance is now comparable to KaTeX (some benchmarks show it slightly faster). But initial load is heavier.
- **Coverage**: Complete LaTeX support. Every obscure command works.
- **Framework**: Pure JS
- **Streaming**: Works but heavier initial setup.
- **Note**: One HN commenter noted "MathJax 3 has significantly improved performance from the previous version and is now a bit faster than KaTeX in my experience." The gap has narrowed.
- **Verdict**: Only needed if you require full LaTeX compatibility. For AI assistant output, KaTeX is sufficient.

### Recommendation: Math

**Use KaTeX**. Smaller bundle, faster load, synchronous rendering. AI coding assistants produce simple inline math at most. If rendering math from user documents that need full LaTeX, consider MathJax.

Integration pattern with marked:

```javascript
import katex from 'katex'

// Custom marked extension to detect $...$ and $$...$$
const mathExtension = {
  name: 'math',
  level: 'inline',
  start(src) { return src.indexOf('$') },
  tokenizer(src) {
    const match = src.match(/^\$\$([\s\S]+?)\$\$/) || src.match(/^\$([^\n]+?)\$/)
    if (match) {
      return { type: 'math', raw: match[0], text: match[1], displayMode: match[0].startsWith('$$') }
    }
  },
  renderer(token) {
    return katex.renderToString(token.text, { displayMode: token.displayMode, throwOnError: false })
  }
}
```

---

## 4. Copy-to-Clipboard for Code Blocks

No library needed. The native **Clipboard API** (`navigator.clipboard.writeText()`) is supported in all modern browsers and is the correct approach.

### Implementation (vanilla JS, ~15 lines)

```javascript
function addCopyButtons(containerEl) {
  containerEl.querySelectorAll('pre > code').forEach(codeBlock => {
    const pre = codeBlock.parentElement
    pre.style.position = 'relative'

    const button = document.createElement('button')
    button.className = 'copy-btn'
    button.textContent = 'Copy'
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(codeBlock.textContent)
        button.textContent = 'Copied!'
        setTimeout(() => button.textContent = 'Copy', 2000)
      } catch (err) {
        console.error('Copy failed:', err)
      }
    })
    pre.appendChild(button)
  })
}
```

### CSS for dark theme

```css
.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

pre:hover .copy-btn { opacity: 1; }
.copy-btn:hover { background: rgba(255, 255, 255, 0.2); }
```

### Recommendation

Zero dependencies. Use `navigator.clipboard.writeText()`. Add visual feedback ("Copied!") with a timeout. Show button only on hover. This is exactly what Streamdown, GitHub, and every modern code renderer does.

---

## 5. Collapsible Sections (Tool Calls, Thinking Blocks)

### Approach: Native `<details>` / `<summary>` elements

No JavaScript library needed. HTML5 `<details>` and `<summary>` provide native, accessible, animated disclosure widgets.

```html
<details class="tool-call">
  <summary>
    <span class="tool-icon">></span>
    <span class="tool-name">Read file: src/index.ts</span>
    <span class="tool-status">completed</span>
  </summary>
  <div class="tool-output">
    <!-- rendered content here -->
  </div>
</details>
```

### Key features (all native, no JS needed)

- **Keyboard accessible**: Enter/Space toggle
- **Screen reader support**: Built-in ARIA semantics
- **`name` attribute**: Groups details elements so only one is open at a time (accordion behavior). Supported in Chrome 120+, Safari 17.2+, Firefox 130+.
- **`open` attribute**: Control default state
- **CSS animations**: Animate with `details[open] > summary ~ *` selectors

### Minimal CSS for dark theme

```css
details.tool-call {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  margin: 8px 0;
  overflow: hidden;
}

details.tool-call summary {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: monospace;
  font-size: 13px;
  color: #aaa;
  list-style: none; /* remove default triangle */
}

details.tool-call summary::before {
  content: '\25B6'; /* right-pointing triangle */
  font-size: 10px;
  transition: transform 0.2s;
}

details.tool-call[open] summary::before {
  transform: rotate(90deg);
}

details.tool-call .tool-output {
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 13px;
}
```

### For streaming tool calls

During streaming, you can create the `<details>` element immediately with a "running" indicator, then update its content as output arrives. Set `open` attribute while streaming, remove it when complete (so it collapses by default).

### Recommendation

Use native `<details>/<summary>`. Zero dependencies, fully accessible, works everywhere. Add a small amount of CSS for styling. Use the `name` attribute for accordion behavior if desired.

---

## 6. Vercel AI SDK Rendering Capabilities

### What the AI SDK provides for rendering

The Vercel AI SDK (now v6) is split into:
- **AI SDK Core** (`ai`): Backend text generation, streaming, tool calls
- **AI SDK UI** (`@ai-sdk/react`, `@ai-sdk/svelte`, `@ai-sdk/vue`): Frontend hooks like `useChat`
- **AI Elements** (`ai-elements`): Pre-built React UI components

**The AI SDK itself does NOT include markdown rendering.** The hooks (`useChat`, `useCompletion`) provide raw text strings. Rendering is your responsibility.

### Streamdown (the rendering layer)

Streamdown is Vercel's answer to markdown rendering for AI streaming. It is a **separate package** (`npm i streamdown`), not part of the AI SDK itself.

- **v2** (Jan 2026): 83.5% smaller bundle via CDN-loaded languages/themes/CSS
- **React-only**: Requires React. It is a drop-in replacement for `react-markdown`.
- **Features**: Shiki highlighting, KaTeX math, Mermaid diagrams, GFM, unterminated block healing (via `remend`), caret cursors, link safety modals, copy buttons on code blocks
- **Weekly downloads**: 910K+ (rapidly growing)
- **License**: Apache-2.0

### AI Elements

The `ai-elements` CLI (`npx ai-elements@latest add message`) scaffolds pre-built React components including:
- **Message** / **MessageResponse** / **MessageActions**: Full chat message rendering with markdown, code blocks, copy, retry, like/dislike
- **Code Block**: Standalone code display with Shiki
- **Conversation**: Auto-scrolling message container
- **Reasoning / Chain of Thought**: Collapsible thinking blocks
- **Tool**: Tool call display
- **Terminal**: Terminal output rendering

These are **React + Tailwind + shadcn/ui** components. They cannot be used outside React.

### Verdict on Vercel stack

If you adopt React for the chat layer, the Vercel stack (AI SDK + Streamdown + AI Elements) is the most polished, production-tested solution available. It is what v0.dev, Vercel's own AI products, and hundreds of AI startups use.

If you stay vanilla JS, none of this is directly usable.

---

## 7. React Chat Component Libraries (if adopting React for chat layer)

### Streamdown + AI Elements (Vercel)

- **Stars**: 4,363 (Streamdown repo)
- **Maturity**: Production-grade. Powers v0.dev.
- **Styling**: Tailwind CSS + shadcn/ui. Dark theme built-in.
- **Features**: Everything -- code blocks, math, mermaid, streaming caret, copy buttons, tool calls, reasoning blocks, message actions
- **AI SDK integration**: Native. Built for `useChat`.
- **Bundle**: v2 uses CDN loading for Shiki languages/themes, reducing base bundle by 83.5%
- **Verdict**: **First choice** if adopting React. Purpose-built for exactly this use case.

### assistant-ui

- **Stars**: 8,470
- **Maturity**: Production-grade. YC-backed.
- **Styling**: shadcn/ui + Radix UI primitives. Composable, headless.
- **Features**: Message rendering, markdown, code highlighting, streaming, auto-scrolling, branching (multiple response branches), model routing
- **AI SDK integration**: Yes, plus LangGraph, Mastra, custom backends
- **Philosophy**: "Radix for AI chat" -- composable primitives, bring your own styles
- **Verdict**: **Best choice if you want maximum control** over rendering while getting chat infrastructure (branching, threading, model switching) for free. More complex API surface than Streamdown.

### llm-ui

- **Stars**: 1,715
- **Maturity**: Moderate. Last release mid-2024. Less active.
- **Features**: Removes broken markdown syntax, throttling for smooth streaming, Shiki code blocks, custom block components
- **Note**: Headless, bring your own styles. Interesting "block" concept where you define custom renderers for different content types.
- **Verdict**: Interesting approach but lower maturity and activity. Streamdown has largely superseded it.

### react-markdown + rehype plugins

- **Stars**: 15,276
- **Maturity**: Very stable. The "standard" React markdown renderer.
- **Features**: Full plugin ecosystem (remark-gfm, rehype-katex, rehype-shiki, etc.)
- **Streaming**: Poor. Re-renders entire markdown on each update. No unterminated block handling. This is why Streamdown was created as its replacement.
- **Verdict**: Fine for static markdown. **Not recommended for streaming AI output.**

### @stream-io/chat-react-ai

- **Stars**: New (published 6 days ago as of research date)
- **Features**: AI-specific React chat components with markdown rendering, code blocks, streaming, file attachments, speech-to-text
- **Note**: From Stream (the chat infrastructure company). Very new. Worth watching.
- **Verdict**: Too new to recommend. Watch for maturity.

---

## 8. Architecture Recommendations

### Option A: Stay Vanilla JS (Recommended for now)

Stack:
1. **marked** (markdown to HTML)
2. **shiki-stream** or Shiki (syntax highlighting) -- load languages on demand
3. **KaTeX** (math, if needed)
4. **Native `navigator.clipboard.writeText()`** (copy)
5. **Native `<details>/<summary>`** (collapsible sections)

You'll need to build:
- A lightweight "markdown healer" that closes unterminated blocks before passing to marked (or accept brief rendering glitches during streaming)
- Code block detection in the HTML output to route to Shiki
- A container component that manages the streaming state and re-renders

Approximate total bundle size: ~330-400 KB gzipped (dominated by Shiki WASM + one theme + a few language grammars)

### Option B: React in an iframe (for chat layer only)

Stack:
1. **Streamdown** (handles markdown + Shiki + KaTeX + GFM + streaming healing + copy buttons + carets)
2. **AI Elements** components (Message, Tool, Reasoning, CodeBlock, Conversation)
3. Wrap in an iframe to isolate React from your vanilla JS app

Benefits:
- Production-tested rendering with zero custom code
- Unterminated block healing handled for you
- Copy buttons, code block headers, caret cursor -- all built in
- Dark theme via Tailwind/shadcn
- Maintained by Vercel

Costs:
- React dependency (~45 KB gzipped)
- iframe communication overhead (postMessage API)
- More complex deployment (two bundles)
- Tailwind CSS in the iframe

### Option C: Incremark (emerging alternative for vanilla JS)

Stack:
1. **Incremark** with marked engine (incremental streaming parser)
2. Shiki for code highlighting
3. KaTeX for math

Benefits:
- True incremental parsing (O(n) vs O(n^2) for re-parsing)
- Framework-agnostic core
- 2-28x faster than re-parsing for long documents

Costs:
- Newer project (Dec 2025), less battle-tested
- Documentation mostly in Chinese
- Framework adapters exist for React/Vue/Svelte/Solid but vanilla JS usage is less documented

---

## 9. Streaming-Specific Considerations

### The unterminated block problem

When streaming, you regularly hit states like:
- `**bold text` (no closing `**`)
- ` ```typescript\nconst x = ` (no closing fence)
- `| col1 | col2 |\n|---` (incomplete table)

**Solutions**:
1. **Streamdown's `remend`**: Healing library that detects and closes unterminated blocks before parsing. React-only.
2. **Manual healing**: Before calling `marked.parse()`, detect and close open blocks. A simple version:
   ```javascript
   function healMarkdown(text) {
     // Close unclosed code fences
     const fenceCount = (text.match(/^```/gm) || []).length
     if (fenceCount % 2 !== 0) text += '\n```'
     // Close unclosed bold/italic (simplified)
     // ... etc
     return text
   }
   ```
3. **Incremark**: Handles this at the parser level by tracking block state.

### Rendering strategy for streaming

For vanilla JS, the pragmatic approach:
1. Accumulate the full text received so far
2. On each new chunk, heal the accumulated text, parse with marked, and set `innerHTML`
3. For code blocks, run Shiki highlighting after parse (or use marked's custom renderer to invoke Shiki)
4. Debounce rendering to ~16ms (requestAnimationFrame) to avoid excessive DOM updates

This is O(n^2) in theory but irrelevant in practice -- AI responses are small enough that re-parsing is <1ms.

---

## Sources

- [Streamdown](https://streamdown.ai/) / [GitHub](https://github.com/vercel/streamdown) - Vercel's streaming markdown renderer. 4,363 stars. Highly authoritative.
- [Streamdown v2 changelog](https://vercel.com/changelog/streamdown-v2) - Bundle size reduction details. Official Vercel source.
- [shiki-stream](https://github.com/antfu/shiki-stream) - Streaming Shiki highlighting by Anthony Fu. 571 stars. Authoritative (author of Shiki itself).
- [Incremark](https://www.incremark.com/) - Incremental markdown parser. Newer project, promising approach.
- [Comparing web code highlighters](https://chsm.dev/blog/2025/01/08/comparing-web-code-highlighters) - Thorough Prism/HLJS/Shiki comparison with benchmarks.
- [assistant-ui](https://github.com/assistant-ui/assistant-ui) - React AI chat library. 8,470 stars. YC-backed.
- [llm-ui](https://llm-ui.com/) - React LLM rendering library. 1,715 stars.
- [AI Elements](https://elements.ai-sdk.dev/) - Vercel's pre-built AI UI components.
- [npm-compare: marked vs markdown-it vs micromark](https://npm-compare.com/markdown-it,marked,micromark,remark,showdown) - Download/size comparison data.
- [marked streaming issue #3657](https://github.com/markedjs/marked/issues/3657) - Discussion of marked's streaming limitations.
- [KaTeX vs MathJax comparison](https://www.intmath.com/cg5/katex-mathjax-comparison.php) - Performance benchmark page.
- [MDN: details element](https://developer.mozilla.org/en-US/blog/html-details-exclusive-accordions/) - Native collapsible sections documentation.
- [Zenn: Prism to Shiki migration](https://zenn.dev/team_zenn/articles/zenn-prism-to-shiki) - Real-world migration case study.

---

## Confidence Assessment

- **Overall confidence**: **High**. This is a well-documented space with clear market leaders.
- **Highest confidence**: Shiki is the right syntax highlighter; marked is the right vanilla JS parser; Streamdown is the right React solution.
- **Medium confidence**: Incremark is promising but too new to fully evaluate. shiki-stream works but has low adoption (571 stars).
- **Area of uncertainty**: Bundle size of a full vanilla JS stack with Shiki WASM. Shiki's initial load time could be noticeable on slow connections. CDN loading (as Streamdown v2 does) may be the answer.
- **Recommendations for further research**: If you pursue Option A (vanilla JS), prototype the marked + shiki-stream integration to validate the streaming code block detection works smoothly. The main risk is correctly detecting when a code block is "complete enough" to start highlighting.
