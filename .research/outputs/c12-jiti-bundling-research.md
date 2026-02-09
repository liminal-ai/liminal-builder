# c12 + jiti Bundling Research for CLI Tools

**Date:** 2026-02-08
**Context:** ccs-cloner CLI tool using c12 for config loading, bundled with `bun build`
**Build command:** `bun build ./src/cli.ts --outdir ./dist --target node --external node-fetch-native`

---

## Summary

When c12 is bundled into a single file by `bun build`, its internal fallback to jiti for loading `.ts` and `.js` config files breaks because jiti relies on dynamic `import()` of its own internal modules, filesystem-based transpilation caches, and Node.js module resolution -- none of which survive inlining into a single bundle. The fix is straightforward: **externalize c12 and jiti from the bundle** so they remain as normal `node_modules` dependencies resolved at runtime, OR provide a custom `import` function to c12's `loadConfig()` that bypasses jiti entirely.

---

## Key Findings

### 1. How c12 Loads Config Files

c12's `loadConfig()` resolves config files through this sequence:

1. **File discovery**: Searches for `{name}.config.{js,ts,mjs,cjs,mts,cts,json,jsonc,json5,yaml,yml,toml}` in the cwd and `.config/` directory
2. **Structured data formats** (YAML, TOML, JSONC, JSON5): Loaded via `confbox` parsers -- these read the file as text and parse, so bundling does NOT break them
3. **JS/TS module formats**: Uses a two-stage loading approach:
   - **Stage 1**: Attempts native `import()` on the resolved config file path
   - **Stage 2 (fallback)**: If native `import()` fails, dynamically imports `jiti` and creates a jiti instance to load the file

The exact fallback code in `loader.ts`:

```typescript
res.config = (await import(res.configFile!).then(
  _resolveModule,
  async (error) => {
    const { createJiti } = await import("jiti").catch(() => {
      throw new Error(
        `Failed to load config file \`${res.configFile}\`: ${error?.message}`,
        { cause: error }
      );
    });
    const jiti = createJiti(
      join(options.cwd || ".", options.configFile || "/"),
      {
        interopDefault: true,
        moduleCache: false,
        extensions: [...SUPPORTED_EXTENSIONS],
      }
    );
    options.import = (id: string) => jiti.import(id);
    return _resolveModule(await options.import(res.configFile!));
  }
)) as T;
```

### 2. Why Bundling Breaks jiti

When `bun build` inlines c12 and jiti into a single output file:

- `await import("jiti")` -- This dynamic import gets either inlined (breaking jiti's internal module structure) or fails to resolve at runtime
- jiti internally uses filesystem operations, `require.resolve`, and dynamic `import()` to transpile and load TypeScript files -- all of which depend on jiti's package existing as real files on disk
- jiti creates a transpiler pipeline (using native Node.js mechanisms or bundled transformers) that cannot function when jiti's own code has been flattened into the host bundle

**Only `.mjs` config files work** because Node.js can natively `import()` them without needing jiti's transpilation step. The native `import()` in Stage 1 succeeds, so jiti is never invoked.

### 3. c12 Does NOT Have `jiti: false` or `jitiOptions` Options

Despite what the Context7 documentation snippet suggests, the actual c12 source code (as of the current version) does NOT expose `jiti` or `jitiOptions` as loadConfig options. The README documentation mentions these in the API reference, but the actual loader.ts implementation uses hardcoded jiti configuration internally. This may be a documentation-vs-implementation mismatch, or these options may exist in the type definitions but are not wired up in the loader.

### 4. c12 DOES Support a Custom `import` Function

This is the key escape hatch. c12's `loadConfig()` accepts an `import` option:

```typescript
const { config } = await loadConfig({
  import: (id) => import(id),  // custom import function
});
```

The documentation states: "Custom import function used to load configuration files. By default, c12 uses native `import()` with unjs/jiti as fallback."

### 5. jiti Has a `jiti/native` Subpath

jiti provides a lightweight `jiti/native` module that uses the runtime's native `import()` and `import.meta.resolve()` instead of jiti's transpilation pipeline. This is designed for runtimes with built-in TypeScript support (like Bun and Deno):

```typescript
import { createJiti } from "jiti/native";
const jiti = createJiti(import.meta.url);
// Uses native import() -- no transformation
const mod = await jiti.import("./module.ts");
```

### 6. jiti's `tryNative` Option

jiti v2 has a `tryNative` option that attempts native `import()`/`require()` before falling back to transformation. This is **auto-enabled when running in Bun**:

```typescript
const jiti = createJiti(import.meta.url, {
  tryNative: true,  // Auto-enabled in Bun
});
```

### 7. Bun Build's `--packages external` Option

Bun build supports `--packages external` which externalizes ALL package imports (anything not starting with `.`, `..`, or `/`):

```bash
bun build ./src/cli.ts --outdir ./dist --target node --packages external
```

This would leave `import("c12")`, `import("jiti")`, and all other `node_modules` imports as-is in the output, resolved at runtime from `node_modules/`.

---

## Recommended Fix Approaches

### Option A: Externalize c12 and jiti (Simplest, Recommended)

Add `--external c12 --external jiti` to the build command:

```bash
bun build ./src/cli.ts --outdir ./dist --target node \
  --external node-fetch-native \
  --external c12 \
  --external jiti
