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
let activeTab = null;

// Tab order array (session IDs in display order)
const tabOrder = [];

// DOM references (set during init)
let tabBar = null;
let portletContainer = null;
let emptyState = null;
let tabBarDragOverHandler = null;
let tabBarDropHandler = null;

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
	if (tabBar && tabBarDragOverHandler) {
		tabBar.removeEventListener("dragover", tabBarDragOverHandler);
	}
	if (tabBar && tabBarDropHandler) {
		tabBar.removeEventListener("drop", tabBarDropHandler);
	}

	tabBar = tabBarEl ?? document.getElementById("tab-bar");
	portletContainer =
		containerEl ?? document.getElementById("portlet-container");
	emptyState = emptyStateEl ?? document.getElementById("empty-state");

	if (!tabBar || !portletContainer || !emptyState) {
		throw new Error("tabs.init: required DOM elements missing");
	}

	tabBarDragOverHandler = (event) => {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}
	};
	tabBar.addEventListener("dragover", tabBarDragOverHandler);

	tabBarDropHandler = (event) => {
		event.preventDefault();
		const draggedId = event.dataTransfer?.getData("text/plain");
		const target = event.target;
		const dropTarget =
			target instanceof Element ? target.closest(".tab") : null;
		if (!dropTarget || !draggedId) {
			return;
		}
		const targetId = dropTarget.dataset.sessionId;
		if (!targetId || draggedId === targetId) {
			return;
		}
		reorderTabs(draggedId, targetId);
	};
	tabBar.addEventListener("drop", tabBarDropHandler);

	if (iframes.size === 0) {
		restoreTabState();
	}
	if (iframes.size === 0) {
		toggleEmptyState(true);
	}
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
	if (iframes.has(sessionId)) {
		activateTab(sessionId);
		return;
	}

	if (!portletContainer) {
		throw new Error("tabs.openTab: init must be called before openTab");
	}

	const iframe = document.createElement("iframe");
	iframe.src = `/portlet/index.html?sessionId=${encodeURIComponent(sessionId)}`;
	iframe.dataset.sessionId = sessionId;
	iframe.className = "portlet-iframe";
	portletContainer.appendChild(iframe);
	iframes.set(sessionId, iframe);

	renderTabElement(sessionId, title, cliType);
	tabOrder.push(sessionId);
	activateTab(sessionId);
	toggleEmptyState(false);
	persistTabState();
}

/**
 * Activate a tab (make it visible, hide others).
 * CSS display toggle: target iframe gets display:block, all others display:none.
 * Updates tab bar highlighting and persists state.
 * @param {string} sessionId - Session ID to activate (or null for empty state)
 */
export function activateTab(sessionId) {
	if (sessionId === null) {
		for (const [, iframe] of iframes) {
			iframe.style.display = "none";
		}
		activeTab = null;
		updateTabBarHighlight(null);
		toggleEmptyState(true);
		persistTabState();
		return;
	}

	for (const [id, iframe] of iframes) {
		iframe.style.display = id === sessionId ? "block" : "none";
	}

	activeTab = sessionId;
	updateTabBarHighlight(sessionId);
	toggleEmptyState(false);
	persistTabState();
}

/**
 * Close a tab. Removes iframe and tab element.
 * If closing the active tab, activates the adjacent tab (next, or previous if last).
 * If closing the last tab, shows empty state.
 * @param {string} sessionId - Session ID to close
 */
export function closeTab(sessionId) {
	const iframe = iframes.get(sessionId);
	if (!iframe) {
		return;
	}

	iframe.remove();
	iframes.delete(sessionId);
	removeTabElement(sessionId);

	const orderIndex = tabOrder.indexOf(sessionId);
	if (orderIndex !== -1) {
		tabOrder.splice(orderIndex, 1);
	}

	if (activeTab === sessionId) {
		if (tabOrder.length > 0) {
			const newIndex =
				orderIndex < tabOrder.length ? orderIndex : tabOrder.length - 1;
			activateTab(tabOrder[newIndex] ?? null);
		} else {
			activateTab(null);
		}
	}

	persistTabState();
}

/**
 * Update the title displayed on a tab.
 * Called when session:title-updated arrives from the server.
 * @param {string} sessionId - Session ID
 * @param {string} title - New title
 */
export function updateTabTitle(sessionId, title) {
	if (!tabBar) {
		return;
	}
	const tabEl = tabBar.querySelector(`.tab[data-session-id="${sessionId}"]`);
	if (!tabEl) {
		return;
	}
	const titleEl = tabEl.querySelector(".tab-title");
	if (titleEl) {
		titleEl.textContent = title;
	}
	persistTabState();
}

/**
 * Check if a session is currently tabbed.
 * @param {string} sessionId
 * @returns {boolean}
 */
export function hasTab(sessionId) {
	return iframes.has(sessionId);
}

/**
 * Get the active tab session ID.
 * @returns {string|null}
 */
export function getActiveTab() {
	return activeTab;
}

/**
 * Get the number of open tabs.
 * @returns {number}
 */
export function getTabCount() {
	return iframes.size;
}

/**
 * Get the current tab order.
 * @returns {string[]}
 */
export function getTabOrder() {
	return [...tabOrder];
}

/**
 * Reorder tabs. Moves draggedId to the position of targetId.
 * @param {string} draggedId - Session ID being dragged
 * @param {string} targetId - Session ID of the drop target
 */
