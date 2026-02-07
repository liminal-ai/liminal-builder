# Prompt 5.1: Skeleton + Red (Tab Management)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs (Claude Code, Codex). Stack: Bun + Fastify server, vanilla HTML/JS client (shell/portlet iframes), WebSocket bridge. CLIs communicate via ACP (Agent Client Protocol) over stdio.

This is Story 5 of the MVP build. Stories 0-4 have established the full server stack (project store, session manager, agent manager, ACP client), the chat UI (portlet with streaming, tool calls, thinking blocks), and the session management flow. 57 tests are currently passing.

Story 5 implements the tab bar in the shell. Each open session gets a tab element and a corresponding portlet iframe. The tab system provides instant switching (CSS display toggle), deduplication, drag-and-drop reorder, adjacent-tab activation on close, and state persistence in localStorage. All tab logic lives in `client/shell/tabs.js`.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `client/shell/tabs.js` -- stub exists from Story 0
- `client/shell/index.html` -- shell page with `#tab-bar` and `#portlet-container` elements
- `client/shell/shell.js` -- WebSocket connection and message routing
- `client/shell/shell.css` -- shell layout styles
- `client/shared/constants.js` -- CLI type constants
- All prior tests passing (`bun run verify` exits 0)

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 4: Tab Management, lines ~940-1045)
- Feature Spec: `docs/feature-spec-mvp.md` (Flow 4: Tab Management, ACs 4.1-4.7)

## Task

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `client/shell/tabs.js` | Modify | Replace stub with skeleton structure (exports, iframe Map, function stubs) |
| `tests/client/tabs.test.ts` | Create | 14 test specs with RED-phase failures expected against current stubs |

### Skeleton: `client/shell/tabs.js`

Replace the existing stub with this skeleton structure. Every function body should throw `new Error('Not implemented')` except for the data structure initialization:

