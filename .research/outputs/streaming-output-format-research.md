# Streaming Output Format Research: Claude Code, Codex CLI, and API Content Formatting

> Research conducted 2026-02-17. All findings verified against local SDK sources, official documentation, and open-source repositories.

---

## Summary

The text content flowing through both the Anthropic Messages API and the OpenAI Responses API is **markdown**. Neither API has a formatting metadata field or pre-formatted terminal escape codes. The models produce markdown text (headings, bold, code blocks, lists, etc.) as their natural output format. Both Claude Code and Codex CLI then **render that markdown client-side** using terminal markdown renderers -- Claude Code uses an internal renderer built on React/Ink, and Codex CLI uses `marked-terminal` (patched) in its TypeScript TUI and `tui-markdown` in its Rust TUI. When you consume streaming output via the Claude Agent SDK or the OpenAI API, you get raw markdown text in the `content` fields. Rendering is your problem.

---

## Key Findings

- **The Anthropic Messages API returns plain text content that is markdown by convention, not by schema.** The `content` array contains `{ type: "text", text: "..." }` blocks. The `text` field is an unstructured string. There is no `format` or `content_type` metadata. The model simply outputs markdown because its system prompt and training tell it to.

- **The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) passes through raw API content unchanged.** The `SDKAssistantMessage.message` field is a `BetaMessage` from `@anthropic-ai/sdk` -- the exact API response object. Text content blocks contain the same markdown string the model produced. The `SDKPartialAssistantMessage.event` wraps raw `BetaRawMessageStreamEvent` objects with `text_delta` containing incremental markdown text fragments.

