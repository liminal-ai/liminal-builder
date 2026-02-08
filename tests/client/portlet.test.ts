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

type ShellToPortletMessage =
	| { type: "session:history"; entries: ChatEntry[] }
	| { type: "session:update"; entry: ChatEntry }
	| { type: "session:chunk"; entryId: string; content: string }
	| { type: "session:complete"; entryId: string }
	| { type: "session:cancelled"; entryId: string }
	| {
			type: "agent:status";
			status: "starting" | "connected" | "disconnected" | "reconnecting";
	  }
	| { type: "session:error"; message: string };

type PortletModule = {
	handleShellMessage: (msg: ShellToPortletMessage) => void;
	handleAgentStatus: (
		status: "starting" | "connected" | "disconnected" | "reconnecting",
	) => void;
	sendMessage: (content: string) => void;
	cancelResponse: () => void;
	getSessionState: () => "idle" | "sending" | "launching";
	getEntries: () => ChatEntry[];
};

const PORTLET_MODULE_PATH = "../../client/portlet/portlet.js";

function setupDOM() {
	document.body.innerHTML = `
		<div id="portlet-root">
			<div id="agent-status"></div>
			<div id="chat-container"></div>
			<button id="scroll-to-bottom" style="display: none;">Scroll to bottom</button>
			<div id="input-bar">
				<textarea id="message-input"></textarea>
				<button id="send-btn">Send</button>
				<button id="cancel-btn" style="display: none;">Cancel</button>
				<div id="working-indicator" style="display: none;">Working...</div>
			</div>
		</div>
	`;
}

function getChatContainer(): HTMLElement {
	const element = document.getElementById("chat-container");
	if (!(element instanceof HTMLElement)) {
		throw new Error("Missing #chat-container");
	}

	return element;
}

function getAgentStatus(): HTMLElement {
	const element = document.getElementById("agent-status");
	if (!(element instanceof HTMLElement)) {
		throw new Error("Missing #agent-status");
	}

	return element;
}

async function importPortlet(): Promise<PortletModule> {
	const moduleValue: unknown = await import(PORTLET_MODULE_PATH);
	return moduleValue as PortletModule;
}

describe("Portlet Chat Session", () => {
	beforeEach(() => {
		vi.resetModules();
		setupDOM();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("TC-3.1a: sent message appears immediately", async () => {
		const portlet = await importPortlet();
		const chatContainer = getChatContainer();

		portlet.sendMessage("Hello from user");

		expect(chatContainer.textContent).toContain("Hello from user");
	});

	it("TC-5.4a: launching indicator shown on agent starting", async () => {
		await importPortlet();
		const status = getAgentStatus();

		window.dispatchEvent(
			new MessageEvent("message", {
				data: { type: "agent:status", status: "starting" },
			}),
		);

		expect(status.textContent?.toLowerCase()).toContain("launching");
	});

	it("TC-3.7b: cancel stops response and re-enables input", async () => {
		const portlet = await importPortlet();
		const chatContainer = getChatContainer();

		portlet.handleShellMessage({
			type: "session:update",
			entry: {
				entryId: "assistant-9",
				type: "assistant",
				content: "",
				timestamp: "2026-02-08T10:04:00.000Z",
			},
		});
		portlet.handleShellMessage({
			type: "session:chunk",
			entryId: "assistant-9",
			content: "partial response",
		});
		portlet.handleShellMessage({
			type: "session:cancelled",
			entryId: "assistant-9",
		});

		const messageInput = document.getElementById(
			"message-input",
		) as HTMLTextAreaElement;
		expect(chatContainer.textContent).toContain("partial response");
		expect(messageInput.disabled).toBe(false);
	});
});