```javascript
// client/shell/tabs.js -- Tab bar management
// Manages tab lifecycle: open, close, switch, reorder, persist
// Each tab corresponds to a session portlet iframe
// AC-4.1 through AC-4.7

const STORAGE_KEY = 'liminal:tabs';

// Source of truth for tabbed sessions
// Map<sessionId, iframe element>
const iframes = new Map();

// Current active tab session ID (or null)
let activeTab = null;

// Tab order array (session IDs in display order)
let tabOrder = [];

// DOM references (set during init)
let tabBar = null;
let portletContainer = null;
let emptyState = null;

/**
 * Initialize the tab system.
 * Called once on shell load.
 * Must support both call paths:
 *  - init(tabBarEl, containerEl, emptyStateEl) from tests
 *  - init() from Story 0 shell.js (fallback to document.getElementById lookups)
 * Reads tab state from localStorage and restores tabs.
 * @param {HTMLElement} tabBarEl - The tab bar container element
 * @param {HTMLElement} containerEl - The portlet container element
 * @param {HTMLElement} emptyStateEl - The empty state element
 */
export function init(tabBarEl, containerEl, emptyStateEl) {
  throw new Error('Not implemented');
}

// Keep compatibility with Story 0 shell import surface.
export const initTabs = init;

/**
 * Open a tab for a session. If already tabbed, activates existing tab (dedup).
 * Creates iframe, tab element, activates, and persists state.
 * @param {string} sessionId - Canonical session ID (e.g., "claude-code:abc123")
 * @param {string} title - Session title (or "New Session")
 * @param {string} cliType - CLI type ("claude-code" or "codex")
 */
export function openTab(sessionId, title, cliType) {
  throw new Error('Not implemented');
}

/**
 * Activate a tab (make it visible, hide others).
 * CSS display toggle: target iframe gets display:block, all others display:none.
 * Updates tab bar highlighting and persists state.
 * @param {string} sessionId - Session ID to activate (or null for empty state)
 */
export function activateTab(sessionId) {
  throw new Error('Not implemented');
}

/**
 * Close a tab. Removes iframe and tab element.
 * If closing the active tab, activates the adjacent tab (next, or previous if last).
 * If closing the last tab, shows empty state.
 * @param {string} sessionId - Session ID to close
 */
export function closeTab(sessionId) {
  throw new Error('Not implemented');
}

/**
 * Update the title displayed on a tab.
 * Called when session:title-updated arrives from the server.
 * @param {string} sessionId - Session ID
 * @param {string} title - New title
 */
export function updateTabTitle(sessionId, title) {
  throw new Error('Not implemented');
}

/**
 * Check if a session is currently tabbed.
 * @param {string} sessionId
 * @returns {boolean}
 */
export function hasTab(sessionId) {
  throw new Error('Not implemented');
}

/**
 * Get the active tab session ID.
 * @returns {string|null}
 */
export function getActiveTab() {
  throw new Error('Not implemented');
}

/**
 * Get the number of open tabs.
 * @returns {number}
 */
export function getTabCount() {
  throw new Error('Not implemented');
}

/**
 * Get the current tab order.
 * @returns {string[]}
 */
export function getTabOrder() {
  throw new Error('Not implemented');
}

/**
 * Reorder tabs. Moves draggedId to the position of targetId.
 * @param {string} draggedId - Session ID being dragged
 * @param {string} targetId - Session ID of the drop target
 */
export function reorderTabs(draggedId, targetId) {
  throw new Error('Not implemented');
}

// ---- Internal helpers ----

/**
 * Create and append a tab element to the tab bar.
 * Tab element structure:
 *   <div class="tab" data-session-id="..." draggable="true">
 *     <span class="tab-cli-indicator" data-cli-type="..."></span>
 *     <span class="tab-title">Title</span>
 *     <button class="tab-close">&times;</button>
 *   </div>
 * @param {string} sessionId
 * @param {string} title
 * @param {string} cliType
 * @returns {HTMLElement} The created tab element
 */
function renderTabElement(sessionId, title, cliType) {
  throw new Error('Not implemented');
}

/**
 * Remove a tab element from the tab bar.
 * @param {string} sessionId
 */
function removeTabElement(sessionId) {
  throw new Error('Not implemented');
}

/**
 * Update tab bar to highlight the active tab.
 * @param {string} sessionId - Active session ID (or null)
 */
function updateTabBarHighlight(sessionId) {
  throw new Error('Not implemented');
}

/**
 * Persist current tab state to localStorage.
 * Format: {
 *   openTabs: string[],
 *   activeTab: string | null,
 *   tabOrder: string[],
 *   tabMeta: Record<string, { title: string, cliType: string }>
 * }
 * Called after every tab operation (open, close, switch, reorder).
 */
function persistTabState() {
  throw new Error('Not implemented');
}

/**
 * Restore tab state from localStorage.
 * Called during init(). For each saved tab, calls openTab() to recreate.
 * Then activates the saved active tab.
 * @returns {{
 *   openTabs: string[],
 *   activeTab: string | null,
 *   tabOrder: string[],
 *   tabMeta: Record<string, { title: string, cliType: string }>
 * } | null}
 */
function restoreTabState() {
  throw new Error('Not implemented');
}

/**
 * Set up drag-and-drop event handlers on a tab element.
 * Uses native HTML5 drag-and-drop API.
 * @param {HTMLElement} tabElement
 * @param {string} sessionId
 */
function setupDragHandlers(tabElement, sessionId) {
  throw new Error('Not implemented');
}

/**
 * Show or hide the empty state element.
 * @param {boolean} show
 */
function toggleEmptyState(show) {
  throw new Error('Not implemented');
}
```

### Tests: `tests/client/tabs.test.ts`

Create the test file with 14 test specs. Use jsdom for DOM simulation. Each test should exercise the tabs.js module through its public API.

**Test environment setup pattern:**

```typescript
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
// Import tabs module -- adjust path as needed for your test setup
// The tabs module operates on DOM elements, so we need jsdom

// Helper: create a minimal DOM environment for tabs
function createTabsDOM() {
  const tabBar = document.createElement('div');
  tabBar.id = 'tab-bar';

  const portletContainer = document.createElement('div');
  portletContainer.id = 'portlet-container';

  const emptyState = document.createElement('div');
  emptyState.id = 'empty-state';
  emptyState.textContent = 'No session open';

  document.body.appendChild(tabBar);
  document.body.appendChild(portletContainer);
  document.body.appendChild(emptyState);

  return { tabBar, portletContainer, emptyState };
}

// Helper: mock localStorage
function createMockStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}
```

