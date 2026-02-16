/**
 * Chat rendering module.
 * Renders chat entries (user, assistant, tool-call, thinking).
 */

import { renderMarkdown } from "../shared/markdown.js";

/** @type {HTMLElement | null} */
let chatContainer = null;

/** @type {boolean} */
let userScrolledUp = false;

/** @type {HTMLButtonElement | null} */
let scrollToBottomBtn = null;

/** @type {boolean} */
let suppressAutoScroll = false;

/** @type {number} */
let historyScrollGeneration = 0;

/** @type {Map<string, object>} */
const entriesById = new Map();

/** @type {Map<string, HTMLElement>} */
const entryElementsById = new Map();

/** @type {Set<string>} */
const finalizedEntryIds = new Set();

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function getEntryElement(entryId) {
	const cached = entryElementsById.get(entryId);
	if (cached instanceof HTMLElement && cached.isConnected) {
		return cached;
	}
	if (cached && !cached.isConnected) {
		entryElementsById.delete(entryId);
	}
	const queried =
		chatContainer?.querySelector(`[data-entry-id="${entryId}"]`) ?? null;
	if (queried instanceof HTMLElement) {
		entryElementsById.set(entryId, queried);
		return queried;
	}
	return null;
}

function ensureEntryElement(entryId, className) {
	if (!chatContainer) {
		return null;
	}

	const existing = getEntryElement(entryId);
	if (existing instanceof HTMLElement) {
		existing.className = className;
		return existing;
	}

	const element = document.createElement("div");
	element.dataset.entryId = entryId;
	element.className = className;
	chatContainer.appendChild(element);
	entryElementsById.set(entryId, element);
	return element;
}

function formatTimestamp(timestamp) {
	if (typeof timestamp !== "string") {
		return "";
	}
	return timestamp;
}

function renderUserEntry(entry) {
	const element = ensureEntryElement(
		entry.entryId,
		"chat-entry chat-entry-user",
	);
	if (!element) {
		return;
	}

	element.textContent = "";
	const content = document.createElement("div");
	content.className = "entry-content";
	content.textContent = entry.content ?? "";
	element.appendChild(content);

	const timestamp = document.createElement("time");
	timestamp.className = "entry-timestamp";
	timestamp.textContent = formatTimestamp(entry.timestamp);
	element.appendChild(timestamp);
}

function renderAssistantEntry(entry) {
	const element = ensureEntryElement(
		entry.entryId,
		"chat-entry chat-entry-assistant",
	);
	if (!element) {
		return;
	}

	const isFinalized = finalizedEntryIds.has(entry.entryId);
	const contentValue = entry.content ?? "";

	if (isFinalized) {
		element.classList.remove("streaming-cursor");
		element.innerHTML = renderMarkdown(contentValue);
		return;
	}

	element.classList.add("streaming-cursor");
	element.textContent = contentValue;
}

function renderThinkingEntry(entry) {
	const element = ensureEntryElement(
		entry.entryId,
		"chat-entry chat-entry-thinking thinking-block",
	);
	if (!element) {
		return;
	}

	element.textContent = "";
	const details = document.createElement("details");
	const summary = document.createElement("summary");
	summary.textContent = "Thinking...";
	const content = document.createElement("div");
	content.textContent = entry.content ?? "";
	details.append(summary, content);
	element.appendChild(details);
}

function renderToolCallEntry(entry) {
	if (!chatContainer) {
		return;
	}

	const existing = getEntryElement(entry.entryId);
	const element = document.createElement("div");
	element.dataset.entryId = entry.entryId;
	element.className = "chat-entry chat-entry-tool-call";

	if (entry.status === "running") {
		const toolName = document.createElement("span");
		toolName.className = "tool-name";
		toolName.textContent = entry.name;

		const running = document.createElement("span");
		running.className = "tool-status-running";
		running.textContent = " Running...";
		element.append(toolName, running);
	} else if (entry.status === "complete") {
		const details = document.createElement("details");
		details.open = false;
		const summary = document.createElement("summary");
		summary.textContent = `${entry.name} (done)`;
		const result = document.createElement("pre");
		result.textContent = entry.result ?? "";
		details.append(summary, result);
		element.appendChild(details);
	} else {
		const toolName = document.createElement("span");
		toolName.className = "tool-name";
		toolName.textContent = entry.name;

		const error = document.createElement("span");
		error.className = "tool-status-error";
		error.textContent = ` Error: ${entry.error ?? "Unknown error"}`;
		element.append(toolName, error);
	}

	if (existing instanceof HTMLElement) {
		existing.replaceWith(element);
		entryElementsById.set(entry.entryId, element);
		return;
	}
	chatContainer.appendChild(element);
	entryElementsById.set(entry.entryId, element);
}

