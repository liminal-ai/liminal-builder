import { initSidebar } from "./sidebar.js";
import { initTabs } from "./tabs.js";

/**
 * Shell entry point.
 * Establishes WebSocket connection and initializes sidebar + tabs.
 */

/** @type {WebSocket | null} */
let ws = null;

/** @type {((msg: object) => void)[]} */
const messageHandlers = [];

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
		try {
			const msg = JSON.parse(event.data);
			messageHandlers.forEach((handler) => {
				handler(msg);
			});
		} catch (err) {
			console.error("[shell] Failed to parse server message:", err);
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
