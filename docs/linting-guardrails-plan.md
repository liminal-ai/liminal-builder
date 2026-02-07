# Linting and Agent Guardrails Plan (TypeScript + Bun + Fastify)

## Context
This repository currently uses Biome for formatting and linting plus TypeScript strict type-checking. We want stronger agent-facing guardrails before story implementation scales, without losing fast feedback.

Decision: keep Biome as the fast/default linter and add ESLint only for typed and custom rules where Biome is not the right tool.

## Goals
- Keep day-to-day lint feedback fast and deterministic.
- Enforce strict TypeScript hygiene (no hidden `any` paths, no unsafe typed escapes).
- Add repo-specific rules that target common agent mistakes and return clear remediation guidance.
- Keep enforcement binary (error/fail), not warning-driven.

## Non-goals
- Replacing Biome with ESLint.
- Building a huge ruleset up front.
- Adding vague/nice-to-have checks with weak signal.

## Proposed Guardrail Stack

### Layer 1: Biome (fast baseline, blocking)
Use Biome for formatter + broad/static lint checks.

Why keep this in Biome:
- Rust-speed feedback loop.
- Already integrated in scripts and team habits.
- Great for high-volume mechanical hygiene.

### Layer 2: ESLint typed + custom (semantic guardrails, blocking)
Add ESLint flat config for:
- type-aware `@typescript-eslint` rules (`strictTypeChecked`).
- custom local plugin rules with explicit remediation messages.
- architectural import boundary checks.

Why add this layer:
- typed analysis and custom rule authoring are significantly stronger in ESLint.
- enables “fail + tell agent exactly what to do instead” behavior.

### Layer 3 (optional, phase 2): Pattern/policy scanner
Use Semgrep and/or ast-grep for policy/security/pattern checks that are awkward in ESLint visitor logic.

## Rule Ownership Split
- Biome owns: formatter/style/general correctness that does not require TS type graph or custom AST semantics.
- ESLint owns: typed correctness (`no-unsafe-*`, floating promises, etc.), architecture boundaries, and custom repo rules.
- Avoid duplicate diagnostics: disable overlapping ESLint rules where Biome already enforces equivalent behavior.

## Proposed ESLint Baseline (typed)
Start with:
- `@eslint/js` recommended
- `typescript-eslint` `strictTypeChecked` (flat config)
- project service typed linting (`parserOptions.projectService: true`)

