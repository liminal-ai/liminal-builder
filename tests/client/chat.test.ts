// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ChatEntry =
	| { entryId: string; type: "user"; content: string; timestamp: string }
	| { entryId: string; type: "assistant"; content: string; timestamp: string }
	| { entryId: string; type: "thinking"; content: string }
	| {
			entryId: string;
			type: "tool-call";
			toolCallId: string;
			name: string;
			status: "running" | "complete" | "error";
			result?: string;
			error?: string;
	  };

type ChatModule = {
	init: (container: HTMLElement) => void;
	renderAll: (entries: ChatEntry[]) => void;
	renderEntry: (entry: ChatEntry) => void;
	updateEntryContent: (entryId: string, content: string) => void;
	finalizeEntry: (entryId: string) => void;
	showError: (message: string) => void;
};

const CHAT_MODULE_PATH = "../../client/portlet/chat.js";

function setupDOM() {
	document.body.innerHTML = `
		<div id="chat-container"></div>
		<button id="scroll-to-bottom" style="display: none;">Scroll to bottom</button>
	`;
}

function getChatContainer(): HTMLElement {
	const element = document.getElementById("chat-container");
	if (!(element instanceof HTMLElement)) {
		throw new Error("Missing #chat-container");
	}

	return element;
}

function getScrollButton(): HTMLButtonElement {
	const element = document.getElementById("scroll-to-bottom");
	if (!(element instanceof HTMLButtonElement)) {
		throw new Error("Missing #scroll-to-bottom");
	}

	return element;
}

async function importChat(): Promise<ChatModule> {
	const moduleValue: unknown = await import(CHAT_MODULE_PATH);
	return moduleValue as ChatModule;
}

function setScrollMetrics(
	element: HTMLElement,
	metrics: { scrollHeight: number; clientHeight: number; scrollTop: number },
) {
	Object.defineProperty(element, "scrollHeight", {
		configurable: true,
		get: () => metrics.scrollHeight,
	});

	Object.defineProperty(element, "clientHeight", {
		configurable: true,
		get: () => metrics.clientHeight,
	});

	Object.defineProperty(element, "scrollTop", {
		configurable: true,
		get: () => metrics.scrollTop,
		set: (value: number) => {
			metrics.scrollTop = value;
		},
	});
}

