// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type InputModule = {
	init: (
		container: HTMLElement,
		onSend: (content: string) => void,
		onCancel: () => void,
	) => void;
	initInput: (onSend: (content: string) => void) => void;
	enable: () => void;
	disable: () => void;
	showWorking: () => void;
	hideWorking: () => void;
	showCancel: () => void;
	hideCancel: () => void;
	getValue: () => string;
	clear: () => void;
};

const INPUT_MODULE_PATH = "../../client/portlet/input.js";

function setupDOM() {
	document.body.innerHTML = `
		<div id="input-bar">
			<textarea id="message-input" placeholder="Send a message..."></textarea>
			<button id="send-btn">Send</button>
			<button id="cancel-btn" style="display: none;">Cancel</button>
			<div id="working-indicator" style="display: none;">Working...</div>
		</div>
	`;
}

function getInputBar(): HTMLElement {
	const element = document.getElementById("input-bar");
	if (!(element instanceof HTMLElement)) {
		throw new Error("Missing #input-bar");
	}

	return element;
}

function getMessageInput(): HTMLTextAreaElement {
	const element = document.getElementById("message-input");
	if (!(element instanceof HTMLTextAreaElement)) {
		throw new Error("Missing #message-input");
	}

	return element;
}

function getSendButton(): HTMLButtonElement {
	const element = document.getElementById("send-btn");
	if (!(element instanceof HTMLButtonElement)) {
		throw new Error("Missing #send-btn");
	}

	return element;
}

function getCancelButton(): HTMLButtonElement {
	const element = document.getElementById("cancel-btn");
	if (!(element instanceof HTMLButtonElement)) {
		throw new Error("Missing #cancel-btn");
	}

	return element;
}

function getWorkingIndicator(): HTMLElement {
	const element = document.getElementById("working-indicator");
	if (!(element instanceof HTMLElement)) {
		throw new Error("Missing #working-indicator");
	}

	return element;
}

function setScrollHeight(element: HTMLTextAreaElement, value: number): void {
	Object.defineProperty(element, "scrollHeight", {
		configurable: true,
		get: () => value,
	});
}

async function importInput(): Promise<InputModule> {
	const moduleValue: unknown = await import(INPUT_MODULE_PATH);
	return moduleValue as InputModule;
}

describe("Portlet Input UI", () => {
	beforeEach(() => {
		vi.resetModules();
		setupDOM();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("TC-3.1b: empty message cannot be sent", async () => {
		const input = await importInput();
		const container = getInputBar();
		const onSend = vi.fn<(content: string) => void>();
		const onCancel = vi.fn<() => void>();

		input.init(container, onSend, onCancel);

		const messageInput = getMessageInput();
		const sendBtn = getSendButton();
		messageInput.value = "";
		messageInput.dispatchEvent(new Event("input", { bubbles: true }));

		expect(sendBtn.disabled).toBe(true);
	});

	it("TC-3.5a: input bar visible and functional", async () => {
		const input = await importInput();
		const container = getInputBar();
		const onSend = vi.fn<(content: string) => void>();
		const onCancel = vi.fn<() => void>();

		input.init(container, onSend, onCancel);

		const messageInput = getMessageInput();
		const sendBtn = getSendButton();
		expect(messageInput).not.toBeNull();
		expect(sendBtn).not.toBeNull();

		messageInput.value = "Run tests";
		messageInput.dispatchEvent(new Event("input", { bubbles: true }));
		sendBtn.click();
		expect(onSend).toHaveBeenCalledWith("Run tests");
	});

	it("Enter submits message", async () => {
		const input = await importInput();
		const container = getInputBar();
		const onSend = vi.fn<(content: string) => void>();
		const onCancel = vi.fn<() => void>();
		input.init(container, onSend, onCancel);

		const messageInput = getMessageInput();
		messageInput.value = "Submit from keyboard";
		const event = new KeyboardEvent("keydown", {
			key: "Enter",
			bubbles: true,
			cancelable: true,
		});
		const notCancelled = messageInput.dispatchEvent(event);

		expect(notCancelled).toBe(false);
		expect(onSend).toHaveBeenCalledWith("Submit from keyboard");
		expect(messageInput.value).toBe("");
	});

	it("Shift+Enter does not submit message", async () => {
		const input = await importInput();
		const container = getInputBar();
		const onSend = vi.fn<(content: string) => void>();
		const onCancel = vi.fn<() => void>();
		input.init(container, onSend, onCancel);

		const messageInput = getMessageInput();
		messageInput.value = "Keep editing";
		const event = new KeyboardEvent("keydown", {
			key: "Enter",
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		});
		const notCancelled = messageInput.dispatchEvent(event);

		expect(notCancelled).toBe(true);
		expect(onSend).not.toHaveBeenCalled();
		expect(messageInput.value).toBe("Keep editing");
	});

	it("textarea grows with content up to max height", async () => {
		const input = await importInput();
		const container = getInputBar();
		input.init(
			container,
			() => {},
			() => {},
		);

		const messageInput = getMessageInput();
		setScrollHeight(messageInput, 220);
		messageInput.value = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
		messageInput.dispatchEvent(new Event("input", { bubbles: true }));

		expect(Number.parseFloat(messageInput.style.height)).toBeGreaterThan(200);
		expect(messageInput.style.overflowY).toBe("hidden");
	});

	it("textarea caps at max height and enables internal scrolling", async () => {
		const input = await importInput();
		const container = getInputBar();
		input.init(
			container,
			() => {},
			() => {},
		);

		const messageInput = getMessageInput();
		setScrollHeight(messageInput, 1000);
		messageInput.value = "A very long message";
		messageInput.dispatchEvent(new Event("input", { bubbles: true }));

		const height = Number.parseFloat(messageInput.style.height);
		expect(height).toBeGreaterThan(250);
		expect(height).toBeLessThanOrEqual(280);
		expect(messageInput.style.overflowY).toBe("auto");
	});

	it("TC-3.5b: input disabled during agent response", async () => {
		const input = await importInput();
		const container = getInputBar();

		input.init(
			container,
			() => {},
			() => {},
		);
		input.disable();
		input.showWorking();

		const sendBtn = getSendButton();
		const working = getWorkingIndicator();
		expect(sendBtn.disabled).toBe(true);
		expect(working.style.display).not.toBe("none");
	});

	it("TC-3.7a: cancel action visible during response", async () => {
		const input = await importInput();
		const container = getInputBar();

		const onCancel = vi.fn<() => void>();
		input.init(
			container,
			() => {},
			onCancel,
		);
		input.showCancel();

		const sendBtn = getSendButton();
		expect(sendBtn.dataset.mode).toBe("cancel");
		expect(sendBtn.disabled).toBe(false);
		sendBtn.click();
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("TC-3.7c: cancel not visible when idle", async () => {
		const input = await importInput();
		const container = getInputBar();

		input.init(
			container,
			() => {},
			() => {},
		);
		input.hideCancel();

		const sendBtn = getSendButton();
		expect(sendBtn.dataset.mode).toBe("send");
	});

	it("legacy cancel button remains hidden when showing cancel mode", async () => {
		const input = await importInput();
		const container = getInputBar();
		input.init(
			container,
			() => {},
			() => {},
		);
		input.showCancel();

		const cancelBtn = getCancelButton();
		expect(cancelBtn.style.display === "none" || cancelBtn.hidden).toBe(true);
	});
});
