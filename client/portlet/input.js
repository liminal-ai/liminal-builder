/**
 * Input bar stub.
 * Manages text input, send action, disabled state.
 * Will be implemented in Story 3.
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

function updateSendButtonState() {
	if (!sendBtn || !messageInput) {
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
	});

	cancelBtn?.addEventListener("click", () => {
		onCancelHandler();
	});

	messageInput?.addEventListener("input", () => {
		updateSendButtonState();
	});

	hideWorking();
	hideCancel();
	if (sendBtn) {
		sendBtn.disabled = false;
	}
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
	sendBtn.disabled = true;
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
	if (!cancelBtn) {
		return;
	}

	cancelBtn.hidden = false;
	cancelBtn.style.display = "block";
}

/**
 * Hide cancel control.
 */
export function hideCancel() {
	if (!cancelBtn) {
		return;
	}

	cancelBtn.hidden = true;
	cancelBtn.style.display = "none";
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
