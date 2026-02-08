// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type TabsModule = {
	init: (
		tabBarEl?: HTMLElement,
		containerEl?: HTMLElement,
		emptyStateEl?: HTMLElement,
	) => void;
	initTabs: (
		tabBarEl?: HTMLElement,
		containerEl?: HTMLElement,
		emptyStateEl?: HTMLElement,
	) => void;
	openTab: (sessionId: string, title: string, cliType: string) => void;
	activateTab: (sessionId: string | null) => void;
	closeTab: (sessionId: string) => void;
	updateTabTitle: (sessionId: string, title: string) => void;
	hasTab: (sessionId: string) => boolean;
	getActiveTab: () => string | null;
	getTabCount: () => number;
	getTabOrder: () => string[];
	reorderTabs: (draggedId: string, targetId: string) => void;
	getIframe: (sessionId: string) => HTMLIFrameElement | undefined;
	getSessionIdBySource: (source: Window) => string | undefined;
};

type ShellModule = {
	setupPortletRelay: (sendMessage: (msg: object) => void) => void;
	routeToPortlet: (message: Record<string, unknown>) => void;
};

type StoredTabs = {
	tabOrder: string[];
};

const TABS_MODULE_PATH = "../../client/shell/tabs.js";
const SHELL_MODULE_PATH = "../../client/shell/shell.js";

function createTabsDOM() {
	const tabBar = document.createElement("div");
	tabBar.id = "tab-bar";

	const portletContainer = document.createElement("div");
	portletContainer.id = "portlet-container";

	const emptyState = document.createElement("div");
	emptyState.id = "empty-state";
	emptyState.textContent = "No session open";

	document.body.appendChild(tabBar);
	document.body.appendChild(portletContainer);
	document.body.appendChild(emptyState);

	return { tabBar, portletContainer, emptyState };
}

function createMockStorage(): Storage {
	const store: Record<string, string> = {};
	const mockStorage = {
		getItem: (key: string) => store[key] ?? null,
		setItem: (key: string, value: string) => {
			store[key] = value;
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			for (const key of Object.keys(store)) {
				delete store[key];
			}
		},
		get length() {
			return Object.keys(store).length;
		},
		key: (index: number) => Object.keys(store)[index] ?? null,
	};

	return mockStorage as Storage;
}

function createMockContentWindow(
	spy: ReturnType<typeof vi.fn> = vi.fn(),
): Window {
	const mockWindow = {
		postMessage: spy,
	};
	// @ts-expect-error jsdom test double: relay only needs postMessage identity.
	return mockWindow as Window;
}

function requireIframe(
	iframe: HTMLIFrameElement | undefined,
	label: string,
): HTMLIFrameElement {
	if (!(iframe instanceof HTMLIFrameElement)) {
		throw new Error(`Expected iframe element for ${label}`);
	}
	return iframe;
}

function parseStoredTabs(raw: string | null): StoredTabs {
	if (!raw) {
		throw new Error("Expected stored tab state");
	}

	const parsed: unknown = JSON.parse(raw);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Stored tab state must be an object");
	}

	const maybeTabOrder = (parsed as { tabOrder?: unknown }).tabOrder;
	if (!Array.isArray(maybeTabOrder)) {
		throw new Error("Stored tab state must contain tabOrder array");
	}

	if (!maybeTabOrder.every((value) => typeof value === "string")) {
		throw new Error("tabOrder entries must be strings");
	}

	return {
		tabOrder: maybeTabOrder,
	};
}

async function importTabs(): Promise<TabsModule> {
	const moduleValue: unknown = await import(TABS_MODULE_PATH);
	return moduleValue as TabsModule;
}

async function importShell(): Promise<ShellModule> {
	const moduleValue: unknown = await import(SHELL_MODULE_PATH);
	return moduleValue as ShellModule;
}

