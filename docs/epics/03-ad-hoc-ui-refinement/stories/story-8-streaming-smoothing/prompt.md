# Story 8: Client-Side Streaming Smoothing — Pairing Session Prompt

## Project Context

**Liminal Builder** is an agentic IDE wrapping AI coding CLIs in a browser chat interface. Agent responses stream in as `UpsertObject` messages over WebSocket → shell → portlet postMessage. Each upsert carries the full accumulated content (not a diff).

**Server-side batching:** Both providers (after Story 7) use a token batch gradient `[10, 20, 40, 80, 120]`. Early in a response, upserts arrive frequently with small deltas. Later, upserts arrive less frequently with large deltas. This means streaming starts feeling smooth but gets progressively chunkier.

## Current Client Rendering During Streaming (Verified)

The actual streaming path (not what it might appear from the exports):

1. **WebSocket → shell → portlet:** Shell receives `session:upsert`, posts to portlet iframe via `postMessage`
2. **portlet.js `handleShellMessage`** → routes to `applyUpsert()` (line 324)
3. **`applyUpsert()`** calls `mapUpsertToEntry()` to transform the upsert into a chat entry, then calls `chat.renderEntry(nextEntry)` (line 340)
4. **`chat.renderEntry()`** dispatches to `renderAssistantEntry()` (chat.js line 103)
5. **`renderAssistantEntry()`** checks `finalizedEntryIds` — if not finalized, sets `element.textContent = contentValue` (line 122). Full content replacement on each upsert.
6. **On finalization** (upsert with `status: "complete"`): `applyUpsert` calls `chat.finalizeEntry()` (line 343) which adds to `finalizedEntryIds` and re-renders with `element.innerHTML = renderMarkdown(content)` (line 371).

**Note:** `chat.js` exports `updateEntryContent()` (line 338) but it's **not called from anywhere in portlet.js**. The actual streaming path goes through `renderEntry` → `renderAssistantEntry`, not `updateEntryContent`. The export may be a leftover from an earlier design.

**CSS:** `.streaming-cursor::after` (portlet.css line 133) — blinking cursor pseudo-element added during streaming, removed on finalization.

The visual experience: text appears in bursts that get bigger over time (following the batch gradient), then a reflow on finalization when markdown kicks in.

## Key Files

- `client/portlet/chat.js` — `renderAssistantEntry()` (line 103): the actual streaming render path. `finalizeEntry()` (line 360): the markdown switch. `updateEntryContent()` (line 338): exported but unused — may be removable or repurposed for smoothing.
- `client/portlet/portlet.js` — `applyUpsert()` (line 324): entry point for all upserts. `mapUpsertToEntry()` (line 258): transforms upsert to chat entry with full accumulated content.
- `client/portlet/portlet.css` — `.streaming-cursor` animation (line 133).
- `client/shared/markdown.js` — `renderMarkdown()` for finalization.

## What We're Working On

Smoothing the visual cadence of streaming so it feels consistent regardless of server batch size. When a large chunk arrives (e.g. 120 tokens at once), instead of slamming it into the DOM, progressively reveal it at a rate that approximates the feel of the smaller early batches.

Approaches to explore:

- **Word trickle:** In `renderAssistantEntry`, instead of setting `textContent` to the full new content immediately, detect the delta (new content minus what's currently displayed), buffer it, and append words on a `requestAnimationFrame` or `setInterval` loop. Need to handle new upserts arriving before previous animation finishes (flush pending buffer, start new animation with the new delta).
- **CSS reveal:** Append full text but use opacity/clip animation to reveal it progressively. Avoids DOM churn but tricky with text reflow and line breaks.
- **Visual mask/gradient:** Append full text immediately (correct scroll height) but mask the new portion with a gradient overlay that fades away. Hybrid approach — scroll height is correct but visual reveal is smooth.
- **Repurpose `updateEntryContent`:** The unused export could become the smoothing entry point — `applyUpsert` calls a smoothing wrapper instead of going directly through `renderEntry`.

## Things to Consider

- **Interaction with Story 4 (markdown rendering).** Currently streaming is raw `textContent` and finalization swaps to `innerHTML`. If Story 4 adds incremental markdown parsing during streaming, the smoothing mechanism needs to work with HTML content, not just text. [OPEN: should smoothing work on raw text first (simpler), then adapt for markdown-during-streaming later? Or solve both together?]
- **Delta detection is straightforward.** The client receives full accumulated content each time, and the previous content is stored in `entriesById` (chat.js line 311). So `newContent.slice(previousContent.length)` gives the delta. Edge case: content could theoretically shrink (error correction?) — handle gracefully.
- **Auto-scroll during animation.** The scroll tracking in `autoScroll()` (chat.js line 192) checks `userScrolledUp` and scrolls to bottom. During a trickle animation, scroll should track incrementally with each appended word, not jump to final position. The current `autoScroll` is called after `renderEntry` — it may need to be called during animation frames too.
- **Performance.** This runs in an iframe portlet. `requestAnimationFrame` loops on every streaming update need to be lightweight. Avoid layout thrash — batch DOM reads/writes.
- **Animation cancellation.** When a new upsert arrives mid-animation, the pending animation needs to flush instantly (show all remaining buffered text) before starting the new delta animation. Otherwise animations stack and the displayed content falls behind.
- **Finalization transition.** The reflow from `textContent` to `innerHTML` (markdown) is a separate visual jarring moment. Smoothing the streaming doesn't fix this. Consider: could the finalization also animate? Or could markdown rendering start earlier so the transition is less dramatic? This overlaps with Story 4.

## Confidence Notes

What's verified (read the code):
- Streaming path is `applyUpsert` → `renderEntry` → `renderAssistantEntry` → `element.textContent` — confirmed at portlet.js line 340 and chat.js line 122.
- `updateEntryContent()` is exported but NOT called from portlet.js — confirmed via grep.
- Finalization path: `applyUpsert` checks `upsert.status === "complete"` and calls `chat.finalizeEntry()` — confirmed at portlet.js lines 342-344.
- `finalizeEntry` sets `innerHTML = renderMarkdown()` — confirmed at chat.js line 371.
- Entry content stored in `entriesById` map — confirmed at chat.js line 311.
- `autoScroll()` called after `renderEntry` — confirmed at chat.js line 330.
- `.streaming-cursor::after` animation — confirmed at portlet.css line 133.

What needs verification in session:
- What the actual perceived feel is. The batch gradient means early upserts are 10 words apart and later ones are 120 words. Whether the 120-word jumps are actually noticeable depends on timing — if the model generates fast, 120 words might arrive in <1 second, which may feel OK. The user reported it's chunky, so likely a real issue, but worth observing before over-engineering. (Can't verify without running the app.)
- Whether `requestAnimationFrame` inside an iframe has any performance quirks vs. main frame. (~85% confident it works normally, but iframes can sometimes have throttled rAF when not visible — the app shows/hides iframes with `display:none/block`.)

## Session Style

This is an interactive pairing session focused on research and prototyping. We'll explore approaches, try things in the browser, evaluate the feel, and iterate. This is more experimental than the other stories — the right approach may not be obvious upfront.
