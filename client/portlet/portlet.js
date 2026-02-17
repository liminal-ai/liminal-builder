/**
 * Portlet entry point.
 * Handles postMessage communication with the shell and local UI state.
 */

import * as chat from "./chat.js";
import * as input from "./input.js";

/** @typedef {"idle" | "sending" | "launching"} SessionState */
const MESSAGE_LISTENER_KEY = "__lbPortletMessageListener";
const EXPECTED_ORIGIN_KEY = "__lbPortletExpectedOrigin";

/** @type {object[]} */
const entries = [];
/** @type {Map<string, object>} */
const upsertsByItemId = new Map();
/** @type {Map<string, string>} */
const entryIdByItemId = new Map();

/** @type {{ value: SessionState }} */
const sessionState = { value: "idle" };

/** @type {string[]} */
const pendingOptimisticUserEntryIds = [];

/** @type {boolean} */
let bootstrapped = false;
/** @type {"claude-code" | "codex" | "unknown"} */
let activeCliType = "unknown";
const MODEL_OPTIONS_BY_CLI = {
	"claude-code": [
		{ value: "claude-default", label: "Claude (default)" },
		{ value: "claude-sonnet", label: "Claude Sonnet" },
		{ value: "claude-opus", label: "Claude Opus" },
	],
	codex: [
		{ value: "codex-default", label: "Codex (default)" },
		{ value: "gpt-5-codex", label: "GPT-5 Codex" },
		{ value: "gpt-5", label: "GPT-5" },
	],
	unknown: [{ value: "default", label: "Model: default" }],
};
const THINKING_OPTIONS = [
	{ value: "adaptive", label: "Thinking: adaptive" },
	{ value: "low", label: "Thinking: low" },
	{ value: "medium", label: "Thinking: medium" },
	{ value: "high", label: "Thinking: high" },
];

function setSelectOptions(select, options, fallbackValue) {
	if (!(select instanceof HTMLSelectElement)) {
		return;
	}

	const previousValue = select.value;
	select.textContent = "";
	for (const option of options) {
		const element = document.createElement("option");
		element.value = option.value;
		element.textContent = option.label;
		select.appendChild(element);
	}

	const nextValue = options.some((option) => option.value === previousValue)
		? previousValue
		: fallbackValue;
	select.value = nextValue;
}

function inferCliTypeFromSessionId(sessionId) {
	if (typeof sessionId !== "string") {
		return "unknown";
	}
	if (sessionId.startsWith("claude-code:")) {
		return "claude-code";
	}
	if (sessionId.startsWith("codex:")) {
		return "codex";
	}
	return "unknown";
}

function updateComposerContext(cliType) {
	const resolvedCliType =
		cliType === "claude-code" || cliType === "codex" ? cliType : "unknown";
	activeCliType = resolvedCliType;

	const cliPill = document.getElementById("cli-pill");
	if (cliPill instanceof HTMLElement) {
		cliPill.dataset.cliType = resolvedCliType;
		if (resolvedCliType === "claude-code") {
			cliPill.textContent = "Claude Code";
		} else if (resolvedCliType === "codex") {
			cliPill.textContent = "Codex";
		} else {
			cliPill.textContent = "Session";
		}
	}

	const modelPicker = document.getElementById("model-picker");
	if (modelPicker instanceof HTMLSelectElement) {
		const modelOptions =
			MODEL_OPTIONS_BY_CLI[resolvedCliType] ?? MODEL_OPTIONS_BY_CLI.unknown;
		setSelectOptions(
			modelPicker,
			modelOptions,
			modelOptions[0]?.value ?? "default",
		);
	}

	const thinkingPicker = document.getElementById("thinking-picker");
	if (thinkingPicker instanceof HTMLSelectElement) {
		const thinkingOptions =
			resolvedCliType === "unknown"
				? [{ value: "default", label: "Thinking: default" }]
				: THINKING_OPTIONS;
		setSelectOptions(
			thinkingPicker,
			thinkingOptions,
			thinkingOptions[0]?.value ?? "default",
		);
	}
}

function hydrateComposerFromLocation() {
	if (typeof window === "undefined") {
		return;
	}
	const sessionId = new URL(window.location.href).searchParams.get("sessionId");
	updateComposerContext(inferCliTypeFromSessionId(sessionId));
}

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

	// Empty origin means locally dispatched (tests, file:// protocol, same-origin
	// iframe postMessage). In production, browsers always populate a real origin.
	if (origin.length === 0) {
		return true;
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
		showLoadingShimmer(chatContainer);
	}

	const inputBar = document.getElementById("input-bar");
	if (inputBar instanceof HTMLElement) {
		input.init(inputBar, sendMessage, cancelResponse);
	}

	hydrateComposerFromLocation();
	bootstrapped = true;
}

