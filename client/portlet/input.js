/**
 * Input bar module.
 * Manages text input, send action, disabled state.
 */

/** @type {HTMLElement | null} */
let inputContainer = null;

/** @type {HTMLTextAreaElement | null} */
let messageInput = null;

/** @type {HTMLButtonElement | null} */
let sendBtn = null;

/** @type {HTMLButtonElement | null} */
let cancelBtn = null;

/** @type {HTMLElement | null} */
let workingIndicator = null;

/** @type {(content: string) => void} */
let onSendHandler = () => {};

/** @type {() => void} */
let onCancelHandler = () => {};
/** @type {boolean} */
let sendButtonCancelMode = false;

const DEFAULT_MIN_ROWS = 3;
const MAX_INPUT_LINES = 13;
const FALLBACK_LINE_HEIGHT = 21;

/**
 * @param {number} value
 * @returns {boolean}
 */
function isFinitePositive(value) {
	return Number.isFinite(value) && value > 0;
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @returns {number}
 */
function getLineHeight(textarea) {
	const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight);
	return isFinitePositive(lineHeight) ? lineHeight : FALLBACK_LINE_HEIGHT;
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {number} lineHeight
 * @returns {number}
 */
function getMinHeight(textarea, lineHeight) {
	const rowsAttr = Number.parseInt(textarea.getAttribute("rows") ?? "", 10);
	const rows =
		Number.isFinite(rowsAttr) && rowsAttr > 0 ? rowsAttr : DEFAULT_MIN_ROWS;
	const rowsHeight = Math.ceil(rows * lineHeight);
	const cssMinHeight = Number.parseFloat(getComputedStyle(textarea).minHeight);
	return isFinitePositive(cssMinHeight)
		? Math.max(rowsHeight, cssMinHeight)
		: rowsHeight;
}

/**
 * @param {HTMLTextAreaElement} textarea
 * @param {number} lineHeight
 * @returns {number}
 */
function getMaxHeight(textarea, lineHeight) {
	const linesCapHeight = Math.ceil(MAX_INPUT_LINES * lineHeight);
	const cssMaxHeight = Number.parseFloat(getComputedStyle(textarea).maxHeight);
	return isFinitePositive(cssMaxHeight)
		? Math.min(linesCapHeight, cssMaxHeight)
		: linesCapHeight;
}

function resizeMessageInput() {
	if (!messageInput) {
		return;
	}

	const lineHeight = getLineHeight(messageInput);
	const minHeight = getMinHeight(messageInput, lineHeight);
	const maxHeight = getMaxHeight(messageInput, lineHeight);

	messageInput.style.height = "auto";
	const nextHeight = Math.min(
		maxHeight,
		Math.max(minHeight, messageInput.scrollHeight),
	);
	messageInput.style.height = `${nextHeight}px`;
	messageInput.style.overflowY =
		messageInput.scrollHeight > nextHeight ? "auto" : "hidden";
}

function submitCurrentMessage() {
	if (!messageInput || messageInput.disabled) {
		return;
	}

	const value = messageInput.value.trim();
	if (value.length === 0) {
		updateSendButtonState();
		return;
	}

	onSendHandler(getValue());
	clear();
}

/**
 * @param {"send" | "cancel"} mode
 */
function setSendButtonMode(mode) {
	if (!sendBtn) {
		return;
	}

	sendButtonCancelMode = mode === "cancel";
	sendBtn.dataset.mode = mode;
	sendBtn.setAttribute(
		"aria-label",
		sendButtonCancelMode ? "Cancel response" : "Send message",
	);
}

function updateSendButtonState() {
	if (!sendBtn || !messageInput) {
		return;
	}

	if (sendButtonCancelMode) {
		sendBtn.disabled = false;
		return;
	}

	const hasText = messageInput.value.trim().length > 0;
	sendBtn.disabled = messageInput.disabled || !hasText;
}

/**
 * Initialize the input bar.
 * @param {HTMLElement} container
 * @param {(content: string) => void} onSend
 * @param {() => void} onCancel
 */
export function init(container, onSend, onCancel) {
	inputContainer = container;
	messageInput =
		container.querySelector("#message-input") ??
		document.getElementById("message-input");
	sendBtn =
		container.querySelector("#send-btn") ?? document.getElementById("send-btn");
	cancelBtn =
		container.querySelector("#cancel-btn") ??
		document.getElementById("cancel-btn");
	workingIndicator =
		container.querySelector("#working-indicator") ??
		document.getElementById("working-indicator");
	onSendHandler = onSend;
	onCancelHandler = onCancel;

	sendBtn?.addEventListener("click", () => {
		if (sendButtonCancelMode) {
			onCancelHandler();
			return;
		}
		submitCurrentMessage();
	});

	cancelBtn?.addEventListener("click", () => {
		onCancelHandler();
	});

	messageInput?.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" || event.shiftKey) {
			return;
		}

		event.preventDefault();
		submitCurrentMessage();
	});

	messageInput?.addEventListener("input", () => {
		resizeMessageInput();
		updateSendButtonState();
	});

	hideWorking();
	hideCancel();
	setSendButtonMode("send");
	if (sendBtn) {
		sendBtn.disabled = false;
	}
	resizeMessageInput();
	updateSendButtonState();
}

