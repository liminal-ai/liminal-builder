/**
 * Chat rendering stub.
 * Renders chat entries (user, assistant, tool-call, thinking).
 * Will be implemented in Story 3.
 */

/** @type {HTMLElement | null} */
let chatContainer = null;

/** @type {boolean} */
let userScrolledUp = false;

/** @type {HTMLButtonElement | null} */
let scrollToBottomBtn = null;

/**
 * Initialize the chat renderer.
 * @param {HTMLElement} container
 */
export function init(container) {
	chatContainer = container;
	userScrolledUp = false;
	scrollToBottomBtn = document.getElementById("scroll-to-bottom");
	throw new Error("NotImplementedError");
}

/**
 * Render all entries (full history replacement).
 * @param {object[]} _entries
 */
export function renderAll(_entries) {
	throw new Error("NotImplementedError");
}

/**
 * Render a chat entry into the chat container.
 * @param {object} entry - ChatEntry object
 */
export function renderEntry(_entry) {
	throw new Error("NotImplementedError");
}

/**
 * Update entry content for streaming chunks.
 * @param {string} _entryId
 * @param {string} _content
 */
export function updateEntryContent(_entryId, _content) {
	throw new Error("NotImplementedError");
}

/**
 * Finalize an entry after complete/cancel.
 * @param {string} _entryId
 */
export function finalizeEntry(_entryId) {
	throw new Error("NotImplementedError");
}

/**
 * Show an error in chat UI.
 * @param {string} _message
 */
export function showError(_message) {
	throw new Error("NotImplementedError");
}

/**
 * Internal auto-scroll state getter for tests.
 * @returns {boolean}
 */
export function getUserScrolledUp() {
	return userScrolledUp;
}

/**
 * Internal control getter for tests.
 * @returns {HTMLButtonElement | null}
 */
export function getScrollToBottomButton() {
	return scrollToBottomBtn;
}

/**
 * Internal container getter for tests.
 * @returns {HTMLElement | null}
 */
export function getChatContainer() {
	return chatContainer;
}
