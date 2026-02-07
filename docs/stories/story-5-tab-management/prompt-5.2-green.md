# Prompt 5.2: Green (Tab Management)

## Context

Liminal Builder is an agentic IDE -- an organized, session-based interface for parallel AI coding CLIs (Claude Code, Codex). Stack: Bun + Fastify server, vanilla HTML/JS client (shell/portlet iframes), WebSocket bridge. CLIs communicate via ACP (Agent Client Protocol) over stdio.

This is the GREEN phase of Story 5. The skeleton and 14 failing tests were created in Prompt 5.1. All 14 tests currently fail because every function in `tabs.js` throws `new Error('Not implemented')`. Your job is to implement all function bodies so that all 14 tests pass.

The tab system manages portlet iframes for open sessions. Key behaviors: CSS display toggle for instant switching (<100ms), deduplication, drag-and-drop reorder, adjacent-tab activation on close, and localStorage persistence for app restart recovery.

**Working Directory:** `/Users/leemoore/code/liminal-builder`

**Prerequisites complete:**
- `client/shell/tabs.js` -- skeleton with all function stubs (from Prompt 5.1)
- `tests/client/tabs.test.ts` -- 14 failing tests (from Prompt 5.1)
- 57 previous tests passing
- All types and shared modules from Stories 0-4

## Reference Documents
(For human traceability -- key content inlined below)
- Tech Design: `docs/tech-design-mvp.md` (Flow 4: Tab Management, lines ~940-1045)
- Feature Spec: `docs/feature-spec-mvp.md` (Flow 4: ACs 4.1-4.7, lines ~377-467)

## Task

### Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `client/shell/tabs.js` | Modify | Replace all `throw new Error('Not implemented')` with working implementations |
| `client/shell/shell.css` | Modify | Add tab bar styles if not already present |

### Implementation Requirements

#### 1. `init(tabBarEl, containerEl, emptyStateEl)`

Store DOM references. Set up dragover/drop handlers on the tab bar. Call `restoreTabState()` to recover tabs from localStorage on startup.

```javascript
export function init(tabBarEl, containerEl, emptyStateEl) {
  tabBar = tabBarEl;
  portletContainer = containerEl;
  emptyState = emptyStateEl;

  // Set up tab bar as drop target for drag-and-drop reorder
  tabBar.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });

  tabBar.addEventListener('drop', (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const dropTarget = e.target.closest('.tab');
    if (dropTarget && draggedId) {
      const targetId = dropTarget.dataset.sessionId;
      if (draggedId !== targetId) {
        reorderTabs(draggedId, targetId);
      }
    }
  });

  // Restore tabs from localStorage (app restart recovery)
  restoreTabState();

  // Show empty state if no tabs restored
  if (iframes.size === 0) {
    toggleEmptyState(true);
  }
}

// Keep compatibility with existing shell wiring from Story 0.
export const initTabs = init;
```

#### 2. `openTab(sessionId, title, cliType)` -- with deduplication (AC-4.3)

This is the primary entry point. The deduplication check is critical: if the session is already tabbed, just activate it. No new iframe, no new tab element.

```javascript
export function openTab(sessionId, title, cliType) {
  // Dedup check (AC-4.3: no duplicate tabs)
  if (iframes.has(sessionId)) {
    activateTab(sessionId);
    return;
  }

  // Create iframe
  const iframe = document.createElement('iframe');
  iframe.src = `/portlet/index.html?sessionId=${encodeURIComponent(sessionId)}`;
  iframe.dataset.sessionId = sessionId;
  iframe.className = 'portlet-iframe';
  portletContainer.appendChild(iframe);
  iframes.set(sessionId, iframe);

  // Create tab element
  renderTabElement(sessionId, title, cliType);

  // Track in tab order
  tabOrder.push(sessionId);

  // Activate this tab (hides others, shows this one)
  activateTab(sessionId);

  // Hide empty state
  toggleEmptyState(false);

  // Persist
  persistTabState();
}
```

#### 3. `activateTab(sessionId)` -- CSS display toggle (AC-4.2)

The key performance insight: iframes stay in the DOM. We just toggle `display`. This achieves sub-100ms switching because there is no network request, no DOM rebuild, and no re-render. The iframe preserves its internal state including scroll position.

```javascript
export function activateTab(sessionId) {
  if (sessionId === null) {
    // No tabs open -- hide all iframes
    for (const [, iframe] of iframes) {
      iframe.style.display = 'none';
    }
    activeTab = null;
    updateTabBarHighlight(null);
    toggleEmptyState(true);
    persistTabState();
    return;
  }

  // Hide all iframes, show target
  for (const [id, iframe] of iframes) {
    iframe.style.display = id === sessionId ? 'block' : 'none';
  }

  activeTab = sessionId;
  updateTabBarHighlight(sessionId);
  persistTabState();
}
```

#### 4. `closeTab(sessionId)` -- with adjacent-tab activation (AC-4.4)

When closing the active tab, we need to find the adjacent tab to activate. The algorithm:
1. Find the index of the closing tab in `tabOrder`
2. If there are remaining tabs, activate the next one (or previous if closing the last in order)
3. If no tabs remain, activate null (empty state)