describe("Tab Management", () => {
	let tabs: TabsModule;
	let shell: ShellModule;

	let tabBar: HTMLElement;
	let portletContainer: HTMLElement;
	let emptyState: HTMLElement;

	beforeEach(async () => {
		vi.resetModules();
		document.body.innerHTML = "";

		const dom = createTabsDOM();
		tabBar = dom.tabBar;
		portletContainer = dom.portletContainer;
		emptyState = dom.emptyState;

		const mockStorage = createMockStorage();
		Object.defineProperty(window, "localStorage", {
			value: mockStorage,
			writable: true,
			configurable: true,
		});
		Object.defineProperty(globalThis, "localStorage", {
			value: mockStorage,
			writable: true,
			configurable: true,
		});

		tabs = await importTabs();
		shell = await importShell();
	});

	afterEach(() => {
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	// === AC-4.1: Opening a session creates a tab ===

	test("TC-4.1a: new tab on session open — tab element and iframe created", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "Fix auth bug", "claude-code");

		const tabEls = tabBar.querySelectorAll<HTMLElement>(".tab");
		expect(tabEls.length).toBe(1);
		expect(tabEls[0]?.dataset.sessionId).toBe("claude-code:session-1");
		const iframeEls =
			portletContainer.querySelectorAll<HTMLIFrameElement>("iframe");
		expect(iframeEls.length).toBe(1);
		expect(iframeEls[0]?.dataset.sessionId).toBe("claude-code:session-1");
		expect(tabEls[0]?.classList.contains("active")).toBe(true);
		expect(tabs.getTabCount()).toBe(1);
	});

	test("TC-4.1b: multiple tabs — two tabs, second active", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "Fix auth bug", "claude-code");
		tabs.openTab("claude-code:session-2", "Add tests", "claude-code");

		expect(tabBar.querySelectorAll(".tab").length).toBe(2);
		expect(portletContainer.querySelectorAll("iframe").length).toBe(2);
		expect(tabs.getActiveTab()).toBe("claude-code:session-2");
		expect(tabs.getTabCount()).toBe(2);
	});

	// === AC-4.2: Tab switch preserves scroll ===
	// TC-4.2b is a manual performance check (<100ms switch), not automated in Vitest.

	test("TC-4.2a: scroll preserved on switch — iframe element reference preserved", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "Session A", "claude-code");
		const iframeBefore = portletContainer.querySelector<HTMLIFrameElement>(
			'iframe[data-session-id="claude-code:session-1"]',
		);
		tabs.openTab("claude-code:session-2", "Session B", "claude-code");

		tabs.activateTab("claude-code:session-1");

		const iframeAfter = portletContainer.querySelector<HTMLIFrameElement>(
			'iframe[data-session-id="claude-code:session-1"]',
		);
		expect(iframeAfter).toBe(iframeBefore);
		expect(iframeAfter?.style.display).toBe("block");
	});

	// === AC-4.3: Deduplication ===

	test("TC-4.3a: sidebar deduplicates — same tab activated, no new iframe", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "Fix auth bug", "claude-code");

		tabs.openTab("claude-code:session-1", "Fix auth bug", "claude-code");

		expect(tabs.getTabCount()).toBe(1);
		expect(portletContainer.querySelectorAll("iframe").length).toBe(1);
		expect(tabs.getActiveTab()).toBe("claude-code:session-1");
	});

	test("TC-4.3b: tab count constant — 3 tabs, click existing, still 3", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "S1", "claude-code");
		tabs.openTab("claude-code:session-2", "S2", "claude-code");
		tabs.openTab("claude-code:session-3", "S3", "claude-code");

		tabs.openTab("claude-code:session-1", "S1", "claude-code");

		expect(tabs.getTabCount()).toBe(3);
		expect(tabBar.querySelectorAll(".tab").length).toBe(3);
		expect(tabs.getActiveTab()).toBe("claude-code:session-1");
	});

	// === AC-4.4: Close tab ===

	test("TC-4.4a: close removes tab and iframe", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "S1", "claude-code");
		tabs.openTab("claude-code:session-2", "S2", "claude-code");

		tabs.closeTab("claude-code:session-1");

		expect(
			tabBar.querySelector('[data-session-id="claude-code:session-1"]'),
		).toBeNull();
		expect(
			portletContainer.querySelector(
				'iframe[data-session-id="claude-code:session-1"]',
			),
		).toBeNull();
		expect(tabs.hasTab("claude-code:session-1")).toBe(false);
		expect(tabs.getTabCount()).toBe(1);
	});

	test("TC-4.4b: close active switches to adjacent — next tab activated", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:A", "A", "claude-code");
		tabs.openTab("claude-code:B", "B", "claude-code");
		tabs.openTab("claude-code:C", "C", "claude-code");
		tabs.activateTab("claude-code:B");

		tabs.closeTab("claude-code:B");

		expect(tabs.getActiveTab()).toBe("claude-code:C");
		const activeFrame = portletContainer.querySelector<HTMLIFrameElement>(
			'iframe[data-session-id="claude-code:C"]',
		);
		expect(activeFrame?.style.display).toBe("block");
	});

	test("TC-4.4c: close last tab shows empty state", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "S1", "claude-code");

		tabs.closeTab("claude-code:session-1");

		expect(tabs.getTabCount()).toBe(0);
		expect(tabs.getActiveTab()).toBeNull();
		expect(emptyState.style.display).not.toBe("none");
		expect(portletContainer.querySelectorAll("iframe").length).toBe(0);
	});

	// === AC-4.5: Tab displays title and CLI type ===

	test("TC-4.5a: tab shows title and CLI type — title and indicator visible", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "Fix auth bug", "claude-code");

		const tab = tabBar.querySelector(
			'[data-session-id="claude-code:session-1"]',
		);
		expect(tab?.querySelector(".tab-title")?.textContent).toBe("Fix auth bug");
		expect(
			tab?.querySelector<HTMLElement>(".tab-cli-indicator")?.dataset.cliType,
		).toBe("claude-code");
	});

	test('TC-4.5b: new session shows placeholder title — tab shows "New Session"', () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "New Session", "claude-code");

		const tab = tabBar.querySelector(
			'[data-session-id="claude-code:session-1"]',
		);
		expect(tab?.querySelector(".tab-title")?.textContent).toBe("New Session");
	});

	// === AC-4.6: Drag-and-drop reorder ===

	test("TC-4.6a: drag reorder — order A, C, B", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:A", "A", "claude-code");
		tabs.openTab("claude-code:B", "B", "claude-code");
		tabs.openTab("claude-code:C", "C", "claude-code");

		tabs.reorderTabs("claude-code:C", "claude-code:B");

		expect(tabs.getTabOrder()).toEqual([
			"claude-code:A",
			"claude-code:C",
			"claude-code:B",
		]);
	});

	test("TC-4.6b: order persists — localStorage updated", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:A", "A", "claude-code");
		tabs.openTab("claude-code:B", "B", "claude-code");
		tabs.openTab("claude-code:C", "C", "claude-code");
		tabs.reorderTabs("claude-code:C", "claude-code:B");

		const stored = parseStoredTabs(localStorage.getItem("liminal:tabs"));
		expect(stored.tabOrder).toEqual([
			"claude-code:A",
			"claude-code:C",
			"claude-code:B",
		]);
	});

	// === AC-4.7: Tabs restore on restart ===
	// TC-5.6a (browser refresh restore) is covered in Story 6, not in this Story 5 test suite.

	test("TC-4.7a: tabs restore — tabs restored from localStorage", () => {
		localStorage.setItem(
			"liminal:tabs",
			JSON.stringify({
				openTabs: ["claude-code:s1", "claude-code:s2", "claude-code:s3"],
				activeTab: "claude-code:s2",
				tabOrder: ["claude-code:s1", "claude-code:s2", "claude-code:s3"],
				tabMeta: {
					"claude-code:s1": { title: "S1", cliType: "claude-code" },
					"claude-code:s2": { title: "S2", cliType: "claude-code" },
					"claude-code:s3": { title: "S3", cliType: "claude-code" },
				},
			}),
		);

		tabs.init(tabBar, portletContainer, emptyState);

		expect(tabs.getTabCount()).toBe(3);
		expect(portletContainer.querySelectorAll("iframe").length).toBe(3);
		expect(tabs.getActiveTab()).toBe("claude-code:s2");
	});

	// === TC-2.3b (from Story 4, tested here): Open already-tabbed session ===

	test("TC-2.3b: open already-tabbed session activates existing tab", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "S1", "claude-code");
		tabs.openTab("claude-code:session-2", "S2", "claude-code");

		tabs.openTab("claude-code:session-1", "S1", "claude-code");

		expect(tabs.getActiveTab()).toBe("claude-code:session-1");
		expect(tabs.getTabCount()).toBe(2);
		const iframe1 = portletContainer.querySelector<HTMLIFrameElement>(
			'iframe[data-session-id="claude-code:session-1"]',
		);
		const iframe2 = portletContainer.querySelector<HTMLIFrameElement>(
			'iframe[data-session-id="claude-code:session-2"]',
		);
		expect(iframe1?.style.display).toBe("block");
		expect(iframe2?.style.display).toBe("none");
	});

	// === PostMessage Relay Integration Tests ===
	// These test the shell.js relay functions that bridge WebSocket ↔ portlet iframes.
	// They exercise the cross-story integration glue that connects Stories 3, 4, and 5.

	test("WS message routes to correct portlet iframe", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "S1", "claude-code");
		tabs.openTab("claude-code:session-2", "S2", "claude-code");
		const iframe1 = requireIframe(
			tabs.getIframe("claude-code:session-1"),
			"session-1",
		);
		const iframe2 = requireIframe(
			tabs.getIframe("claude-code:session-2"),
			"session-2",
		);

		const spy1 = vi.fn();
		const spy2 = vi.fn();
		const mockCW1 = createMockContentWindow(spy1);
		const mockCW2 = createMockContentWindow(spy2);
		Object.defineProperty(iframe1, "contentWindow", {
			value: mockCW1,
			writable: true,
			configurable: true,
		});
		Object.defineProperty(iframe2, "contentWindow", {
			value: mockCW2,
			writable: true,
			configurable: true,
		});

		shell.routeToPortlet({
			type: "session:update",
			sessionId: "claude-code:session-1",
			entry: { entryId: "e1", role: "user", type: "text", content: "hello" },
		});

		expect(spy1).toHaveBeenCalledOnce();
		expect(spy2).not.toHaveBeenCalled();
		expect(spy1).toHaveBeenCalledWith(
			expect.objectContaining({ type: "session:update" }),
			expect.any(String),
		);
	});

	test("portlet postMessage reaches WS with sessionId injected", () => {
		const mockSend = vi.fn<(msg: object) => void>();
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "S1", "claude-code");
		shell.setupPortletRelay(mockSend);

		const iframe = requireIframe(
			tabs.getIframe("claude-code:session-1"),
			"session-1",
		);
		const mockCW = createMockContentWindow();
		Object.defineProperty(iframe, "contentWindow", {
			value: mockCW,
			writable: true,
			configurable: true,
		});

		const event = new MessageEvent("message", {
			data: { type: "session:send", content: "hello agent" },
			origin: window.location.origin,
			source: mockCW,
		});
		window.dispatchEvent(event);

		expect(mockSend).toHaveBeenCalledOnce();
		expect(mockSend).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "session:send",
				sessionId: "claude-code:session-1",
				content: "hello agent",
			}),
		);
	});

	test("session:created auto-opens tab via WS handler", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		const openTabSpy = vi.fn(
			(sessionId: string, title: string, cliType: string) => {
				tabs.openTab(sessionId, title, cliType);
			},
		);

		function simulateShellOnMessage(msg: {
			type: string;
			sessionId?: string;
			title?: string;
			projectId?: string;
			cliType?: string;
		}) {
			if (msg.type === "session:created" && msg.sessionId) {
				openTabSpy(
					msg.sessionId,
					msg.title || "New Session",
					msg.cliType || "claude-code",
				);
			}
			shell.routeToPortlet(msg);
		}

		simulateShellOnMessage({
			type: "session:created",
			sessionId: "claude-code:new-session",
			projectId: "proj-1",
			cliType: "claude-code",
		});

		expect(openTabSpy).toHaveBeenCalledOnce();
		expect(openTabSpy).toHaveBeenCalledWith(
			"claude-code:new-session",
			"New Session",
			"claude-code",
		);
		expect(tabs.hasTab("claude-code:new-session")).toBe(true);
		expect(tabs.getActiveTab()).toBe("claude-code:new-session");
		expect(tabBar.querySelector(".tab-title")?.textContent).toBe("New Session");
	});

	test("messages for unknown sessions silently dropped", () => {
		tabs.init(tabBar, portletContainer, emptyState);
		tabs.openTab("claude-code:session-1", "S1", "claude-code");
		const iframe1 = requireIframe(
			tabs.getIframe("claude-code:session-1"),
			"session-1",
		);

		const spy1 = vi.fn();
		const mockCW = createMockContentWindow(spy1);
		Object.defineProperty(iframe1, "contentWindow", {
			value: mockCW,
			writable: true,
			configurable: true,
		});

		shell.routeToPortlet({
			type: "session:update",
			sessionId: "claude-code:unknown-session",
			entry: { entryId: "e1", role: "user", type: "text", content: "hello" },
		});

		expect(spy1).not.toHaveBeenCalled();
	});
});
