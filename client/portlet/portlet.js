/**
 * Portlet entry point stub.
 * Handles postMessage communication with the shell.
 * Will be implemented in Story 3.
 */

import * as chat from "./chat.js";
import * as input from "./input.js";

/** @typedef {"idle" | "sending" | "launching"} SessionState */
const MESSAGE_LISTENER_KEY = "__lbPortletMessageListener";
const EXPECTED_ORIGIN_KEY = "__lbPortletExpectedOrigin";

/** @type {object[]} */
const entries = [];

/** @type {{ value: SessionState }} */
const sessionState = { value: "idle" };

/** @type {string[]} */
const pendingOptimisticUserEntryIds = [];

/** @type {boolean} */
let bootstrapped = false;

function getExpectedOrigin() {
	if (typeof window === "undefined") {
		return "";
	}
	if (typeof window[EXPECTED_ORIGIN_KEY] === "string") {
		return window[EXPECTED_ORIGIN_KEY];
	}
	const fallbackOrigin = window.location?.origin ?? "";
	window[EXPECTED_ORIGIN_KEY] = fallbackOrigin;
	return fallbackOrigin;
}

function getPostMessageTargetOrigin() {
	const expectedOrigin = getExpectedOrigin();
	if (!expectedOrigin || expectedOrigin === "null") {
		return "*";
	}
	return expectedOrigin;
}

function isAllowedOrigin(origin) {
	const expectedOrigin = getExpectedOrigin();
	if (typeof origin !== "string") {
		return false;
	}

	if (origin === expectedOrigin) {
		return true;
	}

	// Vitest/jsdom MessageEvent defaults to empty origin in unit tests.
	if (origin.length === 0) {
		const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
		return /\bjsdom\b/i.test(ua);
	}

	return false;
}

function bootstrapPortlet() {
	if (bootstrapped) {
		return;
	}

	const chatContainer = document.getElementById("chat-container");
	if (chatContainer instanceof HTMLElement) {
		chat.init(chatContainer);
	}

	const inputBar = document.getElementById("input-bar");
	if (inputBar instanceof HTMLElement) {
		input.init(inputBar, sendMessage, cancelResponse);
	}

	bootstrapped = true;
}

function replaceEntry(entryId, nextEntry) {
	const existingIndex = entries.findIndex((entry) => entry.entryId === entryId);
	if (existingIndex >= 0) {
		entries.splice(existingIndex, 1, nextEntry);
	} else {
		entries.push(nextEntry);
	}
}

if (typeof window !== "undefined") {
	if (typeof document !== "undefined") {
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", bootstrapPortlet, {
				once: true,
			});
		} else {
			bootstrapPortlet();
		}
	}

	const previousListener = window[MESSAGE_LISTENER_KEY];
	if (typeof previousListener === "function") {
		window.removeEventListener("message", previousListener);
	}

	const messageListener = (event) => {
		if (!isAllowedOrigin(event.origin)) {
			return;
		}
		try {
			handleShellMessage(event.data);
		} catch {
			// Story 3 Red skeleton intentionally throws until Green implementation.
		}
	};

	window[MESSAGE_LISTENER_KEY] = messageListener;
	window.addEventListener("message", messageListener);
}

/**
 * Handle shell -> portlet postMessage payloads.
 * @param {object} msg
 */
