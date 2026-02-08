import { initSidebar } from "./sidebar.js";
import {
	getIframe,
	getSessionIdBySource,
	initTabs,
	openTab,
	updateTabTitle,
} from "./tabs.js";

/**
 * Shell entry point.
 * Establishes WebSocket connection and initializes sidebar + tabs.
 */

/** @type {WebSocket | null} */
let ws = null;

/** @type {((msg: object) => void)[]} */
const messageHandlers = [];

const SESSION_SCOPED_TYPES = new Set([
	"session:history",
	"session:update",
	"session:chunk",
	"session:complete",
	"session:cancelled",
	"session:error",
]);

/**
 * Register a handler for incoming WebSocket messages.
 * @param {(msg: object) => void} handler
 */
export function onMessage(handler) {
	messageHandlers.push(handler);
}

/**
 * Send a message to the server via WebSocket.
 * @param {object} message - ClientMessage object
 */
export function sendMessage(message) {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
	} else {
		console.warn("[shell] WebSocket not connected, cannot send:", message);
	}
}

// ---- PostMessage relay (Story 5) ----
// Bridges WebSocket ↔ portlet iframes via postMessage.
// See tech design: postMessage Protocol section (lines 470-516)

/**
 * Set up the postMessage listener for portlet → shell communication.
 * Listens for window 'message' events from portlet iframes.
 * Validates origin, resolves sessionId from event.source, then:
 *
 * - session:send, session:cancel → injects sessionId, forwards to WebSocket
 * - portlet:ready → consumed locally (no WS forwarding; these are not valid ClientMessage types)
 * - portlet:title → consumed locally, calls updateTabTitle(sessionId, title)
 *
 * Called once during shell initialization, after tabs.init().
 *
 * @param {function} sendMessageFn - The WebSocket send function
 */
export function setupPortletRelay(sendMessageFn) {
	void sendMessageFn;
	void getSessionIdBySource;
	void updateTabTitle;
	throw new Error("Not implemented");
}

/**
 * Route a WebSocket message to the correct portlet iframe via postMessage.
 * Called from the WebSocket onmessage handler for session-scoped messages.
 *
 * Session-scoped message types that should be relayed (all carry sessionId):
 * - session:history, session:update, session:chunk, session:complete,
 *   session:cancelled, session:error
 *
 * NOTE: agent:status messages are NOT routed here — they carry cliType, not
 * sessionId, and require broadcast to ALL portlet iframes of that CLI type.
 * Story 6 owns the agent:status broadcast implementation.
 *
 * Uses tabs.getIframe(sessionId) to find the target iframe.
 * If no iframe exists for the sessionId, silently drops the message.
 *
 * @param {object} message - The parsed WebSocket message (has type, sessionId, etc.)
 */
export function routeToPortlet(message) {
	void message;
	void getIframe;
	throw new Error("Not implemented");
}

/**
 * Connect to the WebSocket server.
 */
function connect() {
	const protocol = location.protocol === "https:" ? "wss:" : "ws:";
	const url = `${protocol}//${location.host}/ws`;

	ws = new WebSocket(url);

	ws.addEventListener("open", () => {
		console.log("[shell] WebSocket connected");
	});

	ws.addEventListener("message", (event) => {
		let msg;
		try {
			msg = JSON.parse(event.data);
		} catch (err) {
			console.error("[shell] Failed to parse server message:", err);
			return;
		}

		try {
			messageHandlers.forEach((handler) => {
				handler(msg);
			});

			if (msg?.type === "session:created") {
				// Story 5: TODO — wire in Green
				openTab(
					msg.sessionId,
					msg.title || "New Session",
					msg.cliType || "claude-code",
				);
			}

			if (SESSION_SCOPED_TYPES.has(msg?.type)) {
				// Story 5: TODO — wire in Green
				routeToPortlet(msg);
			}
		} catch (err) {
			console.error("[shell] Failed to handle server message:", err);
		}
	});

	ws.addEventListener("close", () => {
		console.log("[shell] WebSocket disconnected");
		// Reconnection will be implemented in a later story
	});

	ws.addEventListener("error", (err) => {
		console.error("[shell] WebSocket error:", err);
	});
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
	connect();
	initSidebar(sendMessage, onMessage);
	initTabs();
});

void setupPortletRelay;