export function reorderTabs(draggedId, targetId) {
	const draggedIndex = tabOrder.indexOf(draggedId);
	const targetIndex = tabOrder.indexOf(targetId);
	if (draggedIndex === -1 || targetIndex === -1) {
		return;
	}
	if (draggedIndex === targetIndex) {
		return;
	}

	tabOrder.splice(draggedIndex, 1);
	// "Drop on tab" is consistently interpreted as insert before target.
	const insertIndex =
		draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
	tabOrder.splice(insertIndex, 0, draggedId);
	reorderTabBarDOM();
	persistTabState();
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
	if (!tabBar) {
		throw new Error("tabs.renderTabElement: tab bar is not initialized");
	}

	const tab = document.createElement("div");
	tab.className = "tab";
	tab.dataset.sessionId = sessionId;
	tab.draggable = true;

	const indicator = document.createElement("span");
	indicator.className = "tab-cli-indicator";
	indicator.dataset.cliType = cliType;
	indicator.textContent = cliType === "claude-code" ? "CC" : "CX";

	const titleSpan = document.createElement("span");
	titleSpan.className = "tab-title";
	titleSpan.textContent = title;

	const closeBtn = document.createElement("button");
	closeBtn.className = "tab-close";
	closeBtn.type = "button";
	closeBtn.textContent = "\u00d7";
	closeBtn.addEventListener("click", (event) => {
		event.stopPropagation();
		closeTab(sessionId);
	});

	tab.appendChild(indicator);
	tab.appendChild(titleSpan);
	tab.appendChild(closeBtn);

	tab.addEventListener("click", () => {
		activateTab(sessionId);
	});

	setupDragHandlers(tab, sessionId);
	tabBar.appendChild(tab);
	return tab;
}

/**
 * Remove a tab element from the tab bar.
 * @param {string} sessionId
 */
function removeTabElement(sessionId) {
	if (!tabBar) {
		return;
	}
	const tab = tabBar.querySelector(`.tab[data-session-id="${sessionId}"]`);
	if (tab) {
		tab.remove();
	}
}

/**
 * Update tab bar to highlight the active tab.
 * @param {string} sessionId - Active session ID (or null)
 */
function updateTabBarHighlight(sessionId) {
	if (!tabBar) {
		return;
	}
	const tabs = tabBar.querySelectorAll(".tab");
	for (const tab of tabs) {
		if (tab.dataset.sessionId === sessionId) {
			tab.classList.add("active");
		} else {
			tab.classList.remove("active");
		}
	}
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
	if (!tabBar) {
		return;
	}

	const tabMeta = {};
	for (const tab of tabBar.querySelectorAll(".tab")) {
		const sessionId = tab.dataset.sessionId;
		if (!sessionId) {
			continue;
		}
		tabMeta[sessionId] = {
			title: tab.querySelector(".tab-title")?.textContent || "New Session",
			cliType:
				tab.querySelector(".tab-cli-indicator")?.dataset.cliType ||
				"claude-code",
		};
	}

	const state = {
		openTabs: [...iframes.keys()],
		activeTab,
		tabOrder: [...tabOrder],
		tabMeta,
	};

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch (error) {
		console.warn("Failed to persist tab state:", error);
	}
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
	if (!portletContainer) {
		return null;
	}

	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (!saved) {
			return null;
		}

		const state = JSON.parse(saved);
		if (!state || !Array.isArray(state.openTabs)) {
			return null;
		}

		const openTabs = Array.isArray(state.openTabs) ? state.openTabs : [];
		const savedOrder = Array.isArray(state.tabOrder)
			? state.tabOrder
			: openTabs;
		const tabMeta =
			typeof state.tabMeta === "object" && state.tabMeta !== null
				? state.tabMeta
				: {};

		for (const sessionId of savedOrder) {
			if (!openTabs.includes(sessionId)) {
				continue;
			}

			const info =
				typeof tabMeta[sessionId] === "object" && tabMeta[sessionId] !== null
					? tabMeta[sessionId]
					: {};
			const title =
				typeof info.title === "string" && info.title.length > 0
					? info.title
					: "New Session";
			const cliType =
				typeof info.cliType === "string" && info.cliType.length > 0
					? info.cliType
					: "claude-code";

			const iframe = document.createElement("iframe");
			iframe.src = `/portlet/index.html?sessionId=${encodeURIComponent(sessionId)}`;
			iframe.dataset.sessionId = sessionId;
			iframe.className = "portlet-iframe";
			portletContainer.appendChild(iframe);
			iframes.set(sessionId, iframe);

			renderTabElement(sessionId, title, cliType);
			tabOrder.push(sessionId);
		}

		if (state.activeTab && iframes.has(state.activeTab)) {
			activateTab(state.activeTab);
		} else if (iframes.size > 0) {
			activateTab(tabOrder[0] ?? null);
		}

		return state;
	} catch (error) {
		console.warn("Failed to restore tab state:", error);
		return null;
	}
}

/**
 * Set up drag-and-drop event handlers on a tab element.
 * Uses native HTML5 drag-and-drop API.
 * @param {HTMLElement} tabElement
 * @param {string} sessionId
 */
function setupDragHandlers(tabElement, sessionId) {
	tabElement.addEventListener("dragstart", (event) => {
		if (event.dataTransfer) {
			event.dataTransfer.setData("text/plain", sessionId);
			event.dataTransfer.effectAllowed = "move";
		}
		tabElement.classList.add("dragging");
	});

	tabElement.addEventListener("dragend", () => {
		tabElement.classList.remove("dragging");
	});
}

/**
 * Show or hide the empty state element.
 * @param {boolean} show
 */
function toggleEmptyState(show) {
	if (!emptyState) {
		return;
	}
	emptyState.style.display = show ? "" : "none";
}

function reorderTabBarDOM() {
	if (!tabBar) {
		return;
	}
	for (const sessionId of tabOrder) {
		const tab = tabBar.querySelector(`.tab[data-session-id="${sessionId}"]`);
		if (tab) {
			tabBar.appendChild(tab);
		}
	}
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