/**
 * Backward-compatible initializer alias.
 * @param {(content: string) => void} onSend
 */
export function initInput(onSend) {
	const container = document.getElementById("input-bar");
	if (!(container instanceof HTMLElement)) {
		return;
	}
	init(container, onSend, () => {});
}

/**
 * Enable input controls.
 */
export function enable() {
	if (!messageInput || !sendBtn) {
		return;
	}

	setSendButtonMode("send");
	messageInput.disabled = false;
	updateSendButtonState();
	hideWorking();
	hideCancel();
}

/**
 * Disable input controls.
 */
export function disable() {
	if (!messageInput || !sendBtn) {
		return;
	}

	messageInput.disabled = true;
	if (!sendButtonCancelMode) {
		sendBtn.disabled = true;
	}
	showWorking();
}

/**
 * Show working indicator.
 */
export function showWorking() {
	if (!workingIndicator) {
		return;
	}

	workingIndicator.hidden = false;
	workingIndicator.style.display = "block";
}

/**
 * Hide working indicator.
 */
export function hideWorking() {
	if (!workingIndicator) {
		return;
	}

	workingIndicator.hidden = true;
	workingIndicator.style.display = "none";
}

/**
 * Show cancel control.
 */
export function showCancel() {
	setSendButtonMode("cancel");
	if (sendBtn) {
		sendBtn.disabled = false;
	}
	if (cancelBtn) {
		cancelBtn.hidden = true;
		cancelBtn.style.display = "none";
	}
}

/**
 * Hide cancel control.
 */
export function hideCancel() {
	setSendButtonMode("send");
	if (cancelBtn) {
		cancelBtn.hidden = true;
		cancelBtn.style.display = "none";
	}
	updateSendButtonState();
}

/**
 * Get current input value.
 * @returns {string}
 */
export function getValue() {
	return messageInput?.value ?? "";
}

/**
 * Clear input value.
 */
export function clear() {
	if (!messageInput) {
		return;
	}

	messageInput.value = "";
	resizeMessageInput();
	updateSendButtonState();
}

/**
 * Internal references getter for tests.
 * @returns {{
 *   inputContainer: HTMLElement | null;
 *   messageInput: HTMLTextAreaElement | null;
 *   sendBtn: HTMLButtonElement | null;
 *   cancelBtn: HTMLButtonElement | null;
 *   workingIndicator: HTMLElement | null;
 * }}
 */
export function getInputRefs() {
	return {
		inputContainer,
		messageInput,
		sendBtn,
		cancelBtn,
		workingIndicator,
	};
}
