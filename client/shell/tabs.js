// client/shell/tabs.js -- Tab bar management
// Manages tab lifecycle: open, close, switch, reorder, persist
// Each tab corresponds to a session portlet iframe
// AC-4.1 through AC-4.7

import { STORAGE_KEYS } from "../shared/constants.js";

const STORAGE_KEY = STORAGE_KEYS.TABS;

// Source of truth for tabbed sessions
// Map<sessionId, iframe element>
const iframes = new Map();

// Current active tab session ID (or null)
// biome-ignore lint/style/useConst: reassigned in Story 5 Green
let activeTab = null;

// Tab order array (session IDs in display order)
// biome-ignore lint/style/useConst: reassigned in Story 5 Green
let tabOrder = [];

// DOM references (set during init)
// biome-ignore lint/style/useConst: reassigned in Story 5 Green
let tabBar = null;
// biome-ignore lint/style/useConst: reassigned in Story 5 Green
let portletContainer = null;
// biome-ignore lint/style/useConst: reassigned in Story 5 Green
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
	void tabBarEl;
	void containerEl;
	void emptyStateEl;
	throw new Error("Not implemented");
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
	void sessionId;
	void title;
	void cliType;
	throw new Error("Not implemented");
}

/**
 * Activate a tab (make it visible, hide others).
 * CSS display toggle: target iframe gets display:block, all others display:none.
 * Updates tab bar highlighting and persists state.
 * @param {string} sessionId - Session ID to activate (or null for empty state)
 */
export function activateTab(sessionId) {
	void sessionId;
	throw new Error("Not implemented");
}

/**
 * Close a tab. Removes iframe and tab element.
 * If closing the active tab, activates the adjacent tab (next, or previous if last).
 * If closing the last tab, shows empty state.
 * @param {string} sessionId - Session ID to close
 */
export function closeTab(sessionId) {
	void sessionId;
	throw new Error("Not implemented");
}

/**
 * Update the title displayed on a tab.
 * Called when session:title-updated arrives from the server.
 * @param {string} sessionId - Session ID
 * @param {string} title - New title
 */
export function updateTabTitle(sessionId, title) {
	void sessionId;
	void title;
	throw new Error("Not implemented");
}

/**
 * Check if a session is currently tabbed.
 * @param {string} sessionId
 * @returns {boolean}
 */
export function hasTab(sessionId) {
	void sessionId;
	throw new Error("Not implemented");
}

/**
 * Get the active tab session ID.
 * @returns {string|null}
 */
export function getActiveTab() {
	throw new Error("Not implemented");
}

/**
 * Get the number of open tabs.
 * @returns {number}
 */
export function getTabCount() {
	throw new Error("Not implemented");
}

/**
 * Get the current tab order.
 * @returns {string[]}
 */
export function getTabOrder() {
	throw new Error("Not implemented");
}

/**
 * Reorder tabs. Moves draggedId to the position of targetId.
 * @param {string} draggedId - Session ID being dragged
 * @param {string} targetId - Session ID of the drop target
 */
export function reorderTabs(draggedId, targetId) {
	void draggedId;
	void targetId;
	throw new Error("Not implemented");
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
	void sessionId;
	void title;
	void cliType;
	throw new Error("Not implemented");
}

/**
 * Remove a tab element from the tab bar.
 * @param {string} sessionId
 */
function removeTabElement(sessionId) {
	void sessionId;
	throw new Error("Not implemented");
}

/**
 * Update tab bar to highlight the active tab.
 * @param {string} sessionId - Active session ID (or null)
 */
function updateTabBarHighlight(sessionId) {
	void sessionId;
	throw new Error("Not implemented");
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
	throw new Error("Not implemented");
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
	throw new Error("Not implemented");
}

/**
 * Set up drag-and-drop event handlers on a tab element.
 * Uses native HTML5 drag-and-drop API.
 * @param {HTMLElement} tabElement
 * @param {string} sessionId
 */
function setupDragHandlers(tabElement, sessionId) {
	void tabElement;
	void sessionId;
	throw new Error("Not implemented");
}

/**
 * Show or hide the empty state element.
 * @param {boolean} show
 */
function toggleEmptyState(show) {
	void show;
	throw new Error("Not implemented");
}

// ---- Relay lookup API (used by shell.js postMessage relay) ----

/**
 * Get the iframe element for a given session ID.
 * Used by shell.js to route WebSocket messages to the correct portlet.
 * @param {string} sessionId
 * @returns {HTMLIFrameElement | undefined}
 */
export function getIframe(sessionId) {
	return iframes.get(sessionId);
}

/**
 * Reverse-lookup: find the session ID for a given iframe contentWindow.
 * Used by shell.js to determine which session a portlet postMessage came from.
 * @param {Window} source - The event.source from the postMessage event
 * @returns {string | undefined}
 */
export function getSessionIdBySource(source) {
	for (const [sessionId, iframe] of iframes) {
		if (iframe.contentWindow === source) {
			return sessionId;
		}
	}
	return undefined;
}

void STORAGE_KEY;
void activeTab;
void tabOrder;
void tabBar;
void portletContainer;
void emptyState;
void renderTabElement;
void removeTabElement;
void updateTabBarHighlight;
void persistTabState;
void restoreTabState;
void setupDragHandlers;
void toggleEmptyState;
