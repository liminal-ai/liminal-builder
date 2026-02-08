/**
 * Portlet entry point stub.
 * Handles postMessage communication with the shell.
 * Will be implemented in Story 3.
 */

import * as chat from "./chat.js";
import * as input from "./input.js";

/** @typedef {"idle" | "sending" | "launching"} SessionState */
const MESSAGE_LISTENER_KEY = "__lbPortletMessageListener";

/** @type {object[]} */
const entries = [];

/** @type {{ value: SessionState }} */
const sessionState = { value: "idle" };

if (typeof window !== "undefined") {
	const previousListener = window[MESSAGE_LISTENER_KEY];
	if (typeof previousListener === "function") {
		window.removeEventListener("message", previousListener);
	}

	const messageListener = (event) => {
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
 * @param {object} _msg
 */
export function handleShellMessage(_msg) {
	// Dispatcher skeleton; concrete reconciliation will be implemented in Green.
	switch (_msg && typeof _msg === "object" && "type" in _msg ? _msg.type : "") {
		case "session:history":
		case "session:update":
		case "session:chunk":
		case "session:complete":
		case "session:cancelled":
		case "agent:status":
		case "session:error":
			break;
	}

	throw new Error("NotImplementedError");
}

/**
 * Handle agent lifecycle status updates.
 * @param {"starting" | "connected" | "disconnected" | "reconnecting"} _status
 */
export function handleAgentStatus(_status) {
	throw new Error("NotImplementedError");
}

/**
 * Send a user message to parent shell.
 * Design intent for Green: post { type: "session:send", content } to parent.
 * The shell injects sessionId before WebSocket send.
 *
 * @param {string} _content
 */
export function sendMessage(_content) {
	throw new Error("NotImplementedError");
}

/**
 * Request cancellation from parent shell.
 * Design intent for Green: post { type: "session:cancel" } to parent.
 * The shell injects sessionId before WebSocket send.
 */
export function cancelResponse() {
	throw new Error("NotImplementedError");
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
