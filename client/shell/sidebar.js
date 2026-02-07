import { STORAGE_KEYS } from "../shared/constants.js";

const COLLAPSED_KEY = STORAGE_KEYS.COLLAPSED;

let currentProjects = [];
let currentSessionsByProject = {};
let sendMessageRef = () => {};

/**
 * Initialize the sidebar.
 * Called once on page load.
 *
 * @param {(msg: object) => void} [sendMessage]
 * @param {(handler: (msg: object) => void) => void} [onMessage]
 */
export function initSidebar(sendMessage = () => {}, onMessage = () => {}) {
	sendMessageRef = sendMessage;

	const addButton = document.getElementById("add-project-btn");
	if (addButton) {
		addButton.addEventListener("click", () => {
			const path = window.prompt("Enter absolute directory path");
			handleAddProject(path, sendMessageRef);
		});
	}

	onMessage((message) => {
		if (typeof message !== "object" || message === null) {
			return;
		}

		switch (message.type) {
			case "project:list": {
				currentProjects = Array.isArray(message.projects)
					? message.projects
					: [];
				renderProjects(
					currentProjects,
					sendMessageRef,
					currentSessionsByProject,
				);
				break;
			}
			case "project:added": {
				if (message.project) {
					currentProjects = [...currentProjects, message.project];
					renderProjects(
						currentProjects,
						sendMessageRef,
						currentSessionsByProject,
					);
				}
				break;
			}
			case "project:removed": {
				currentProjects = currentProjects.filter(
					(project) => project.id !== message.projectId,
				);
				delete currentSessionsByProject[message.projectId];
				renderProjects(
					currentProjects,
					sendMessageRef,
					currentSessionsByProject,
				);
				break;
			}
			case "session:list": {
				currentSessionsByProject = {
					...currentSessionsByProject,
					[message.projectId]: Array.isArray(message.sessions)
						? message.sessions
						: [],
				};
				renderProjects(
					currentProjects,
					sendMessageRef,
					currentSessionsByProject,
				);
				break;
			}
		}
	});

	sendMessageRef({ type: "project:list" });
}

/**
 * Render the project list.
 *
 * @param {Array<{id: string, path: string, name: string, addedAt: string}>} projects
 * @param {(msg: object) => void} sendMessage
 * @param {Record<string, Array<{id: string, title: string, lastActiveAt: string, cliType: string}>>} [sessionsByProject]
 */
export function renderProjects(projects, sendMessage, sessionsByProject = {}) {
	const container = document.getElementById("project-list");
	if (!container) {
		return;
	}

	container.innerHTML = "";

	if (projects.length === 0) {
		const emptyState = document.createElement("div");
		emptyState.className = "empty-state";

		const text = document.createElement("p");
		text.textContent = "Add a project to get started";
		emptyState.appendChild(text);

		container.appendChild(emptyState);
		return;
	}

	const collapsedState = getCollapsedState();

	for (const project of projects) {
		const isCollapsed = collapsedState[project.id] === true;

		const group = document.createElement("div");
		group.className = "project-group";
		group.dataset.projectId = project.id;

		const header = document.createElement("div");
		header.className = "project-header";

		const collapseButton = document.createElement("button");
		collapseButton.className = "collapse-toggle";
		collapseButton.dataset.projectId = project.id;
		collapseButton.textContent = isCollapsed ? ">" : "v";
		collapseButton.addEventListener("click", () => {
			toggleCollapse(project.id);
		});
		header.appendChild(collapseButton);

		const name = document.createElement("span");
		name.className = "project-name";
		name.textContent = project.name;
		header.appendChild(name);

		const removeButton = document.createElement("button");
		removeButton.className = "remove-project-btn";
		removeButton.dataset.projectId = project.id;
		removeButton.textContent = "x";
		removeButton.addEventListener("click", () => {
			sendMessage({ type: "project:remove", projectId: project.id });
		});
		header.appendChild(removeButton);

		group.appendChild(header);

		const sessionList = document.createElement("div");
		sessionList.className = "session-list";
		sessionList.dataset.projectId = project.id;
		sessionList.hidden = isCollapsed;

		const sessions = sessionsByProject[project.id] ?? [];
		for (const session of sessions) {
			const sessionItem = document.createElement("div");
			sessionItem.className = "session-item";
			sessionItem.dataset.sessionId = session.id;
			sessionItem.textContent = session.title;
			sessionList.appendChild(sessionItem);
		}

		group.appendChild(sessionList);
		container.appendChild(group);
	}
}

/**
 * Handle add project action.
 *
 * @param {string | null | undefined} path
 * @param {(msg: object) => void} sendMessage
 */
export function handleAddProject(path, sendMessage) {
	if (typeof path !== "string") {
		return;
	}

	const trimmedPath = path.trim();
	if (trimmedPath.length === 0) {
		return;
	}

	sendMessage({ type: "project:add", path: trimmedPath });
}

/**
 * Toggle collapse state for a project.
 *
 * @param {string} projectId
 */
export function toggleCollapse(projectId) {
	const group = document.querySelector(
		`.project-group[data-project-id="${projectId}"]`,
	);
	if (!group) {
		return;
	}

	const sessionList = group.querySelector(".session-list");
	if (!sessionList) {
		return;
	}

	const isNowCollapsed = !sessionList.hidden;
	sessionList.hidden = isNowCollapsed;

	const collapseButton = group.querySelector(".collapse-toggle");
	if (collapseButton) {
		collapseButton.textContent = isNowCollapsed ? ">" : "v";
	}

	const collapsedState = getCollapsedState();
	collapsedState[projectId] = isNowCollapsed;
	localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsedState));
}

/**
 * @returns {Record<string, boolean>}
 */
function getCollapsedState() {
	try {
		const raw = localStorage.getItem(COLLAPSED_KEY);
		if (!raw) {
			return {};
		}

		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) {
			return {};
		}

		return parsed;
	} catch {
		return {};
	}
}
