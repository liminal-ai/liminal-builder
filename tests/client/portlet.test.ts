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

type UpsertPayload = {
	turnId: string;
	sessionId: string;
	itemId: string;
	sourceTimestamp: string;
	emittedAt: string;
	status: "create" | "update" | "complete" | "error";
	type: "message" | "thinking" | "tool_call";
	content?: string;
	origin?: "user" | "agent" | "system";
	callId?: string;
	toolName?: string;
	toolArguments?: Record<string, unknown>;
	toolOutput?: string;
	errorMessage?: string;
};

type ShellToPortletMessage =
	| { type: "session:history"; sessionId: string; entries: UpsertPayload[] }
	| { type: "session:upsert"; sessionId: string; payload: UpsertPayload }
	| {
			type: "session:turn";
			sessionId: string;
			payload:
				| {
						type: "turn_started";
						turnId: string;
						sessionId: string;
						modelId: string;
						providerId: string;
				  }
				| {
						type: "turn_complete";
						turnId: string;
						sessionId: string;
						status: "completed" | "cancelled";
				  }
				| {
						type: "turn_error";
						turnId: string;
						sessionId: string;
						errorCode: string;
						errorMessage: string;
				  };
	  }
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
			type: "session:upsert",
			sessionId: "claude-code:cancel-session",
			payload: {
				turnId: "turn-9",
				sessionId: "claude-code:cancel-session",
				itemId: "assistant-9",
				sourceTimestamp: "2026-02-08T10:04:00.000Z",
				emittedAt: "2026-02-08T10:04:00.000Z",
				status: "create",
				type: "message",
				content: "",
				origin: "agent",
			},
		});
		portlet.handleShellMessage({
			type: "session:upsert",
			sessionId: "claude-code:cancel-session",
			payload: {
				turnId: "turn-9",
				sessionId: "claude-code:cancel-session",
				itemId: "assistant-9",
				sourceTimestamp: "2026-02-08T10:04:01.000Z",
				emittedAt: "2026-02-08T10:04:01.000Z",
				status: "update",
				type: "message",
				content: "partial response",
				origin: "agent",
			},
		});
		portlet.handleShellMessage({
			type: "session:turn",
			sessionId: "claude-code:cancel-session",
			payload: {
				type: "turn_started",
				turnId: "turn-9",
				sessionId: "claude-code:cancel-session",
				modelId: "claude-code",
				providerId: "claude-code",
			},
		});
		portlet.handleShellMessage({
			type: "session:turn",
			sessionId: "claude-code:cancel-session",
			payload: {
				type: "turn_complete",
				turnId: "turn-9",
				sessionId: "claude-code:cancel-session",
				status: "cancelled",
			},
		});

		const messageInput = document.getElementById(
			"message-input",
		) as HTMLTextAreaElement;
		expect(chatContainer.textContent).toContain("partial response");
		expect(messageInput.disabled).toBe(false);
	});

	it("session history load scrolls viewport to bottom even if user was scrolled up", async () => {
		const portlet = await importPortlet();
		const chatContainer = getChatContainer();

		Object.defineProperty(chatContainer, "scrollHeight", {
			configurable: true,
			value: 500,
		});
		Object.defineProperty(chatContainer, "clientHeight", {
			configurable: true,
			value: 100,
		});

		chatContainer.scrollTop = 0;
		chatContainer.dispatchEvent(new Event("scroll"));

		portlet.handleShellMessage({
			type: "session:history",
			sessionId: "claude-code:history-1",
			entries: [
				{
					turnId: "history-1",
					sessionId: "claude-code:history-1",
					itemId: "u-1",
					type: "message",
					status: "complete",
					origin: "user",
					content: "hello",
					sourceTimestamp: "2026-02-15T10:00:00.000Z",
					emittedAt: "2026-02-15T10:00:00.000Z",
				},
				{
					turnId: "history-1",
					sessionId: "claude-code:history-1",
					itemId: "a-1",
					type: "message",
					status: "complete",
					origin: "agent",
					content: "hi there",
					sourceTimestamp: "2026-02-15T10:00:01.000Z",
					emittedAt: "2026-02-15T10:00:01.000Z",
				},
			],
		});

		expect(chatContainer.scrollTop).toBe(500);
	});
});