- **Claude Code renders markdown in its React/Ink terminal UI.** Claude Code is built with React + Ink (confirmed by Ink's own documentation listing Claude Code as a user). The rendering pipeline converts React scene graph to ANSI escape sequences. Claude Code has an open feature request (#13600) specifically asking for *better* markdown rendering, which confirms the current model: Claude outputs markdown, the TUI renders it.

- **Codex CLI explicitly uses `marked-terminal` for markdown rendering.** The TypeScript Codex CLI uses the `marked-terminal` npm package (with patches) to render markdown to terminal ANSI. The Rust Codex TUI uses `tui-markdown` (based on `pulldown-cmark`). Issue #1246 on the Codex repo is specifically about improving markdown rendering quality across both TUIs.

- **The Codex prompting guide explicitly states the model outputs plain text that the CLI styles.** From the official Codex prompting guide: "You are producing plain text that will later be styled by the CLI." and "Plain text; CLI handles styling." This is the authoritative statement on the architecture.

- **The `SDKResultMessage.result` field is a plain string** -- no structured content, no formatting metadata. Just the final text output.

- **Your existing `ClaudeSdkProvider` already handles this correctly.** The `content` field in `MessageUpsert` carries the raw string from `text_delta` events. The content is accumulated markdown text.

---

## Detailed Analysis

### 1. Anthropic Messages API: What Format is the Response?

The Messages API response structure:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Here's a **markdown** formatted response with:\n\n- Bullet points\n- `code blocks`\n\n```python\nprint('hello')\n```"
    }
  ]
}
```

The streaming equivalent delivers this as `content_block_delta` events:

```json
{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Here's a "}}
{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "**markdown**"}}
{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": " formatted response"}}
```

There is **no** `content_type`, `format`, or `mime_type` field anywhere in the API response schema. The text is just text. Whether it contains markdown formatting depends entirely on the model's training and system prompt.

Claude's system prompts instruct it to use markdown formatting. The Claude Code system prompt (accessible via `systemPrompt: { type: 'preset', preset: 'claude_code' }`) includes specific instructions about output formatting.

### 2. Claude Agent SDK: What Does `query()` Return?

From the local SDK reference (`/Users/leemoore/liminal/docs/reference/claude-agent-sdk-reference.md`) and the actual type definitions (`sdk.d.ts`):

**Without streaming (`includePartialMessages: false`, the default):**
- You get `SDKAssistantMessage` objects where `message: BetaMessage` contains the complete API response
- `message.content` is an array of content blocks, including `{ type: "text", text: "<markdown string>" }`
- The text is raw markdown

**With streaming (`includePartialMessages: true`):**
- You get `SDKPartialAssistantMessage` objects where `event: BetaRawMessageStreamEvent`
- For text content: `event.type === "content_block_delta"` with `event.delta.type === "text_delta"` and `event.delta.text === "<markdown fragment>"`
- These are the raw API streaming events, passed through without transformation

**Result message:**
- `SDKResultSuccess.result` is a `string` -- the final text output, still markdown

The SDK performs zero content transformation. It is a transparent pipe from the Claude API to your code.

### 3. Claude Code's Rendering Architecture

Claude Code is a React/Ink application. The rendering pipeline:

1. Claude model generates markdown text via the API
2. Claude Code subprocess receives streaming events over JSONL stdin/stdout
3. The SDK parent process yields `SDKMessage` objects
4. React/Ink components receive these messages and render them
5. Ink converts the React component tree to ANSI escape sequences for the terminal

The `output_style` field in `SDKSystemMessage` controls the system prompt, which influences *what* markdown the model produces -- but the content is always markdown text that gets rendered by the TUI.

Claude Code has an open feature request (#13600, Dec 2025) for better markdown rendering. Comments confirm users see "raw markdown syntax (`**bold**`, `# Header`, code blocks)" when rendering fails or is incomplete. The issue is tagged `area:tui`, confirming rendering is a TUI concern, not an API concern.

A bug report (#14755) also describes "Markdown renderer truncates output" -- further confirming there is a markdown renderer in the rendering pipeline.

### 4. Codex CLI's Rendering Architecture

Codex CLI has two implementations:
- **TypeScript TUI**: Uses React/Ink with `marked-terminal@7.3.0` (patched) for markdown-to-ANSI conversion
- **Rust TUI**: Uses `tui-markdown` (based on `pulldown-cmark`) for markdown-to-ANSI conversion

From the Codex prompting guide (official OpenAI documentation):
```
You are producing plain text that will later be styled by the CLI. Follow these rules exactly.
```

And:
```
- Plain text; CLI handles styling. Use structure only when it helps scanability.
```

This is definitive. The model outputs markdown-like plain text. The CLI renders it.

The OpenAI Responses API (and Chat Completions API) similarly returns text content with no formatting metadata:
```json
{"type": "response.output_text.delta", "delta": "Here's **some markdown**"}
```

### 5. Implications for Liminal Builder

Given that both providers return raw markdown text:

**What you receive from Claude Agent SDK:**
- `text_delta` events containing markdown text fragments
- Complete `SDKAssistantMessage.message.content[].text` containing full markdown text

**What you receive from Codex (via ACP or direct):**
- Text delta events containing markdown text fragments
- The same markdown content the model produced

**What your `MessageUpsert.content` field contains:**
- Raw markdown text, accumulated from streaming deltas
- No formatting metadata, no ANSI codes, no pre-rendered content

**What this means for the browser UI:**
- You **must** render the markdown on the client side
- Use a markdown renderer (e.g., `react-markdown`, `marked`, `markdown-it`) in the browser
- For streaming, you need a markdown renderer that handles incremental/partial markdown gracefully
- Consider syntax highlighting for code blocks (`highlight.js`, `shiki`, `prism`)
- The `thinking` content blocks are also plain text (not markdown by convention, but unstructured text)

**What this means for the streaming pipeline:**
- The upsert processor correctly treats `content` as an opaque string
- No content transformation is needed in the pipeline
- Format detection/rendering is purely a UI concern
- Both providers produce the same type of content (markdown text), so the browser can use a single renderer

---

## Sources

| Source | Type | Notes |
|---|---|---|
| `/Users/leemoore/liminal/docs/reference/claude-agent-sdk-reference.md` | Local reference doc | Scraped 2026-02-15, authoritative |
| `/Users/leemoore/liminal/node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.42.../sdk.d.ts` | SDK type definitions | Actual installed SDK, definitive |
| `/Users/leemoore/liminal/apps/liminal-builder/server/providers/claude/claude-sdk-provider.ts` | Project source | Current provider implementation |
| [Anthropic Messages API Streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) | Official docs | Confirms text_delta format |
| [Anthropic Messages API Reference](https://platform.claude.com/docs/en/api/messages) | Official docs | Confirms content block structure |
| [Claude Code Output Styles](https://code.claude.com/docs/en/output-styles) | Official docs | Confirms output styles modify system prompt, not content format |
| [Claude Code Feature Request #13600](https://github.com/anthropics/claude-code/issues/13600) | GitHub issue | Confirms markdown rendering is TUI-side |
| [Codex CLI Markdown Rendering #1246](https://github.com/openai/codex/issues/1246) | GitHub issue | Confirms marked-terminal and tui-markdown usage |
| [Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide/) | Official docs | "Plain text; CLI handles styling" |
| [Ink GitHub](https://github.com/mjackson/react-ink) | Official repo | Lists Claude Code and Codex as users |

---

## Confidence Assessment

- **Overall confidence: HIGH.** Multiple independent sources converge on the same answer.
- The API format is definitively documented and verified against installed SDK types.
- The rendering architecture is confirmed by official documentation, open-source code, and issue trackers.
- **No conflicting information** was found across any sources.
- **One nuance**: The Codex prompting guide says "plain text" not "markdown" -- but the model still uses markdown conventions (headings, bold, code blocks, bullet lists) and the CLI uses a markdown renderer. The distinction is that the prompt tells the model to be conservative with formatting, not that it avoids markdown entirely.
