**Overall readiness verdict:** **READY WITH ISSUES**

**Critical issues**
- None.

**Major issues**
1. **Core contract inconsistency (local-only listing vs ACP join)**
- `docs/tech-design-mvp.md:634` says session lists combine local metadata with ACP data.
- `docs/tech-design-mvp.md:638` then says listing is entirely local.
- `docs/tech-design-mvp.md:2173` and `docs/tech-design-mvp.md:2191` still describe a “join” algorithm.
- This conflicts with Story 4 source-of-truth notes in `docs/stories/story-4-session-management/story.md:5` and `docs/stories/story-4-session-management/story.md:9` (local-only, no ACP join), and with feature spec local ownership in `docs/feature-spec-mvp.md:176`.

2. **Traceability gap: Story 4 claims AC-2.2/AC-2.3 coverage but omits 3 TCs in its own test plan**
- Feature spec includes `TC-2.2d`, `TC-2.2e`, `TC-2.3b` in Flow 2 (`docs/feature-spec-mvp.md:216`, `docs/feature-spec-mvp.md:220`, `docs/feature-spec-mvp.md:235`).
- Story 4 test breakdown excludes them (`docs/stories/story-4-session-management/story.md:53`, `docs/stories/story-4-session-management/story.md:54`).
- Verify prompt says “Confirm each TC is covered” but only lists 13 TCs (`docs/stories/story-4-session-management/prompt-4.R-verify.md:70` to `docs/stories/story-4-session-management/prompt-4.R-verify.md:86`).

3. **AC weakening in Green prompt for archive behavior**
- Spec requires archive to close associated tab (`docs/feature-spec-mvp.md:248` to `docs/feature-spec-mvp.md:251`).
- Green prompt allows not closing tab: “if not wired yet, just remove from sidebar” (`docs/stories/story-4-session-management/prompt-4.2-green.md:298`).
- This creates ambiguity and allows implementation that fails TC-2.4b intent.

**Minor issues**
1. **Red prompt verification commands are internally inconsistent**
- It asks to run full suites (`docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:377`) while expecting prior tests pass and new tests fail (`docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:387` to `docs/stories/story-4-session-management/prompt-4.1-skeleton-red.md:389`).

2. **Dependency narrative mismatch (can confuse Story 4 planning)**
- `docs/stories/overview.md:25` says Story 6 starts only after Story 5.
- `docs/tech-design-mvp.md:2275` says Story 6 depends on Story 2b.
- Not a direct Story 4 blocker, but it muddies TC deferral interpretation.

**Recommendations**
1. Normalize Story 4 contract language everywhere to **local-only listing**; remove “join with ACP list” text from tech design sections.
2. Add an explicit **TC ownership table** in Story 4 docs:
- Story 4-owned TCs vs deferred TCs (`TC-2.2d/e` to Story 6, `TC-2.3b` to Story 5, if intentional).
3. Update `prompt-4.R-verify.md` wording from “each TC” to “each Story 4-owned TC,” or include the deferred TC checks explicitly.
4. Tighten `prompt-4.2-green.md` archive requirement to always satisfy TC-2.4b; if not feasible pre-Story 5, formally defer TC-2.4b and remove it from Story 4 acceptance/test claims.
5. Fix Red-phase verification commands to separate:
- prior-regression run excluding new red tests,
- explicit expected-failing run for new Story 4 tests.