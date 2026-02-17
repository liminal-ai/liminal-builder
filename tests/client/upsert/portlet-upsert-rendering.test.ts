// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PORTLET_MODULE_PATH = "../../../client/portlet/portlet.js";

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

async function importPortlet() {
	const moduleValue: unknown = await import(PORTLET_MODULE_PATH);
	return moduleValue as {
		handleShellMessage: (message: unknown) => void;
	};
}

function makeMessageUpsert(
	itemId: string,
	status: "create" | "update" | "complete",
	content: string,
) {
	return {
		type: "session:upsert",
		sessionId: "claude-code:session-render",
		payload: {
			turnId: "turn-1",
			sessionId: "claude-code:session-render",
			itemId,
			sourceTimestamp: "2026-02-17T00:00:00.000Z",
			emittedAt: "2026-02-17T00:00:00.000Z",
			status,
			type: "message",
			content,
		},
	};
}

describe("Portlet upsert rendering migration (Story 6, Red)", () => {
	beforeEach(() => {
		vi.resetModules();
		setupDOM();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("TC-7.2a: text upserts render progressively via in-place replace-by-itemId updates", async () => {
		const portlet = await importPortlet();

		portlet.handleShellMessage(makeMessageUpsert("msg-1", "create", "Hello"));
		portlet.handleShellMessage(
			makeMessageUpsert("msg-1", "update", "Hello world"),
		);
		portlet.handleShellMessage(
			makeMessageUpsert("msg-1", "complete", "Hello world!"),
		);

		const rendered = document.querySelector('[data-item-id="msg-1"]');
		expect(rendered).toBeTruthy();
		expect(rendered?.textContent).toContain("Hello world!");
	});

	it("TC-7.2b: tool-call invocation and completion status transition renders correctly", async () => {
		const portlet = await importPortlet();

		portlet.handleShellMessage({
			type: "session:upsert",
			sessionId: "claude-code:session-render",
			payload: {
				turnId: "turn-tool",
				sessionId: "claude-code:session-render",
				itemId: "tool-1",
				sourceTimestamp: "2026-02-17T00:00:00.000Z",
				emittedAt: "2026-02-17T00:00:00.000Z",
				status: "create",
				type: "tool_call",
				callId: "read_file",
				content: "running",
			},
		});
		portlet.handleShellMessage({
			type: "session:upsert",
			sessionId: "claude-code:session-render",
			payload: {
				turnId: "turn-tool",
				sessionId: "claude-code:session-render",
				itemId: "tool-1",
				sourceTimestamp: "2026-02-17T00:00:01.000Z",
				emittedAt: "2026-02-17T00:00:01.000Z",
				status: "complete",
				type: "tool_call",
				callId: "read_file",
				content: "done",
			},
		});

		const rendered = document.querySelector('[data-item-id="tool-1"]');
		expect(rendered).toBeTruthy();
		expect(rendered?.textContent?.toLowerCase()).toContain("done");
	});

	it("TC-7.2c: interleaved item upserts render independently without cross-item overwrite", async () => {
		const portlet = await importPortlet();

		portlet.handleShellMessage(makeMessageUpsert("msg-a", "create", "A1"));
		portlet.handleShellMessage(makeMessageUpsert("msg-b", "create", "B1"));
		portlet.handleShellMessage(makeMessageUpsert("msg-a", "update", "A2"));
		portlet.handleShellMessage(makeMessageUpsert("msg-b", "update", "B2"));

		const itemA = document.querySelector('[data-item-id="msg-a"]');
		const itemB = document.querySelector('[data-item-id="msg-b"]');
		expect(itemA?.textContent).toContain("A2");
		expect(itemB?.textContent).toContain("B2");
	});
});