```

**Pros:**
- Simplest change -- just modify the build command
- c12 and jiti work exactly as designed
- All config file formats supported (.ts, .js, .mjs, .cjs, etc.)

**Cons:**
- Requires `node_modules/c12` and `node_modules/jiti` to be present at runtime alongside the bundled CLI
- The dist output is no longer fully self-contained

### Option B: Externalize ALL packages

Use `--packages external` to externalize everything:

```bash
bun build ./src/cli.ts --outdir ./dist --target node --packages external
```

**Pros:**
- One flag handles everything
- No risk of any dynamic import breaking

**Cons:**
- Loses most bundling benefits -- all dependencies must be installed
- Essentially just transpiles TypeScript, no tree shaking or size reduction

### Option C: Custom `import` function to bypass jiti (Best for Self-Contained Builds)

Instead of externalizing, provide a custom `import` function to c12 that uses only native `import()`:

```typescript
const { config } = await loadConfig({
  name: 'ccs-cloner',
  import: async (id: string) => {
    // Use native import() only -- no jiti fallback
    return import(id);
  },
});
```

**Pros:**
- Bundle remains self-contained (no external deps needed)
- No jiti dependency at all at runtime

**Cons:**
- Only works for config file formats that Node.js can natively import: `.mjs`, `.js` (if package.json has `"type": "module"`), and `.json`
- `.ts` config files will NOT work (Node.js cannot natively import TypeScript)
- Users must use `.mjs` or ESM `.js` config files

### Option D: Custom `import` using `jiti/native` (Good Compromise if Running Under Bun)

If the CLI will run under Bun (not just Node.js), use `jiti/native`:

```typescript
import { createJiti } from "jiti/native";
const nativeJiti = createJiti(import.meta.url);

const { config } = await loadConfig({
  name: 'ccs-cloner',
  import: (id: string) => nativeJiti.import(id),
});
```

**Pros:**
- Works with .ts config files if the runtime supports it (Bun does)
- Lightweight, no transpilation overhead

**Cons:**
- Must externalize `jiti` in the bundle (jiti/native still needs to be a real package)
- Only works if the end-user runs the CLI with Bun or Deno (not vanilla Node.js)

### Option E: Selective Externalization (Recommended Pragmatic Choice)

Externalize only what breaks, keep everything else bundled:

```bash
bun build ./src/cli.ts --outdir ./dist --target node \
  --external node-fetch-native \
  --external c12 \
  --external jiti \
  --external confbox
```

Then ensure your `package.json` lists these as runtime `dependencies` (not devDependencies) so they get installed when users install the CLI via npm.

---

## Recommended Approach

**For a CLI tool distributed via npm: Use Option A (externalize c12 + jiti).**

This is the most reliable approach because:

1. CLI tools distributed via npm always have `node_modules` available at runtime
2. c12 and jiti are small packages (jiti is zero-dependency)
3. All config file formats continue to work (.ts, .js, .mjs, etc.)
4. No code changes needed -- just a build command tweak
5. This is the standard pattern for bundling tools that do dynamic loading at runtime

**Build command:**
```bash
bun build ./src/cli.ts --outdir ./dist --target node \
  --external node-fetch-native \
  --external c12 \
  --external jiti
```

**If you want users to only use `.mjs` config files (no TypeScript configs): Use Option C.**

This eliminates the jiti dependency entirely but restricts config file format options.

---

## Sources

- [unjs/c12 GitHub repository](https://github.com/unjs/c12) - Official source, High authority
- [unjs/c12 README](https://github.com/unjs/c12/blob/main/README.md) - Documents the `import` option for custom config loading
- [unjs/jiti GitHub repository](https://github.com/unjs/jiti) - Official jiti source, High authority
- [unjs/jiti documentation](https://unjs.io/packages/jiti/) - Documents `tryNative`, `jiti/native`, and transformation options
- [Bun bundler documentation](https://bun.sh/docs/bundler) - Documents `--packages external` and `--external` options
- [Bun GitHub issue #6351](https://github.com/oven-sh/bun/issues/6351) - Discussion of `--packages external` feature
- c12 loader.ts source code (analyzed via GitHub raw) - Shows exact jiti fallback implementation

## Confidence Assessment

- **Overall confidence: High** - The c12 source code clearly shows the two-stage import pattern and the `options.import` escape hatch
- **High confidence**: Externalizing c12/jiti will fix the bundling issue
- **High confidence**: Custom `import` function approach works based on documented API
- **Medium confidence**: The `jiti`/`jitiOptions` options listed in Context7 docs may exist in type definitions but are not wired up in the actual loader -- verified by reading source code
- **No conflicting information** found across sources