function autoScroll() {
	if (!chatContainer) {
		return;
	}
	if (suppressAutoScroll) {
		return;
	}

	if (!userScrolledUp) {
		chatContainer.scrollTop = chatContainer.scrollHeight;
	}
}

function forceScrollToBottom() {
	if (!chatContainer) {
		return;
	}

	chatContainer.scrollTop = chatContainer.scrollHeight;
	userScrolledUp = false;
	if (scrollToBottomBtn) {
		scrollToBottomBtn.style.display = "none";
	}
}

function scheduleHistoryBottomScroll() {
	historyScrollGeneration += 1;
	const generation = historyScrollGeneration;

	const maybeScroll = () => {
		if (generation !== historyScrollGeneration) {
			return;
		}
		forceScrollToBottom();
	};

	maybeScroll();
	setTimeout(maybeScroll, 0);
	setTimeout(maybeScroll, 32);
	setTimeout(maybeScroll, 96);

	if (
		typeof window !== "undefined" &&
		typeof window.requestAnimationFrame === "function"
	) {
		window.requestAnimationFrame(() => {
			maybeScroll();
			window.requestAnimationFrame(() => {
				maybeScroll();
			});
		});
	}
}

/**
 * Initialize the chat renderer.
 * @param {HTMLElement} container
 */
export function init(container) {
	chatContainer = container;
	userScrolledUp = false;
	scrollToBottomBtn = document.getElementById("scroll-to-bottom");

	chatContainer.addEventListener("scroll", () => {
		const atBottom =
			chatContainer.scrollHeight - chatContainer.scrollTop <=
			chatContainer.clientHeight + 50;
		userScrolledUp = !atBottom;
		if (scrollToBottomBtn) {
			scrollToBottomBtn.style.display = userScrolledUp ? "block" : "none";
		}
	});

	scrollToBottomBtn?.addEventListener("click", () => {
		if (!chatContainer) {
			return;
		}
		chatContainer.scrollTop = chatContainer.scrollHeight;
		userScrolledUp = false;
		scrollToBottomBtn.style.display = "none";
	});
}

/**
 * Render all entries (full history replacement).
 * @param {object[]} entries
 */
export function renderAll(entries) {
	if (!chatContainer) {
		return;
	}

	chatContainer.textContent = "";
	entriesById.clear();
	entryElementsById.clear();
	finalizedEntryIds.clear();
	suppressAutoScroll = true;

	for (const entry of entries) {
		// History entries have already completed, so assistant turns should
		// render as finalized markdown immediately on load.
		if (entry?.type === "assistant") {
			finalizedEntryIds.add(entry.entryId);
		}
		renderEntry(entry);
	}
	suppressAutoScroll = false;
	scheduleHistoryBottomScroll();
}

/**
 * Render a chat entry into the chat container.
 * @param {object} entry - ChatEntry object
 */
export function renderEntry(entry) {
	if (!chatContainer || !entry || typeof entry !== "object") {
		return;
	}

	entriesById.set(entry.entryId, entry);

	switch (entry.type) {
		case "user":
			renderUserEntry(entry);
			break;
		case "assistant":
			renderAssistantEntry(entry);
			break;
		case "thinking":
			renderThinkingEntry(entry);
			break;
		case "tool-call":
			renderToolCallEntry(entry);
			break;
		default:
			break;
	}

	autoScroll();
}

/**
 * Update entry content for streaming chunks.
 * @param {string} entryId
 * @param {string} content
 */
export function updateEntryContent(entryId, content) {
	const entry = entriesById.get(entryId);
	if (entry && typeof entry === "object") {
		entry.content = content;
	}

	const element = getEntryElement(entryId);
	if (!(element instanceof HTMLElement)) {
		return;
	}

	if (element.classList.contains("chat-entry-assistant")) {
		element.classList.add("streaming-cursor");
	}
	element.textContent = content;
	autoScroll();
}

/**
 * Finalize an entry after complete/cancel.
 * @param {string} entryId
 */
export function finalizeEntry(entryId) {
	const entry = entriesById.get(entryId);
	const element = getEntryElement(entryId);
	if (!(entry && typeof entry === "object" && element instanceof HTMLElement)) {
		return;
	}

	finalizedEntryIds.add(entryId);

	if (entry.type === "assistant") {
		element.classList.remove("streaming-cursor");
		element.innerHTML = renderMarkdown(entry.content ?? "");
	}

	autoScroll();
}

/**
 * Show an error in chat UI.
 * @param {string} message
 */
export function showError(message) {
	if (!chatContainer) {
		return;
	}

	const errorEntry = document.createElement("div");
	errorEntry.className = "chat-entry chat-entry-error";
	errorEntry.innerHTML = `<strong>Error:</strong> ${escapeHtml(message ?? "")}`;
	chatContainer.appendChild(errorEntry);
	autoScroll();
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
