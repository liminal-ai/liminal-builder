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

/**
 * Initialize the input bar.
 * @param {HTMLElement} _container
 * @param {(content: string) => void} _onSend
 * @param {() => void} _onCancel
 */
export function init(_container, _onSend, _onCancel) {
	inputContainer = _container;
	messageInput = document.getElementById("message-input");
	sendBtn = document.getElementById("send-btn");
	cancelBtn = document.getElementById("cancel-btn");
	workingIndicator = document.getElementById("working-indicator");
	throw new Error("NotImplementedError");
}

/**
 * Backward-compatible initializer alias.
 * @param {(content: string) => void} _onSend
 */
export function initInput(_onSend) {
	throw new Error("NotImplementedError");
}

/**
 * Enable input controls.
 */
export function enable() {
	throw new Error("NotImplementedError");
}

/**
 * Disable input controls.
 */
export function disable() {
	throw new Error("NotImplementedError");
}

/**
 * Show working indicator.
 */
export function showWorking() {
	throw new Error("NotImplementedError");
}

/**
 * Hide working indicator.
 */
export function hideWorking() {
	throw new Error("NotImplementedError");
}

/**
 * Show cancel control.
 */
export function showCancel() {
	throw new Error("NotImplementedError");
}

/**
 * Hide cancel control.
 */
export function hideCancel() {
	throw new Error("NotImplementedError");
}

/**
 * Get current input value.
 * @returns {string}
 */
export function getValue() {
	throw new Error("NotImplementedError");
}

/**
 * Clear input value.
 */
export function clear() {
	throw new Error("NotImplementedError");
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