export function handleShellMessage(msg) {
	if (!bootstrapped) {
		bootstrapPortlet();
	}

	if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
		return;
	}

	switch (msg.type) {
		case "session:history": {
			entries.splice(0, entries.length, ...msg.entries);
			pendingOptimisticUserEntryIds.length = 0;
			chat.renderAll(entries);
			break;
		}

		case "session:update": {
			if (
				msg.entry.type === "user" &&
				pendingOptimisticUserEntryIds.length > 0
			) {
				const pendingEntryId = pendingOptimisticUserEntryIds.shift();
				if (pendingEntryId) {
					const pendingIndex = entries.findIndex(
						(entry) => entry.entryId === pendingEntryId,
					);
					if (pendingIndex >= 0) {
						entries.splice(pendingIndex, 1, msg.entry);
						const pendingElement = document.querySelector(
							`[data-entry-id="${pendingEntryId}"]`,
						);
						if (pendingElement instanceof HTMLElement) {
							pendingElement.remove();
						}
						chat.renderEntry(msg.entry);
						break;
					}
				}
			}

			replaceEntry(msg.entry.entryId, msg.entry);
			chat.renderEntry(msg.entry);
			break;
		}

		case "session:chunk": {
			const entry = entries.find(
				(candidate) => candidate.entryId === msg.entryId,
			);
			if (entry && typeof entry.content === "string") {
				entry.content += msg.content;
				chat.updateEntryContent(msg.entryId, entry.content);
			}
			break;
		}

		case "session:complete": {
			chat.finalizeEntry(msg.entryId);
			input.enable();
			sessionState.value = "idle";
			break;
		}

		case "session:cancelled": {
			chat.finalizeEntry(msg.entryId);
			input.enable();
			sessionState.value = "idle";
			break;
		}

		case "agent:status":
			handleAgentStatus(msg.status);
			break;

		case "session:error":
			chat.showError(msg.message);
			sessionState.value = "idle";
			input.enable();
			break;

		default:
			break;
	}
}

/**
 * Handle agent lifecycle status updates.
 * @param {"starting" | "connected" | "disconnected" | "reconnecting"} status
 */
export function handleAgentStatus(status) {
	const indicator = document.getElementById("agent-status");

	switch (status) {
		case "starting":
			sessionState.value = "launching";
			if (indicator) {
				indicator.textContent = "Launching agent...";
			}
			break;
		case "connected":
			sessionState.value = "idle";
			if (indicator) {
				indicator.textContent = "";
			}
			input.enable();
			break;
		case "disconnected":
			if (indicator) {
				indicator.textContent = "Agent disconnected";
			}
			input.disable();
			break;
		case "reconnecting":
			if (indicator) {
				indicator.textContent = "Reconnecting to agent...";
			}
			break;
		default:
			break;
	}
}

/**
 * Send a user message to parent shell.
 * Design intent for Green: post { type: "session:send", content } to parent.
 * The shell injects sessionId before WebSocket send.
 *
 * @param {string} content
 */
export function sendMessage(content) {
	if (!bootstrapped) {
		bootstrapPortlet();
	}

	if (typeof content !== "string" || content.trim().length === 0) {
		return;
	}

	const optimisticEntryId = `optimistic-user-${Date.now()}`;
	const optimisticEntry = {
		entryId: optimisticEntryId,
		type: "user",
		content,
		timestamp: new Date().toISOString(),
	};

	entries.push(optimisticEntry);
	pendingOptimisticUserEntryIds.push(optimisticEntryId);
	chat.renderEntry(optimisticEntry);

	window.parent?.postMessage(
		{ type: "session:send", content },
		getPostMessageTargetOrigin(),
	);
	sessionState.value = "sending";
	input.disable();
	input.showCancel();
}

/**
 * Request cancellation from parent shell.
 * Design intent for Green: post { type: "session:cancel" } to parent.
 * The shell injects sessionId before WebSocket send.
 */
export function cancelResponse() {
	window.parent?.postMessage(
		{ type: "session:cancel" },
		getPostMessageTargetOrigin(),
	);
}

/**
 * Get current session UI state.
 * @returns {SessionState}
 */
export function getSessionState() {
	return sessionState.value;
}

/**
 * Get current chat entries.
 * @returns {object[]}
 */
export function getEntries() {
	return entries;
}

/**
 * Internal module dependencies getter for tests.
 * @returns {{ chat: typeof chat; input: typeof input }}
 */
export function getDeps() {
	return { chat, input };
}