```javascript
export function closeTab(sessionId) {
  const iframe = iframes.get(sessionId);
  if (!iframe) return;

  // Remove iframe from DOM and Map
  iframe.remove();
  iframes.delete(sessionId);

  // Remove tab element from DOM
  removeTabElement(sessionId);

  // Remove from tab order
  const orderIndex = tabOrder.indexOf(sessionId);
  if (orderIndex !== -1) {
    tabOrder.splice(orderIndex, 1);
  }

  // Adjacent tab activation (AC-4.4b)
  if (activeTab === sessionId) {
    if (tabOrder.length > 0) {
      // Activate next tab, or previous if we closed the last one
      const newIndex = orderIndex < tabOrder.length ? orderIndex : tabOrder.length - 1;
      activateTab(tabOrder[newIndex]);
    } else {
      // No tabs left (AC-4.4c)
      activateTab(null);
    }
  }

  persistTabState();
}
```

#### 5. `updateTabTitle(sessionId, title)`

```javascript
export function updateTabTitle(sessionId, title) {
  const tabEl = tabBar.querySelector(`.tab[data-session-id="${sessionId}"]`);
  if (tabEl) {
    const titleEl = tabEl.querySelector('.tab-title');
    if (titleEl) {
      titleEl.textContent = title;
    }
  }
  // Also update stored metadata for restore
  persistTabState();
}
```

#### 6. Query functions

```javascript
export function hasTab(sessionId) {
  return iframes.has(sessionId);
}

export function getActiveTab() {
  return activeTab;
}

export function getTabCount() {
  return iframes.size;
}

export function getTabOrder() {
  return [...tabOrder];
}
```

#### 7. `reorderTabs(draggedId, targetId)` -- drag-and-drop (AC-4.6)

Move the dragged tab to the position of the target tab.

```javascript
export function reorderTabs(draggedId, targetId) {
  const draggedIndex = tabOrder.indexOf(draggedId);
  const targetIndex = tabOrder.indexOf(targetId);

  if (draggedIndex === -1 || targetIndex === -1) return;

  // Remove dragged from current position
  tabOrder.splice(draggedIndex, 1);
  // Insert at target position
  tabOrder.splice(targetIndex, 0, draggedId);

  // Reorder DOM to match
  reorderTabBarDOM();

  persistTabState();
}
```

#### 8. Internal helpers

**`renderTabElement`:**

```javascript
function renderTabElement(sessionId, title, cliType) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.sessionId = sessionId;
  tab.draggable = true;

  const indicator = document.createElement('span');
  indicator.className = 'tab-cli-indicator';
  indicator.dataset.cliType = cliType;
  indicator.textContent = cliType === 'claude-code' ? 'CC' : 'CX';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'tab-title';
  titleSpan.textContent = title;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '\u00d7'; // multiplication sign (x)
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(sessionId);
  });

  tab.appendChild(indicator);
  tab.appendChild(titleSpan);
  tab.appendChild(closeBtn);

  // Click to activate
  tab.addEventListener('click', () => activateTab(sessionId));

  // Drag-and-drop handlers
  setupDragHandlers(tab, sessionId);

  tabBar.appendChild(tab);
  return tab;
}
```

**`removeTabElement`:**

```javascript
function removeTabElement(sessionId) {
  const tab = tabBar.querySelector(`.tab[data-session-id="${sessionId}"]`);
  if (tab) {
    tab.remove();
  }
}
```

**`updateTabBarHighlight`:**

```javascript
function updateTabBarHighlight(sessionId) {
  const tabs = tabBar.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    if (tab.dataset.sessionId === sessionId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}
```

**`persistTabState`:**

Tab state is persisted to localStorage as a JSON object. This is called after every tab operation. The format stores the tab metadata needed for restore (titles, cliTypes) alongside the structural state (openTabs, activeTab, tabOrder).

```javascript
function persistTabState() {
  // Collect tab metadata for restore
  const tabMeta = {};
  for (const tab of tabBar.querySelectorAll('.tab')) {
    const sid = tab.dataset.sessionId;
    tabMeta[sid] = {
      title: tab.querySelector('.tab-title')?.textContent || 'New Session',
      cliType: tab.querySelector('.tab-cli-indicator')?.dataset.cliType || 'claude-code',
    };
  }

  const state = {
    openTabs: [...iframes.keys()],
    activeTab: activeTab,
    tabOrder: [...tabOrder],
    tabMeta: tabMeta,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // localStorage may be full or unavailable -- fail silently
    console.warn('Failed to persist tab state:', e);
  }
}
```

**`restoreTabState`:**