function showLoadingShimmer(container) {
	const existing = container.querySelector(".session-loading");
	if (existing) return;
	const shimmer = document.createElement("div");
	shimmer.className = "session-loading";
	shimmer.innerHTML =
		'<span class="session-loading-text">Session Loading\u2026</span>';
	container.appendChild(shimmer);
}

function removeLoadingShimmer() {
	const shimmer = document.querySelector(".session-loading");
	if (shimmer) shimmer.remove();
}

function replaceEntry(entryId, nextEntry) {
	const existingIndex = entries.findIndex((entry) => entry.entryId === entryId);
	if (existingIndex >= 0) {
		entries.splice(existingIndex, 1, nextEntry);
	} else {
		entries.push(nextEntry);
	}
}

function toToolStatus(status) {
	if (status === "complete") {
		return "complete";
	}
	if (status === "error") {
		return "error";
	}
	return "running";
}

function formatToolArguments(toolArguments) {
	if (
		!toolArguments ||
		typeof toolArguments !== "object" ||
		Array.isArray(toolArguments)
	) {
		return "";
	}
	const keys = Object.keys(toolArguments);
	if (keys.length === 0) {
		return "";
	}
	return ` ${JSON.stringify(toolArguments)}`;
}

function attachItemIdToEntryElement(entryId, itemId) {
	if (typeof entryId !== "string" || typeof itemId !== "string") {
		return;
	}
	const element = document.querySelector(`[data-entry-id="${entryId}"]`);
	if (element instanceof HTMLElement) {
		element.dataset.itemId = itemId;
	}
}

function mapUpsertToEntry(upsert) {
	if (!upsert || typeof upsert !== "object") {
		return null;
	}

	const entryId =
		entryIdByItemId.get(upsert.itemId) ?? `upsert-${upsert.itemId}`;
	entryIdByItemId.set(upsert.itemId, entryId);

	if (upsert.type === "message") {
		const origin = typeof upsert.origin === "string" ? upsert.origin : "agent";
		return {
			entryId,
			type: origin === "user" ? "user" : "assistant",
			content: typeof upsert.content === "string" ? upsert.content : "",
			timestamp:
				typeof upsert.sourceTimestamp === "string"
					? upsert.sourceTimestamp
					: new Date().toISOString(),
		};
	}

	if (upsert.type === "thinking") {
		return {
			entryId,
			type: "thinking",
			content: typeof upsert.content === "string" ? upsert.content : "",
		};
	}

	if (upsert.type === "tool_call") {
		const toolOutput =
			typeof upsert.toolOutput === "string"
				? upsert.toolOutput
				: typeof upsert.content === "string"
					? upsert.content
					: undefined;
		const errorText =
			typeof upsert.errorMessage === "string"
				? upsert.errorMessage
				: upsert.status === "error"
					? toolOutput
					: undefined;
		const toolName =
			typeof upsert.toolName === "string" && upsert.toolName.length > 0
				? upsert.toolName
				: typeof upsert.callId === "string" && upsert.callId.length > 0
					? upsert.callId
					: "Tool call";
		return {
			entryId,
			type: "tool-call",
			toolCallId:
				typeof upsert.callId === "string"
					? upsert.callId
					: `tool-${upsert.itemId}`,
			name: `${toolName}${formatToolArguments(upsert.toolArguments)}`,
			status: toToolStatus(upsert.status),
			result: upsert.status === "error" ? undefined : toolOutput,
			error: upsert.status === "error" ? errorText : undefined,
		};
	}

	return null;
}

function applyUpsert(upsert) {
	if (
		!upsert ||
		typeof upsert !== "object" ||
		typeof upsert.itemId !== "string"
	) {
		return;
	}

	upsertsByItemId.set(upsert.itemId, upsert);
	const nextEntry = mapUpsertToEntry(upsert);
	if (!nextEntry) {
		return;
	}

	replaceEntry(nextEntry.entryId, nextEntry);
	chat.renderEntry(nextEntry);
	attachItemIdToEntryElement(nextEntry.entryId, upsert.itemId);
	if (nextEntry.type === "assistant" && upsert.status === "complete") {
		chat.finalizeEntry(nextEntry.entryId);
	}
}