**Test specs (all 14 tests):**

```typescript
describe('Tab Management', () => {
  // Setup and teardown for each test
  let dom: ReturnType<typeof createTabsDOM>;
  let tabBar: HTMLElement;
  let portletContainer: HTMLElement;
  let emptyState: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    dom = createTabsDOM();
    ({ tabBar, portletContainer, emptyState } = dom);
    // Reset localStorage mock
    // Initialize tabs module with DOM elements
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // === AC-4.1: Opening a session creates a tab ===

  test('TC-4.1a: new tab on session open — tab element and iframe created', () => {
    // Given: tabs initialized, no tabs open
    // When:
    openTab('claude-code:session-1', 'Fix auth bug', 'claude-code');
    // Then:
    const tabs = tabBar.querySelectorAll('.tab');
    expect(tabs.length).toBe(1);
    expect(tabs[0].dataset.sessionId).toBe('claude-code:session-1');
    const iframeEls = portletContainer.querySelectorAll('iframe');
    expect(iframeEls.length).toBe(1);
    expect(iframeEls[0].dataset.sessionId).toBe('claude-code:session-1');
    expect(tabs[0].classList.contains('active')).toBe(true);
    expect(getTabCount()).toBe(1);
  });

  test('TC-4.1b: multiple tabs — two tabs, second active', () => {
    // Given: one tab open for session-1
    openTab('claude-code:session-1', 'Fix auth bug', 'claude-code');
    // When:
    openTab('claude-code:session-2', 'Add tests', 'claude-code');
    // Then:
    expect(tabBar.querySelectorAll('.tab').length).toBe(2);
    expect(portletContainer.querySelectorAll('iframe').length).toBe(2);
    expect(getActiveTab()).toBe('claude-code:session-2');
    expect(getTabCount()).toBe(2);
  });

  // === AC-4.2: Tab switch preserves scroll ===

  test('TC-4.2a: scroll preserved on switch — iframe element reference preserved', () => {
    // Given: two tabs open
    openTab('claude-code:session-1', 'Session A', 'claude-code');
    const iframeBefore = portletContainer.querySelector('iframe[data-session-id="claude-code:session-1"]');
    openTab('claude-code:session-2', 'Session B', 'claude-code');
    // When: switch back to session A
    activateTab('claude-code:session-1');
    // Then: same iframe element (not recreated), visible
    const iframeAfter = portletContainer.querySelector('iframe[data-session-id="claude-code:session-1"]');
    expect(iframeAfter).toBe(iframeBefore); // same DOM node
    expect(iframeAfter.style.display).toBe('block');
  });

  // === AC-4.3: Deduplication ===

  test('TC-4.3a: sidebar deduplicates — same tab activated, no new iframe', () => {
    // Given: session-1 is already tabbed
    openTab('claude-code:session-1', 'Fix auth bug', 'claude-code');
    // When: open same session again
    openTab('claude-code:session-1', 'Fix auth bug', 'claude-code');
    // Then:
    expect(getTabCount()).toBe(1);
    expect(portletContainer.querySelectorAll('iframe').length).toBe(1);
    expect(getActiveTab()).toBe('claude-code:session-1');
  });

  test('TC-4.3b: tab count constant — 3 tabs, click existing, still 3', () => {
    // Given: 3 tabs open
    openTab('claude-code:session-1', 'S1', 'claude-code');
    openTab('claude-code:session-2', 'S2', 'claude-code');
    openTab('claude-code:session-3', 'S3', 'claude-code');
    // When: re-open session-1
    openTab('claude-code:session-1', 'S1', 'claude-code');
    // Then:
    expect(getTabCount()).toBe(3);
    expect(tabBar.querySelectorAll('.tab').length).toBe(3);
    expect(getActiveTab()).toBe('claude-code:session-1');
  });

  // === AC-4.4: Close tab ===

  test('TC-4.4a: close removes tab and iframe', () => {
    // Given: two tabs open
    openTab('claude-code:session-1', 'S1', 'claude-code');
    openTab('claude-code:session-2', 'S2', 'claude-code');
    // When:
    closeTab('claude-code:session-1');
    // Then:
    expect(tabBar.querySelector('[data-session-id="claude-code:session-1"]')).toBeNull();
    expect(portletContainer.querySelector('iframe[data-session-id="claude-code:session-1"]')).toBeNull();
    expect(hasTab('claude-code:session-1')).toBe(false);
    expect(getTabCount()).toBe(1);
  });

  test('TC-4.4b: close active switches to adjacent — next tab activated', () => {
    // Given: 3 tabs in order [A, B, C], B is active
    openTab('claude-code:A', 'A', 'claude-code');
    openTab('claude-code:B', 'B', 'claude-code');
    openTab('claude-code:C', 'C', 'claude-code');
    activateTab('claude-code:B');
    // When:
    closeTab('claude-code:B');
    // Then: C is now active (next tab after B)
    expect(getActiveTab()).toBe('claude-code:C');
    expect(portletContainer.querySelector('iframe[data-session-id="claude-code:C"]').style.display).toBe('block');
  });

  test('TC-4.4c: close last tab shows empty state', () => {
    // Given: only 1 tab open
    openTab('claude-code:session-1', 'S1', 'claude-code');
    // When:
    closeTab('claude-code:session-1');
    // Then:
    expect(getTabCount()).toBe(0);
    expect(getActiveTab()).toBeNull();
    expect(emptyState.style.display).not.toBe('none');
    expect(portletContainer.querySelectorAll('iframe').length).toBe(0);
  });

  // === AC-4.5: Tab displays title and CLI type ===

  test('TC-4.5a: tab shows title and CLI type — title and indicator visible', () => {
    // Given/When:
    openTab('claude-code:session-1', 'Fix auth bug', 'claude-code');
    // Then:
    const tab = tabBar.querySelector('[data-session-id="claude-code:session-1"]');
    expect(tab.querySelector('.tab-title').textContent).toBe('Fix auth bug');
    expect(tab.querySelector('.tab-cli-indicator').dataset.cliType).toBe('claude-code');
  });

  test('TC-4.5b: new session shows placeholder title — tab shows "New Session"', () => {
    // Given/When:
    openTab('claude-code:session-1', 'New Session', 'claude-code');
    // Then:
    const tab = tabBar.querySelector('[data-session-id="claude-code:session-1"]');
    expect(tab.querySelector('.tab-title').textContent).toBe('New Session');
  });

  // === AC-4.6: Drag-and-drop reorder ===

  test('TC-4.6a: drag reorder — order A, C, B', () => {
    // Given: 3 tabs open in order [A, B, C]
    openTab('claude-code:A', 'A', 'claude-code');
    openTab('claude-code:B', 'B', 'claude-code');
    openTab('claude-code:C', 'C', 'claude-code');
    // When:
    reorderTabs('claude-code:C', 'claude-code:B');
    // Then:
    expect(getTabOrder()).toEqual(['claude-code:A', 'claude-code:C', 'claude-code:B']);
  });

  test('TC-4.6b: order persists — localStorage updated', () => {
    // Given: 3 tabs open, then reordered
    openTab('claude-code:A', 'A', 'claude-code');
    openTab('claude-code:B', 'B', 'claude-code');
    openTab('claude-code:C', 'C', 'claude-code');
    reorderTabs('claude-code:C', 'claude-code:B');
    // When: check localStorage
    const stored = JSON.parse(localStorage.getItem('liminal:tabs'));
    // Then:
    expect(stored.tabOrder).toEqual(['claude-code:A', 'claude-code:C', 'claude-code:B']);
  });

  // === AC-4.7: Tabs restore on restart ===

  test('TC-4.7a: tabs restore — tabs restored from localStorage', () => {
    // Given: localStorage has saved tab state
    localStorage.setItem('liminal:tabs', JSON.stringify({
      openTabs: ['claude-code:s1', 'claude-code:s2', 'claude-code:s3'],
      activeTab: 'claude-code:s2',
      tabOrder: ['claude-code:s1', 'claude-code:s2', 'claude-code:s3'],
      tabMeta: {
        'claude-code:s1': { title: 'S1', cliType: 'claude-code' },
        'claude-code:s2': { title: 'S2', cliType: 'claude-code' },
        'claude-code:s3': { title: 'S3', cliType: 'claude-code' },
      }
    }));
    // When: init (simulating app restart)
    init(tabBar, portletContainer, emptyState);
    // Then:
    expect(getTabCount()).toBe(3);
    expect(portletContainer.querySelectorAll('iframe').length).toBe(3);
    expect(getActiveTab()).toBe('claude-code:s2');
  });

  // === TC-2.3b (from Story 4, tested here): Open already-tabbed session ===

  test('TC-2.3b: open already-tabbed session activates existing tab', () => {
    // Given: session-1 is already open, session-2 is active
    openTab('claude-code:session-1', 'S1', 'claude-code');
    openTab('claude-code:session-2', 'S2', 'claude-code');
    // When: re-open session-1
    openTab('claude-code:session-1', 'S1', 'claude-code');
    // Then:
    expect(getActiveTab()).toBe('claude-code:session-1');
    expect(getTabCount()).toBe(2);
    expect(portletContainer.querySelector('iframe[data-session-id="claude-code:session-1"]').style.display).toBe('block');
    expect(portletContainer.querySelector('iframe[data-session-id="claude-code:session-2"]').style.display).toBe('none');
  });
});
```