```javascript
function restoreTabState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const state = JSON.parse(saved);
    if (!state || !Array.isArray(state.openTabs)) return null;

    // Restore each tab
    const meta = state.tabMeta || {};
    for (const sessionId of state.tabOrder || state.openTabs) {
      if (!state.openTabs.includes(sessionId)) continue;
      const info = meta[sessionId] || {};
      // Use openTab to recreate (but skip persist calls during restore)
      const title = info.title || 'New Session';
      const cliType = info.cliType || 'claude-code';

      // Create iframe directly (avoiding re-persist during restore)
      const iframe = document.createElement('iframe');
      iframe.src = `/portlet/index.html?sessionId=${encodeURIComponent(sessionId)}`;
      iframe.dataset.sessionId = sessionId;
      iframe.className = 'portlet-iframe';
      portletContainer.appendChild(iframe);
      iframes.set(sessionId, iframe);

      renderTabElement(sessionId, title, cliType);
      tabOrder.push(sessionId);
    }

    // Activate saved active tab (or first available)
    if (state.activeTab && iframes.has(state.activeTab)) {
      activateTab(state.activeTab);
    } else if (iframes.size > 0) {
      activateTab(tabOrder[0]);
    }

    return state;
  } catch (e) {
    console.warn('Failed to restore tab state:', e);
    return null;
  }
}
```

**`setupDragHandlers`:**

```javascript
function setupDragHandlers(tabElement, sessionId) {
  tabElement.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', sessionId);
    e.dataTransfer.effectAllowed = 'move';
    tabElement.classList.add('dragging');
  });

  tabElement.addEventListener('dragend', () => {
    tabElement.classList.remove('dragging');
  });
}
```

**`reorderTabBarDOM`:**

```javascript
function reorderTabBarDOM() {
  // Reorder tab elements in DOM to match tabOrder
  for (const sessionId of tabOrder) {
    const tab = tabBar.querySelector(`.tab[data-session-id="${sessionId}"]`);
    if (tab) {
      tabBar.appendChild(tab); // appendChild moves existing element to end
    }
  }
}
```

**`toggleEmptyState`:**

```javascript
function toggleEmptyState(show) {
  if (emptyState) {
    emptyState.style.display = show ? 'block' : 'none';
  }
}
```

#### 9. CSS additions for `client/shell/shell.css`

Add these styles for the tab bar if not already present:

```css
/* Tab bar */
#tab-bar {
  display: flex;
  gap: 0;
  overflow-x: auto;
  background: var(--bg-secondary, #1a1b26);
  border-bottom: 1px solid var(--border, #292e42);
  min-height: 36px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  cursor: pointer;
  border-right: 1px solid var(--border, #292e42);
  background: var(--bg-secondary, #1a1b26);
  color: var(--text-muted, #565f89);
  font-size: 13px;
  white-space: nowrap;
  user-select: none;
  transition: background 0.1s;
}

.tab:hover {
  background: var(--bg-tertiary, #24283b);
}

.tab.active {
  background: var(--bg-primary, #1a1b26);
  color: var(--text-primary, #c0caf5);
  border-bottom: 2px solid var(--accent, #7aa2f7);
}

.tab.dragging {
  opacity: 0.5;
}

.tab-cli-indicator {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--bg-tertiary, #24283b);
}

.tab-cli-indicator[data-cli-type="claude-code"] {
  color: var(--claude-color, #d4a0ff);
}

.tab-cli-indicator[data-cli-type="codex"] {
  color: var(--codex-color, #73daca);
}

.tab-title {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close {
  background: none;
  border: none;
  color: var(--text-muted, #565f89);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}

.tab-close:hover {
  color: var(--text-primary, #c0caf5);
}

/* Portlet container */
.portlet-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

/* Empty state */
#empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted, #565f89);
  font-size: 16px;
}
```

## Constraints

- Prefer not to modify tests; if a Red test has an invalid assumption, make the smallest TC-preserving correction and document it.
- Do NOT modify files outside `client/shell/tabs.js` and `client/shell/shell.css`
- Do NOT add new dependencies
- The tab system is purely client-side -- no WebSocket messages for tab operations
- localStorage key MUST be `liminal:tabs`
- localStorage format MUST include `{ openTabs: string[], activeTab: string | null, tabOrder: string[] }` (plus `tabMeta` for restore)

## If Blocked or Uncertain

- If tests expect a different DOM structure than shown above, adapt the implementation to match the test expectations
- If the existing shell.css already has tab styles, extend rather than overwrite
- If you encounter inconsistencies between the test assertions and this implementation guide -- the tests are authoritative, adapt the implementation

## Verification

Run:
```bash
bun test
```

Expected:
- All 71 tests PASS (57 previous + 14 new)
- Zero failures

Run:
```bash
bun run typecheck
```

Expected: zero errors

## Done When

- [ ] All 14 tests in `tests/client/tabs.test.ts` PASS
- [ ] All 57 previous tests still PASS
- [ ] `bun run typecheck` passes with zero errors
- [ ] `client/shell/tabs.js` fully implements: openTab, activateTab, closeTab, updateTabTitle, hasTab, getActiveTab, getTabCount, getTabOrder, reorderTabs, init (and `initTabs` compatibility export)
- [ ] Iframe lifecycle works: create on open, CSS toggle on switch, remove on close
- [ ] Deduplication works: opening already-tabbed session activates existing tab
- [ ] Adjacent tab activation works: closing middle tab activates next, closing last activates previous, closing only tab shows empty state
- [ ] Drag-and-drop reorder works: reorderTabs updates tabOrder and DOM order
- [ ] localStorage persistence works: every operation persists, init restores