describe("Portlet Chat UI", () => {
	beforeEach(() => {
		vi.resetModules();
		setupDOM();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("TC-3.2a: streaming renders incrementally", async () => {
		const chat = await importChat();
		const container = getChatContainer();

		chat.init(container);
		chat.renderEntry({
			entryId: "assistant-1",
			type: "assistant",
			content: "",
			timestamp: "2026-02-08T10:00:00.000Z",
		});

		chat.updateEntryContent("assistant-1", "Hel");
		expect(container.textContent).toContain("Hel");

		chat.updateEntryContent("assistant-1", "Hello");
		expect(container.textContent).toContain("Hello");

		chat.updateEntryContent("assistant-1", "Hello world");
		expect(container.textContent).toContain("Hello world");
	});

	it("TC-3.2b: markdown rendered on complete", async () => {
		const chat = await importChat();
		const container = getChatContainer();

		chat.init(container);
		chat.renderEntry({
			entryId: "assistant-2",
			type: "assistant",
			content: "# Heading\\n\\n`code`",
			timestamp: "2026-02-08T10:01:00.000Z",
		});
		chat.finalizeEntry("assistant-2");

		expect(container.querySelector("h1")).not.toBeNull();
		expect(container.querySelector("code")).not.toBeNull();
	});

	it("history assistant entries render markdown immediately", async () => {
		const chat = await importChat();
		const container = getChatContainer();

		chat.init(container);
		chat.renderAll([
			{
				entryId: "assistant-history-1",
				type: "assistant",
				content: "# History heading\\n\\n`snippet`",
				timestamp: "2026-02-09T00:00:00.000Z",
			},
		]);

		expect(container.querySelector("h1")).not.toBeNull();
		expect(container.querySelector("code")).not.toBeNull();
	});

	it("TC-3.3a: tool call shows name and running indicator", async () => {
		const chat = await importChat();
		const container = getChatContainer();

		chat.init(container);
		chat.renderEntry({
			entryId: "tool-1",
			type: "tool-call",
			toolCallId: "tc-1",
			name: "read_file",
			status: "running",
		});

		expect(container.textContent).toContain("read_file");
		expect(container.textContent?.toLowerCase()).toContain("running");
	});

	it("TC-3.3b: tool call shows result collapsed on completion", async () => {
		const chat = await importChat();
		const container = getChatContainer();

		chat.init(container);
		chat.renderEntry({
			entryId: "tool-2",
			type: "tool-call",
			toolCallId: "tc-2",
			name: "grep",
			status: "complete",
			result: "Found 3 matches",
		});

		const toolResultDetails = container.querySelector("details");
		expect(toolResultDetails).not.toBeNull();
		expect((toolResultDetails as HTMLDetailsElement).open).toBe(false);
		expect(toolResultDetails?.textContent).toContain("grep");
		expect(toolResultDetails?.textContent?.toLowerCase()).toMatch(
			/done|complete/,
		);
	});

	it("TC-3.3c: tool call shows error on failure", async () => {
		const chat = await importChat();
		const container = getChatContainer();

		chat.init(container);
		chat.renderEntry({
			entryId: "tool-3",
			type: "tool-call",
			toolCallId: "tc-3",
			name: "write_file",
			status: "error",
			error: "Permission denied",
		});

		expect(container.textContent).toContain("Permission denied");
		expect(container.textContent?.toLowerCase()).toContain("error");
	});

	it("TC-3.4a: thinking blocks have distinct styling", async () => {
		const chat = await importChat();
		const container = getChatContainer();

		chat.init(container);
		chat.renderEntry({
			entryId: "thinking-1",
			type: "thinking",
			content: "Reasoning about next step...",
		});

		const thinkingBlock = container.querySelector(".thinking-block");
		expect(thinkingBlock).not.toBeNull();
		expect(
			thinkingBlock?.querySelector("summary")?.textContent?.toLowerCase(),
		).toContain("thinking");
	});

	it("TC-3.6a: auto-scroll during response", async () => {
		const chat = await importChat();
		const container = getChatContainer();
		setScrollMetrics(container, {
			scrollHeight: 1000,
			clientHeight: 400,
			scrollTop: 200,
		});

		chat.init(container);
		chat.renderEntry({
			entryId: "assistant-3",
			type: "assistant",
			content: "",
			timestamp: "2026-02-08T10:02:00.000Z",
		});
		chat.updateEntryContent("assistant-3", "streaming chunk");

		expect(container.scrollTop).toBe(container.scrollHeight);
	});

	it("TC-3.6b: auto-scroll pauses on user scroll up", async () => {
		const chat = await importChat();
		const container = getChatContainer();
		const scrollButton = getScrollButton();
		setScrollMetrics(container, {
			scrollHeight: 1200,
			clientHeight: 400,
			scrollTop: 100,
		});

		chat.init(container);
		container.dispatchEvent(new Event("scroll"));
		const beforeUpdate = container.scrollTop;

		chat.renderEntry({
			entryId: "assistant-4",
			type: "assistant",
			content: "",
			timestamp: "2026-02-08T10:03:00.000Z",
		});
		chat.updateEntryContent("assistant-4", "next chunk");

		expect(container.scrollTop).toBe(beforeUpdate);
		expect(scrollButton.style.display).toBe("block");
	});

	it("TC-3.6c: scroll-to-bottom resumes auto-scroll", async () => {
		const chat = await importChat();
		const container = getChatContainer();
		const scrollButton = getScrollButton();
		setScrollMetrics(container, {
			scrollHeight: 1400,
			clientHeight: 400,
			scrollTop: 120,
		});

		chat.init(container);
		container.dispatchEvent(new Event("scroll"));
		scrollButton.click();

		expect(container.scrollTop).toBe(container.scrollHeight);
		expect(scrollButton.style.display).toBe("none");
	});
});