function isUpsertHistory(entriesValue) {
	return (
		Array.isArray(entriesValue) &&
		entriesValue.every(
			(entry) =>
				entry &&
				typeof entry === "object" &&
				typeof entry.itemId === "string" &&
				typeof entry.type === "string",
		)
	);
}

function applyUpsertHistory(historyEntries) {
	upsertsByItemId.clear();
	entryIdByItemId.clear();
	pendingOptimisticUserEntryIds.length = 0;
	const nextEntries = [];
	for (const upsert of historyEntries) {
		const normalizedStatus = upsert.status === "error" ? "error" : "complete";
		const normalizedUpsert = { ...upsert, status: normalizedStatus };
		upsertsByItemId.set(normalizedUpsert.itemId, normalizedUpsert);
		const mapped = mapUpsertToEntry(normalizedUpsert);
		if (mapped) {
			nextEntries.push(mapped);
		}
	}
	entries.splice(0, entries.length, ...nextEntries);
	chat.renderAll(entries);
	for (const [itemId, entryId] of entryIdByItemId.entries()) {
		attachItemIdToEntryElement(entryId, itemId);
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
			removeLoadingShimmer();
			updateComposerContext(inferCliTypeFromSessionId(msg.sessionId));
			if (!isUpsertHistory(msg.entries)) {
				break;
			}
			applyUpsertHistory(msg.entries);
			break;
		}

		case "session:upsert": {
			removeLoadingShimmer();
			updateComposerContext(inferCliTypeFromSessionId(msg.sessionId));
			applyUpsert(msg.payload);
			break;
		}

		case "session:turn": {
			updateComposerContext(inferCliTypeFromSessionId(msg.sessionId));
			if (msg.payload?.type === "turn_started") {
				input.disable();
				sessionState.value = "sending";
			}
			if (msg.payload?.type === "turn_complete") {
				input.enable();
				sessionState.value = "idle";
			}
			if (msg.payload?.type === "turn_error") {
				chat.showError(msg.payload.errorMessage || "Turn failed");
				input.enable();
				sessionState.value = "idle";
			}
			break;
		}

		case "agent:status":
			handleAgentStatus(msg.status);
			updateConnectionStatus(msg.status);
			break;

		case "session:error":
			updateComposerContext(inferCliTypeFromSessionId(msg.sessionId));
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
 * Update visual connection status indicator in the session header.
 * Placeholder for Story 6 Green implementation.
 *
 * @param {"starting" | "connected" | "disconnected" | "reconnecting"} status
 */
export function updateConnectionStatus(status) {
	let dot = document.querySelector(".connection-status");

	if (!dot) {
		dot = document.createElement("span");
		dot.className = "connection-status";

		const header =
			document.querySelector(".session-header") ||
			document.querySelector(".portlet-header") ||
			document.getElementById("agent-status");
		if (header) {
			header.prepend(dot);
		} else {
			document.body.prepend(dot);
		}
	}

	dot.classList.remove("connected", "disconnected", "reconnecting", "starting");
	dot.classList.add(status);

	const titles = {
		connected: "Agent connected",
		disconnected: "Agent disconnected",
		reconnecting: "Reconnecting to agent...",
		starting: "Starting agent...",
	};
	dot.title = titles[status] || status;

	const inputDisabled = status !== "connected";
	const inputBar = document.querySelector(
		".input-bar textarea, #message-input",
	);
	const sendBtn = document.querySelector(".send-button, #send-btn");

	if (
		inputBar instanceof HTMLTextAreaElement ||
		inputBar instanceof HTMLInputElement
	) {
		inputBar.disabled = inputDisabled;
	}
	if (sendBtn instanceof HTMLButtonElement) {
		sendBtn.disabled = inputDisabled;
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

	const optimisticEntryId = `optimistic-user-${crypto.randomUUID()}`;
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
	updateComposerContext(activeCliType);
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
 * Reset internal state. Used by tests to ensure isolation between runs.
 */
export function reset() {
	entries.length = 0;
	upsertsByItemId.clear();
	entryIdByItemId.clear();
	pendingOptimisticUserEntryIds.length = 0;
	sessionState.value = "idle";
	bootstrapped = false;
}

/**
 * Internal module dependencies getter for tests.
 * @returns {{ chat: typeof chat; input: typeof input }}
 */
export function getDeps() {
	return { chat, input };
}
