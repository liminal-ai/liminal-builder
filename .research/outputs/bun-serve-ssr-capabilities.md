# Bun.serve() Server-Side Rendering Capabilities

**Research Date**: 2026-02-17
**Bun Version Context**: 1.3.x (current), findings also cover 1.2.x feature introductions

---

## Summary

Bun.serve() does **not** have built-in SSR in its `routes` API. The `routes` object and HTML imports system is a **client-side asset bundler** -- it bundles HTML/CSS/JS/TSX for the browser, not for server rendering. However, SSR is absolutely possible through the `fetch` handler using React's `renderToReadableStream()`. This is a documented, officially supported pattern with React 19+ performance optimizations specific to Bun. React Server Components (RSC) are **not supported** -- Bun has no RSC runtime, and this remains a significant gap. The Bun team is actively working on a system internally called "bake" that will add production SSR and server component support, but it is not shipped yet.

The practical upshot: you can do SSR today with Bun.serve(), but you wire it yourself in the `fetch` handler. The `routes` API is for client-side pages and API endpoints only. There is no built-in equivalent to Next.js pages/server rendering.

---

## Key Findings

- **HTML imports in `routes` are client-only bundling.** They use HTMLRewriter to scan `<script>` and `<link>` tags, run Bun's bundler on them, and serve the result. No server-side rendering occurs.
- **SSR works via `fetch` handler + `renderToReadableStream()`.** This is the officially documented pattern. You call React's streaming SSR API and return the stream as a Response.
- **React 19 has Bun-specific SSR optimizations.** React 19 takes advantage of Bun's "direct" ReadableStream implementation for better streaming performance.
- **You cannot return JSX from a route handler and have it auto-render.** There is an open feature request for this (GitHub issue #20075, May 2025) -- still open, no Bun team response.
- **You cannot return HTMLBundle from `fetch` handler.** Issue #17595 requests this -- currently HTMLBundle and Response are incompatible types.
- **React Server Components are not supported.** No RSC runtime exists in Bun. Discussion #5816 (Sep 2023) remains unanswered.
- **"Bake" is the internal project for production SSR + server components.** Tracking issue #14763 shows active work on static rendering, server component manifests, and a server runtime (described as "likely a special property on Bun.serve"). This is in-progress but not shipped.
- **The fullstack docs explicitly list SSR as a limitation.** The docs state: "Server-side rendering (SSR) is not built-in" and list "Built-in SSR support" as a planned feature.
- **Suspense streaming has known bugs with Bun.serve().** Issue #16721 reports that `renderToReadableStream` with Suspense causes render aborts under Bun (works fine under Node). This was filed Jan 2025.

---

## Detailed Analysis

### 1. What the `routes` API Actually Supports

The `routes` object in `Bun.serve()` (v1.2.3+) accepts these value types:

| Route Value Type | Example | Purpose |
|---|---|---|
| `Response` object | `"/status": new Response("OK")` | Static response |
| Function handler | `"/users/:id": req => new Response(...)` | Dynamic API endpoint |
| Per-method handlers | `"/api/posts": { GET: ..., POST: ... }` | REST endpoints |
| HTML import | `"/": homepage` (from `import homepage from "./index.html"`) | Client-side page (bundled) |
| `Bun.file()` | `"/favicon.ico": Bun.file("./favicon.ico")` | Static file serving |
| `Response.redirect()` | `"/old": Response.redirect("/new")` | Redirects |
| `Response.json()` | `"/api/*": Response.json({...})` | JSON responses |

**Notably absent**: Any server-rendering value type. No JSX-to-HTML, no template rendering, no server component support.

### 2. HTML Imports: Client-Only Bundling Pipeline

When you write:
```ts
import homepage from "./index.html";
serve({ routes: { "/": homepage } });
```

Bun's pipeline:
1. Uses HTMLRewriter to scan the HTML for `<script>` and `<link>` tags
2. Runs Bun's JS/CSS bundler on referenced assets
3. Transpiles TypeScript, JSX, TSX
4. Downlevels CSS
5. Serves the bundled result to the browser

This is a **build-and-serve** pipeline for static frontend assets. The HTML file is a template for client-side code. There is no server-side execution of the referenced scripts.

### 3. SSR via fetch Handler (The Working Pattern)

The officially documented SSR approach bypasses `routes` entirely and uses the `fetch` handler:

```tsx
import { renderToReadableStream } from "react-dom/server";

function Page({ title }: { title: string }) {
  return (
    <html>
      <head><title>{title}</title></head>
      <body><h1>{title}</h1></body>
    </html>
  );
}

Bun.serve({
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/") {
      const stream = await renderToReadableStream(
        <Page title="Home" />
      );
      return new Response(stream, {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});
```

**Key characteristics of this pattern:**
- You manually wire routing in `fetch`
- You manually call `renderToReadableStream`
- You manually set Content-Type headers
- No integration with the `routes` system or HTML imports
- No automatic client hydration setup
- No automatic asset bundling for the client bundle
- Works with React 19's streaming optimizations on Bun

### 4. Hybrid Pattern: routes + fetch Fallback for SSR

You can combine both -- use `routes` for API endpoints and static pages, and `fetch` as a fallback for SSR:

```tsx
Bun.serve({
  routes: {
    "/api/data": { GET: () => Response.json({ items: [] }) },
    "/static-page": staticPage,  // HTML import
  },
  async fetch(req) {
    // SSR fallback for routes not in the routes object
    const stream = await renderToReadableStream(<ServerRenderedPage />);
    return new Response(stream, {
      headers: { "Content-Type": "text/html" },
    });
  },
});
```

This is the pragmatic approach today but has a significant limitation: the SSR'd pages won't benefit from HTML imports' automatic bundling, HMR, or asset pipeline.

### 5. React Server Components (RSC) Status

**Not supported.** RSC requires:
- A bundler that understands `"use client"` / `"use server"` directives
- A server component runtime that can serialize component trees
- A client runtime that can hydrate from the serialized format
- Integration between server and client bundles

Bun has none of this today. The "bake" project (tracking issue #14763) is working toward it:
- Server component manifest generation is listed as in-progress
- `separateSSRGraph` is a tracked task
- A server runtime as "a special property on Bun.serve" is mentioned
- The entry file convention is undecided (`bun.app.ts` vs `bun.config.ts` vs `bun.bake.ts`)

### 6. Known Issues and Gotchas

- **Suspense streaming bug** (issue #16721): `renderToReadableStream` with `React.Suspense` causes render aborts under Bun but works under Node. Filed Jan 2025, labeled "needs investigate." This could be a blocker for real SSR workloads.
- **HTMLBundle not returnable from fetch** (issue #17595): You can't dynamically serve an HTML import from the `fetch` handler, which means no middleware/auth on HTML routes.
- **No JSX auto-rendering in routes** (issue #20075): You can't do `"/": () => <Page />` and have it render to HTML.

### 7. No Built-in Templating

Bun.serve() has no built-in templating engine. No EJS, no Handlebars, no JSX-to-HTML in routes. If you want server-rendered HTML, your options are:
1. `renderToReadableStream` (React)
2. Manual string concatenation / template literals
3. Third-party templating libraries
4. Frameworks built on Bun (Elysia, Hono) that add their own HTML helpers

---

## Sources

- [Bun Fullstack Dev Server Docs](https://bun.com/docs/bundler/fullstack) - Official documentation. Explicitly lists SSR as "not built-in" and a future plan. **Highly authoritative.**
- [Bun Server Docs](https://bun.com/docs/runtime/http/server) - Official routes API documentation. **Highly authoritative.**
- [Bun SSR React Guide](https://bun.com/docs/guides/ecosystem/ssr-react) - Official guide showing renderToReadableStream pattern. **Highly authoritative.**
- [GitHub Issue #20075](https://github.com/oven-sh/bun/issues/20075) - Feature request for JSX templating in routes. Open, no official response. May 2025.
- [GitHub Issue #17595](https://github.com/oven-sh/bun/issues/17595) - Feature request for HTMLBundle in fetch handler. Open. Feb 2025.
- [GitHub Issue #16721](https://github.com/oven-sh/bun/issues/16721) - Suspense streaming bug. Open, "needs investigate." Jan 2025.
- [GitHub Issue #14763](https://github.com/oven-sh/bun/issues/14763) - "Bake" production build tracking issue. Shows active SSR/RSC development. Oct 2024.
- [GitHub Discussion #5816](https://github.com/oven-sh/bun/discussions/5816) - RSC support question. Unanswered. Sep 2023.
- [SSR with Bun and React (dobla.do)](https://dobla.do/blog/ssr-with-bun-and-react/) - Community blog post showing manual SSR setup. Jan 2025. Good practical reference.
- [Diving into SSR with Bun & React 19 (blog.reilly.dev)](https://blog.reilly.dev/diving-into-ssr-with-bun-and-react-19) - Community blog covering SSR challenges and hydration. June 2025.
- [Bun.Serve API Reference](https://bun.com/reference/bun/Serve) - Type definitions showing route handler signatures. **Authoritative.**

---

## Confidence Assessment

- **Overall confidence: High.** Multiple official sources confirm the same picture consistently.
- **High confidence**: HTML imports are client-only. SSR is not built into routes. The renderToReadableStream pattern works.
- **High confidence**: RSC is not supported. The "bake" project is in progress but not shipped.
- **Medium confidence**: The Suspense streaming bug status -- it was filed over a year ago and may have been fixed without the issue being updated, but no evidence of a fix was found.
- **Area of uncertainty**: Timeline for "bake" / built-in SSR. The tracking issue is active but there's no public roadmap date. Could be months away or further.
- **Recommendation**: If you need SSR with Bun.serve() today, use the `fetch` handler + `renderToReadableStream` pattern. If you need RSC or framework-level SSR, use Next.js running on Bun runtime (`bun --bun next dev`), or use a framework like Hono/Elysia that adds server rendering helpers on top of Bun.
