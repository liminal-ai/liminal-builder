// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setupDOM() {
	document.body.innerHTML = `
		<div id="app" class="shell-layout">
			<aside id="sidebar" class="sidebar">
				<div class="sidebar-header">
					<h1 class="sidebar-title">Liminal Builder</h1>
				</div>
				<div id="project-list" class="project-list"></div>
				<div class="sidebar-footer">
					<button id="add-project-btn" class="btn btn-primary">+ Add Project</button>
				</div>
			</aside>
		</div>
	`;
}

let sentMessages: object[] = [];
function mockSendMessage(msg: object) {
	sentMessages.push(msg);
}

type SidebarModule = {
	renderProjects: (
		projects: Array<{
			id: string;
			path: string;
			name: string;
			addedAt: string;
		}>,
		sendMessage: (msg: object) => void,
		sessionsByProject?: Record<
			string,
			Array<{
				id: string;
				title: string;
				lastActiveAt: string;
				cliType: string;
			}>
		>,
	) => void;
	handleAddProject: (
		path: string | null,
		sendMessage: (msg: object) => void,
	) => void;
	toggleCollapse: (projectId: string) => void;
};

const SIDEBAR_MODULE_PATH = "../../client/shell/sidebar.js";
const CONSTANTS_MODULE_PATH = "../../client/shared/constants.js";

async function importSidebar(): Promise<SidebarModule> {
	const sidebarModule: unknown = await import(SIDEBAR_MODULE_PATH);
	return sidebarModule as SidebarModule;
}

async function importCollapsedStorageKey(): Promise<string> {
	const constantsModule: unknown = await import(CONSTANTS_MODULE_PATH);
	return (constantsModule as { STORAGE_KEYS: { COLLAPSED: string } })
		.STORAGE_KEYS.COLLAPSED;
}

describe("Sidebar", () => {
	beforeEach(() => {
		vi.resetModules();
		setupDOM();
		sentMessages = [];
		localStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("TC-1.1b: empty state prompt rendered when no projects", async () => {
		const { renderProjects } = await importSidebar();
		renderProjects([], mockSendMessage);

		const projectList = document.getElementById("project-list");
		expect(projectList).not.toBeNull();
		const emptyState = projectList?.querySelector(".empty-state");

		expect(emptyState).not.toBeNull();
		expect(emptyState?.textContent).toMatch(/add a project/i);
	});

	it("TC-1.2c: cancel add project sends no WebSocket message", async () => {
		const { renderProjects, handleAddProject } = await importSidebar();
		renderProjects([], mockSendMessage);
		const projectList = document.getElementById("project-list");
		expect(projectList).not.toBeNull();
		const beforeHtml = projectList?.innerHTML;

		handleAddProject(null, mockSendMessage);

		expect(sentMessages).toHaveLength(0);
		expect(projectList?.innerHTML).toBe(beforeHtml);
	});

	it("TC-1.4a: collapse hides sessions", async () => {
		const { renderProjects, toggleCollapse } = await importSidebar();

		const mockProjects = [
			{
				id: "proj-1",
				path: "/test/alpha",
				name: "alpha",
				addedAt: "2026-01-15T10:00:00.000Z",
			},
		];

		const mockSessions = [
			{
				id: "claude-code:s1",
				title: "Session 1",
				lastActiveAt: "2026-01-15T14:00:00.000Z",
				cliType: "claude-code",
			},
		];

		renderProjects(mockProjects, mockSendMessage, { "proj-1": mockSessions });

		const sessionList = document.querySelector<HTMLElement>(
			'[data-project-id="proj-1"] .session-list',
		);
		expect(sessionList).not.toBeNull();
		expect(sessionList?.hidden).toBe(false);

		toggleCollapse("proj-1");

		expect(sessionList?.hidden).toBe(true);
	});

	it("TC-1.4b: collapse state persists in localStorage across reload", async () => {
		const collapsedKey = await importCollapsedStorageKey();
		localStorage.setItem(collapsedKey, JSON.stringify({ "proj-1": true }));

		const { renderProjects } = await importSidebar();

		const mockProjects = [
			{
				id: "proj-1",
				path: "/test/alpha",
				name: "alpha",
				addedAt: "2026-01-15T10:00:00.000Z",
			},
		];

		const mockSessions = [
			{
				id: "claude-code:s1",
				title: "Session 1",
				lastActiveAt: "2026-01-15T14:00:00.000Z",
				cliType: "claude-code",
			},
		];

		renderProjects(mockProjects, mockSendMessage, { "proj-1": mockSessions });

		const sessionList = document.querySelector<HTMLElement>(
			'[data-project-id="proj-1"] .session-list',
		);
		expect(sessionList).not.toBeNull();
		expect(sessionList?.hidden).toBe(true);
	});
});