Promote key typed guardrails to `error`:
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-return`
- `@typescript-eslint/no-floating-promises`
- `@typescript-eslint/switch-exhaustiveness-check`
- `@typescript-eslint/no-unnecessary-type-assertion`

## Custom Rule Catalog (v1)
Rule IDs use namespace `lb/` (Liminal Builder).

### LB001 `lb/no-placeholder-throw`
Problem caught:
- shipping `throw new Error("Not implemented")` / placeholder stubs in non-test runtime paths.

Guidance text:
- "Replace placeholder throw with implemented behavior or typed TODO issue link in explicitly allowed scaffold file."

Autofix:
- none.

### LB002 `lb/no-double-cast`
Problem caught:
- `as unknown as T` and similar double assertion chains outside allowlist.

Guidance text:
- "Use a typed parser/validator (e.g. schema parse) or narrow via runtime guard before casting."

Autofix:
- none.

### LB003 `lb/no-raw-websocket-send`
Problem caught:
- direct `ws.send(...)` in server code where protocol envelope helper is required.

Guidance text:
- "Use `sendEnvelope(...)` so payloads include typed envelope and trace metadata."

Autofix:
- suggestion fix when call shape is trivially mappable.

### LB004 `lb/require-error-envelope-code`
Problem caught:
- outbound error envelope without required stable `code` field.

Guidance text:
- "Provide a stable machine-readable `code` on protocol errors; keep message human-facing."

Autofix:
- suggestion only when obvious constant code can be inferred.

### LB005 `lb/no-cross-boundary-internal-import`
Problem caught:
- importing internal module paths across feature boundaries instead of public entrypoints.

Guidance text:
- "Import via feature entrypoint (index/public API) to preserve layering and refactor safety."

Autofix:
- none.

### LB006 `lb/no-todo-without-ticket`
Problem caught:
- TODO/FIXME comments without a tracker reference.

Guidance text:
- "Use `TODO(LB-123): ...` format or remove comment."

Autofix:
- none.

## How Custom Rules Will Be Built

### File layout
- `tools/eslint-plugin-lb/package.json`
- `tools/eslint-plugin-lb/src/index.ts`
- `tools/eslint-plugin-lb/src/rules/*.ts`
- `tools/eslint-plugin-lb/tests/*.test.ts`

### Implementation approach
- Use ESLint rule API for syntax/structure checks.
- For typed checks, use `@typescript-eslint/utils` + parser services + TypeChecker.
- Every rule must ship:
  - clear error message with explicit “do this instead”.
  - at least 3 valid + 3 invalid tests.
  - docs entry with rationale, bad/good examples, and exception policy.

### Rule quality gate
A custom rule can only graduate to blocking if:
- false-positive rate is acceptably low in pilot (<5% on touched files over trial period).
- remediation instruction is specific and actionable.
- rule runtime impact is measured and acceptable.

## Architecture Guardrails
Prefer dedicated architecture checks in ESLint config and, if needed, dependency-cruiser for global graph constraints.

Initial constraints:
- no imports from `server/**` into `shared/**` that create back edges.
- no deep imports into another feature’s private files.
- disallow selected module paths with explicit replacement messages.

## Workflow Integration

### Local
- Keep `bun run verify-all` as the single gate command.
- Update scripts so verify includes both Biome and ESLint typed checks.
- Keep binary outcomes only (errors fail, no warning-only policy).

### CI
- PR required checks:
  - format check (Biome)
  - Biome lint
  - ESLint typed/custom
  - TypeScript `tsc --noEmit`
  - tests

### Optional hooks
- Add Husky pre-commit hook for fast checks on changed files.
- Keep full verify in pre-push or CI to avoid heavy local commit latency.

## Risks and Mitigations

### Risk 1: Version skew (`typescript`, ESLint, typescript-eslint)
- Mitigation: pin compatible versions and upgrade as a batch.
- Monitoring: weekly dependency update PR with lint smoke test.

### Risk 2: Typed lint performance regressions
- Mitigation: use `projectService: true`, lint only target globs, avoid overbroad allowDefaultProject.
- Monitoring: CI job duration budget and trend alerts.

### Risk 3: Duplicate/noisy diagnostics
- Mitigation: document ownership split and disable overlaps.
- Monitoring: lint output dedupe review during first 2 weeks.

### Risk 4: Rule false positives erode trust
- Mitigation: start in pilot scope, require tests/examples, promote to blocking only after validation.
- Monitoring: track suppressions/disables per rule; auto-flag spike.

### Risk 5: Agent bypass behavior
- Mitigation: enforce checks in CI required status, not only local hooks.
- Monitoring: measure failure categories and recurrence by rule ID.

## Monitoring Dashboard Metrics
Track per week:
- lint failures by rule ID (Biome, ESLint typed, ESLint custom).
- first-pass PR success rate.
- median lint runtime (local/CI).
- suppression count and age (`eslint-disable`, Biome suppressions).
- top recurring rule violations and time-to-fix.

Escalation thresholds:
- any new custom rule with >10% false-positive complaints in first week -> revert to monitor mode.
- lint runtime increase >30% week-over-week -> profile and trim typed scope.

## Rollout Plan

### Phase 0 (immediate)
- Commit written standard and ownership split.
- Keep Biome as-is.

### Phase 1 (1-2 days)
- Add ESLint typed baseline config.
- Add 2 custom rules only: `LB001`, `LB002`.
- Wire into `verify-all` as blocking.

### Phase 2 (next)
- Add protocol/architecture rules: `LB003`, `LB004`, `LB005`.
- Introduce limited boundary checks.

### Phase 3
- Add `LB006` and optional Semgrep/ast-grep checks for policy/security patterns.
- Tune based on measured false positives and runtime.

## Recommended Initial Standard (Actionable)
- Keep Biome for fast lint/format.
- Add ESLint typed + custom plugin for semantic guardrails.
- Enforce both as hard errors in `verify-all`.
- Start with the smallest high-signal custom set and scale by measured value.

## Research References (Primary Sources)
- Biome rule docs and severity/config examples:
  - https://biomejs.dev/linter/rules/use-nodejs-import-protocol/
  - https://biomejs.dev/linter/rules/use-import-type
  - https://biomejs.dev/linter/rules/use-export-type/
- typescript-eslint typed linting + project service:
  - https://typescript-eslint.io/getting-started/typed-linting
  - https://typescript-eslint.io/blog/project-service/
  - https://typescript-eslint.io/users/configs
  - https://typescript-eslint.io/packages/parser
  - https://typescript-eslint.io/troubleshooting/typed-linting/
- ESLint custom rules/plugins:
  - https://eslint.org/docs/latest/extend/plugins
  - https://eslint.org/docs/latest/extend/custom-rule-tutorial
  - https://eslint.org/docs/latest/rules/no-restricted-imports
- Architecture/boundaries tooling:
  - https://github.com/javierbrea/eslint-plugin-boundaries
  - https://github.com/sverweij/dependency-cruiser
  - https://github.com/import-js/eslint-plugin-import
- Pattern/policy guardrails:
  - https://semgrep.dev/docs/writing-rules/overview
  - https://semgrep.dev/docs/semgrep-ci/configuring-blocking-and-errors-in-ci
  - https://ast-grep.github.io/guide/project/lint-rule.html
  - https://ast-grep.github.io/guide/rule-config.html
- Git hook enforcement options:
  - https://typicode.github.io/husky/
  - https://typicode.github.io/husky/get-started.html