**Important notes for test implementation:**
- Tests contain REAL assertions — they call the actual functions and assert expected outcomes
- In the RED phase, tests should fail meaningfully against the current stubs.
- This is the correct TDD Red pattern: real tests that error on stubs, then pass when implemented in Green
- Tests call public API functions (`openTab`, `closeTab`, `reorderTabs`) directly rather than simulating click/drag DOM events.
- UI event wiring (click -> `closeTab`, drop -> `reorderTabs`) is verified via verify-prompt spot checks and manual smoke testing.
- The DOM setup in `beforeEach` should create the tab bar, portlet container, and empty state elements
- localStorage should be mocked (or use jsdom's built-in localStorage if available)
- The tabs module should be re-imported or re-initialized for each test to ensure clean state
- The iframe Map is internal to tabs.js — tests verify behavior through the public API (`getTabCount`, `getActiveTab`, `getTabOrder`, `hasTab`) and DOM inspection

## Constraints

- Do NOT implement any function bodies in `tabs.js` beyond the skeleton structure shown above
- Do NOT modify files outside `client/shell/tabs.js` and `tests/client/tabs.test.ts`
- Do NOT write implementation logic in this phase -- keep function bodies as stubs.
- New tests should fail against the current stubs.
- All 58 previous tests MUST still pass
- Use jsdom for DOM simulation in tests (same pattern as existing `tests/client/` files)

## If Blocked or Uncertain

- If the existing tabs.js stub has a different export structure than shown above, adapt the skeleton to match the existing module interface while keeping all function stubs
- If the jsdom setup pattern differs from existing client tests, follow the established pattern in `tests/client/sidebar.test.ts` or `tests/client/chat.test.ts`
- Resolve straightforward interface mismatches using existing shell/tabs contracts and continue; ask only for true blockers.

## Verification

Run:
```bash
bun run test && bun run test:client
```

Expected:
- All previous tests: PASS
- 14 new tests in `tests/client/tabs.test.ts`: failing against unimplemented tabs behavior

Run:
```bash
bun run typecheck
```

Expected: zero errors

## Done When

- [ ] `client/shell/tabs.js` has full skeleton with all exports (openTab, activateTab, closeTab, updateTabTitle, hasTab, getActiveTab, getTabCount, getTabOrder, reorderTabs, init, plus `initTabs` compatibility alias)
- [ ] All function bodies throw `new Error('Not implemented')`
- [ ] `tests/client/tabs.test.ts` has 14 test specs with TC IDs in descriptions
- [ ] New tab tests fail against current stubs, with clear assertions for Green
- [ ] All 58 previous tests still pass
- [ ] `bun run typecheck` passes with zero errors
