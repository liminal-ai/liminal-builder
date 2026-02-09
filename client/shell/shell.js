import { initSidebar } from "./sidebar.js";
import { initSidebarResizer } from "./sidebar-resizer.js";
import {
	getIframe,
	getSessionIdBySource,
	getTabOrder,
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
let wsState = "connecting";
let reconnectAttempt = 0;
let reconnectTimer = null;
/** @type {object[]} */
const wsSendQueue = [];

const WS_RECONNECT_BASE_MS = 500;
const WS_RECONNECT_MAX_MS = 5000;
const WS_RECONNECT_JITTER_MIN = 0.8;
const WS_RECONNECT_JITTER_MAX = 1.2;

/** @type {((msg: object) => void)[]} */
const messageHandlers = [];

const PORTLET_WS_TYPES = new Set(["session:send", "session:cancel"]);
const PORTLET_LOCAL_TYPES = new Set(["portlet:ready", "portlet:title"]);
const PORTLET_MESSAGE_TYPES = new Set([
	"session:history",
	"session:update",
	"session:chunk",
	"session:complete",
	"session:cancelled",
	"session:error",
]);
/** @type {((event: MessageEvent) => void) | null} */
let relayMessageHandler = null;
let shellEventListenersBound = false;

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
	wsSend(message);
}

function wsSend(message) {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
	} else {
		wsSendQueue.push(message);
	}
}

function flushQueuedMessages() {
	if (!(ws && ws.readyState === WebSocket.OPEN)) {
		return;
	}
	while (wsSendQueue.length > 0) {
		const next = wsSendQueue.shift();
		if (!next) {
			continue;
		}
		ws.send(JSON.stringify(next));
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
	if (relayMessageHandler) {
		window.removeEventListener("message", relayMessageHandler);
	}

	relayMessageHandler = (event) => {
		if (event.origin !== window.location.origin) {
			return;
		}

		const data = event.data;
		if (!data || typeof data.type !== "string") {
			return;
		}

		if (
			!PORTLET_WS_TYPES.has(data.type) &&
			!PORTLET_LOCAL_TYPES.has(data.type)
		) {
			return;
		}

		const sessionId = getSessionIdBySource(event.source);
		if (!sessionId) {
			return;
		}

		if (data.type === "portlet:ready") {
			return;
		}

		if (data.type === "portlet:title") {
			if (typeof data.title === "string") {
				updateTabTitle(sessionId, data.title);
			}
			return;
		}

		sendMessageFn({ ...data, sessionId });
	};

	window.addEventListener("message", relayMessageHandler);
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
	if (!message || typeof message.type !== "string") {
		return;
	}
	if (!PORTLET_MESSAGE_TYPES.has(message.type)) {
		return;
	}
	if (typeof message.sessionId !== "string" || message.sessionId.length === 0) {
		return;
	}

	const iframe = getIframe(message.sessionId);
	if (!iframe || !iframe.contentWindow) {
		return;
	}

	iframe.contentWindow.postMessage(message, window.location.origin);
}

/**
 * Broadcast a message to all open portlets.
 * Used for non-session-targeted messages such as agent:status.
 * @param {object} message
 */
export function broadcastToPortlets(message) {
	for (const sessionId of getTabOrder()) {
		const iframe = getIframe(sessionId);
		if (!iframe || !iframe.contentWindow) {
			continue;
		}
		iframe.contentWindow.postMessage(message, window.location.origin);
	}
}

function inferCliTypeFromSessionId(sessionId) {
	if (typeof sessionId !== "string") {
		return "claude-code";
	}
	return sessionId.startsWith("codex:") ? "codex" : "claude-code";
}

function handleServerMessage(msg) {
	messageHandlers.forEach((handler) => {
		handler(msg);
	});

	if (
		msg?.type === "session:created" &&
		typeof msg.sessionId === "string" &&
		msg.sessionId.length > 0
	) {
		openTab(
			msg.sessionId,
			msg.title || "New Session",
			msg.cliType || inferCliTypeFromSessionId(msg.sessionId),
		);
	}

	routeToPortlet(msg);
	if (msg?.type === "agent:status") {
		broadcastToPortlets(msg);
	}
}

function updateWSStatusUI(state) {
	const indicator = document.getElementById("ws-status");
	if (!indicator) {
		return;
	}
	indicator.dataset.state = state;
}

function requestSessionListsForExpandedProjects() {
	window.dispatchEvent(new CustomEvent("liminal:resync-sessions"));
}

function reopenRestoredTabs() {
	window.dispatchEvent(new CustomEvent("liminal:resync-open-tabs"));
}

function resyncState() {
	// project:list rehydrates the sidebar and project tree after reconnect/refresh.
	wsSend({ type: "project:list" });
	// Sidebar listens for this and requests session:list for expanded projects.
	requestSessionListsForExpandedProjects();
	// Shell listens for this and re-opens restored tabs by sending session:open.
	reopenRestoredTabs();
}

function scheduleReconnect() {
	if (reconnectTimer) {
		return;
	}

	const baseDelay = Math.min(
		WS_RECONNECT_BASE_MS * 2 ** reconnectAttempt,
		WS_RECONNECT_MAX_MS,
	);
	const jitterRange = WS_RECONNECT_JITTER_MAX - WS_RECONNECT_JITTER_MIN;
	const jitterFactor = WS_RECONNECT_JITTER_MIN + Math.random() * jitterRange;
	const delay = Math.min(
		Math.round(baseDelay * jitterFactor),
		WS_RECONNECT_MAX_MS,
	);

	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		reconnectAttempt += 1;
		connectWebSocket();
	}, delay);
}

/**
 * Connect to the WebSocket server.
 */
function connectWebSocket() {
	wsState = reconnectAttempt === 0 ? "connecting" : "reconnecting";
	updateWSStatusUI(wsState);

	const protocol = location.protocol === "https:" ? "wss:" : "ws:";
	const url = `${protocol}//${location.host}/ws`;

	ws = new WebSocket(url);

	ws.addEventListener("open", () => {
		console.log("[shell] WebSocket connected");
		wsState = "connected";
		reconnectAttempt = 0;
		updateWSStatusUI(wsState);
		flushQueuedMessages();
		resyncState();
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
			handleServerMessage(msg);
		} catch (err) {
			console.error("[shell] Failed to handle server message:", err);
		}
	});

	ws.addEventListener("close", () => {
		console.log("[shell] WebSocket disconnected");
		wsState = "disconnected";
		updateWSStatusUI(wsState);
		scheduleReconnect();
	});

	ws.addEventListener("error", (err) => {
		console.warn("[shell] WebSocket error:", err);
	});
}

function bindShellEventListeners() {
	if (shellEventListenersBound) {
		return;
	}
	shellEventListenersBound = true;

	window.addEventListener("liminal:reconnect", (event) => {
		const cliType = event.detail?.cliType;
		if (cliType !== "claude-code" && cliType !== "codex") {
			return;
		}
		wsSend({ type: "session:reconnect", cliType });
	});

	window.addEventListener("liminal:resync-open-tabs", () => {
		for (const sessionId of getTabOrder()) {
			wsSend({ type: "session:open", sessionId });
		}
	});
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
	initTabs();
	setupPortletRelay(sendMessage);
	initSidebarResizer();
	initSidebar(sendMessage, onMessage);
	bindShellEventListeners();
	connectWebSocket();
});
