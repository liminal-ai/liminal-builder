# Bun as a Web Framework: What Exists in 2025-2026

## Summary

There is no separate "React-like Bun web framework." What exists -- and what the user is almost certainly referring to -- is **Bun's built-in full-stack development platform** that shipped with Bun 1.2.3 (Feb 2025) and matured significantly in Bun 1.3 (Oct 2025). This is not a UI component framework. It is a zero-config full-stack runtime that makes React (actual React) work out of the box with `bun init --react`, HTML imports, built-in bundling, HMR, API routing, and a unified dev server -- all without Vite, webpack, or any external tooling. The pitch is: "React just works with Bun."

Bun was acquired by Anthropic in December 2025. The runtime continues as open source, MIT-licensed, same team, with Anthropic investing engineering resources.

## Key Findings

- **Bun does NOT have its own React alternative or component model.** It uses actual React (react, react-dom).
- **`bun init --react`** scaffolds a full-stack React app with API server, HMR, production builds -- zero config, no Vite/webpack.
- **HTML imports** are the core primitive: `import homepage from "./index.html"` in `Bun.serve()` routes. Bun auto-bundles referenced `<script>` and `<link>` tags.
- **The fullstack dev server** (`Bun.serve()` with `routes`) unifies frontend + backend in a single process with built-in routing, HMR, and production bundling.
- **`bun create ./MyComponent.tsx`** can turn any single React component into a full dev environment -- positioned as the "Create React App successor."
- **No separate framework to install.** The framework capabilities are built into Bun itself.
- **Third-party Bun-native frameworks exist** (Elysia, BETH stack, Kotekan) but none are "the" React-like Bun framework.

## Detailed Analysis

### What Bun 1.2.3+ / 1.3+ Provides as a "Framework"

Starting with v1.2.3 (Feb 2025), Bun added a full-featured frontend development toolchain. By v1.3 (Oct 2025), this became what Bun calls a "batteries-included full-stack JavaScript runtime."

#### The Fullstack Dev Server

The core API pattern:

```ts
import { serve } from "bun";
import dashboard from "./dashboard.html";
import homepage from "./index.html";

const server = serve({
  routes: {
    // HTML imports -- Bun bundles referenced JS/CSS automatically
    "/": homepage,
    "/dashboard": dashboard,

    // API endpoints
    "/api/users": {
      async GET(req) {
        const users = await sql`SELECT * FROM users`;
        return Response.json(users);
      },
      async POST(req) {
        const body = await req.json();
        // ...
      }
    },

    // Dynamic routes
    "/api/users/:id": async (req) => {
      const { id } = req.params;
      return Response.json({ id });
    }
  },
  development: {
    hmr: true,
    console: true  // streams browser console to terminal
  }
});
```

HTML files are first-class imports. When Bun encounters `import x from "./page.html"`, it:
1. Scans the HTML for `<script>` and `<link>` tags
2. Runs Bun's JS/TS/JSX/CSS bundler on them
3. Transpiles TypeScript, JSX, TSX
4. Generates content-addressed hashed URLs
5. Serves the result

#### `bun init --react` Scaffolding

Generates a complete full-stack project:

```
src/
  index.tsx       # Server entry point with API routes
  frontend.tsx    # React app entry point with HMR
  App.tsx         # Main React component
  APITester.tsx   # API testing component
  index.html      # HTML template
  index.css       # Styles
  *.svg           # Assets
package.json
tsconfig.json
bunfig.toml
```

Commands:
- `bun dev` -- dev server + React app with hot reloading
- `bun start` -- API server + frontend in one process (production)
- `bun run build` -- static site output to `dist/`

#### `bun create ./MyComponent.tsx`

Takes any existing React component file and generates a complete dev environment around it:
- `${component}.css`
- `${component}.client.tsx` (frontend entry point)
- `${component}.html`

Positioned explicitly as the "Create React App successor."

### What Bun Is NOT

- **Not a UI component framework** -- no Bun-specific component model, state management, or rendering engine
- **Not a React alternative** -- it uses actual React and ReactDOM
- **Not a meta-framework like Next.js** -- no file-based routing, no SSR, no server components built in (though Kotekan adds RSC support on top of Bun)

### Third-Party Bun-Ecosystem Frameworks

| Framework | What It Is | Status |
|-----------|-----------|--------|
| **Elysia** | Fast web framework (backend) built for Bun. Type-safe, DI, validation. | Active, popular |
| **BETH Stack** | Bun + Elysia + Turso + HTMX. Hypermedia-driven, server-rendered. | Community pattern |
| **Kotekan** | Minimal React framework on Bun with RSC support | Smaller project |
| **Hono** | Lightweight web framework, works great on Bun (and other runtimes) | Active, popular |

### The Anthropic Acquisition (Dec 2025)

Bun was acquired by Anthropic. Key points:
- Claude Code ships as a Bun executable
- Bun stays open source, MIT licensed, same team
- Roadmap unchanged: high-performance JS tooling + Node.js compat
- Anthropic investing engineering resources into Bun
- Bun will be optimized for AI coding tool workflows

### Most Likely What the User Means

Given the phrasing "the React-like Bun web framework," the user is most likely referring to **Bun's built-in full-stack React development platform** -- specifically:

1. **`bun init --react`** as the entry point
2. **`Bun.serve()` with HTML imports and route-based API** as the runtime
3. **Zero-config React development** without Vite, webpack, CRA, or Next.js

This is "React-like" in the sense that it IS React, but the framework wrapper (routing, bundling, HMR, dev server, production builds) is all Bun-native. No external tooling needed.

An alternative interpretation: the user may have heard about Bun's JSX support and assumed Bun had its own React-like rendering engine. It does not. Bun transpiles JSX natively but the rendering is done by React/ReactDOM (or Preact, or any JSX-compatible library).

## Sources

- [Bun Fullstack Dev Server Docs](https://bun.com/docs/bundler/fullstack) - Official documentation, authoritative
- [Build a React app with Bun](https://bun.com/docs/guides/ecosystem/react) - Official docs for `bun init --react`
- [bun create docs](https://bun.com/docs/runtime/templating/create) - Official docs, "CRA successor" positioning
- [Bun 1.3 Release Blog](https://bun.sh/blog/bun-v1.3) - Official announcement, "full-stack JavaScript runtime"
- [Bun v1.2.3 Release Blog](https://bun.sh/blog/bun-v1.2.3) - First full frontend toolchain release
- [Bun Joins Anthropic](https://bun.com/blog/bun-joins-anthropic) - Official acquisition announcement
- [Anthropic Acquires Bun](https://www.anthropic.com/news/anthropic-acquires-bun-as-claude-code-reaches-usd1b-milestone) - Anthropic's announcement
- [InfoQ: Bun Zero-Config Frontend](https://www.infoq.com/news/2026/01/bun-v3-1-release/) - Third-party analysis
- [LogRocket: Bun 1.3 Analysis](https://blog.logrocket.com/bun-javascript-runtime-taking-node-js-deno/) - Third-party analysis, Dec 2025

## Confidence Assessment

- **High confidence** that there is no separate "React-like Bun framework" -- exhaustive search across multiple engines found nothing matching that description
- **High confidence** that the user is referring to Bun's built-in full-stack React platform (`bun init --react`, `Bun.serve()` with HTML imports)
- **Medium confidence** on the alternative interpretation that the user may have confused Bun's native JSX transpilation with a component framework
- No conflicting information found across sources
