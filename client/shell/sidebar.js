import { STORAGE_KEYS } from "../shared/constants.js";
import {
	closeTab as closeShellTab,
	hasTab as hasShellTab,
	openTab as openShellTab,
} from "./tabs.js";

const COLLAPSED_KEY = STORAGE_KEYS.COLLAPSED;

/**
 * Escape a string for safe use in CSS selectors (attribute values).
 * Uses CSS.escape when available, otherwise falls back to manual escaping.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeCssSelector(value) {
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(value);
	}
	// Fallback: escape characters that are special in CSS selector attribute values
	return value.replace(/["\\]/g, "\\$&");
}

let currentProjects = [];
let currentSessionsByProject = {};
let sendMessageRef = () => {};
let resyncSessionsListener = null;

function requestSessionListsForExpandedProjects() {
	const collapsedState = getCollapsedState();
	for (const project of currentProjects) {
		if (collapsedState[project.id] === true) {
			continue;
		}
		sendMessageRef({
			type: "session:list",
			projectId: project.id,
		});
	}
}

function parseCliType(sessionId) {
	if (typeof sessionId !== "string") {
		return "claude-code";
	}
	const colonIdx = sessionId.indexOf(":");
	if (colonIdx <= 0) {
		return "claude-code";
	}
	const maybeCliType = sessionId.substring(0, colonIdx);
	return maybeCliType === "codex" ? "codex" : "claude-code";
}

function closeSessionTab(sessionId) {
	if (typeof sessionId !== "string" || sessionId.length === 0) {
		return;
	}

	// Keep tabs module state and localStorage in sync when available.
	if (hasShellTab(sessionId)) {
		closeShellTab(sessionId);
		return;
	}

	// Fallback for isolated/sidebar-only contexts.
	const tabs = document.querySelectorAll(
		`.tab[data-session-id="${escapeCssSelector(sessionId)}"]`,
	);
	for (const tab of tabs) {
		tab.remove();
	}
}

function findProjectForSession(sessionId) {
	for (const [projectId, sessions] of Object.entries(
		currentSessionsByProject,
	)) {
		if (sessions.some((session) => session.id === sessionId)) {
			return projectId;
		}
	}
	return null;
}

function removeSessionFromState(sessionId) {
	const projectId = findProjectForSession(sessionId);
	if (!projectId) {
		return null;
	}

	currentSessionsByProject = {
		...currentSessionsByProject,
		[projectId]: currentSessionsByProject[projectId].filter(
			(session) => session.id !== sessionId,
		),
	};
	return projectId;
}

/**
 * Initialize the sidebar.
 * Called once on page load.
 *
 * @param {(msg: object) => void} [sendMessage]
 * @param {(handler: (msg: object) => void) => void} [onMessage]
 */
export function initSidebar(sendMessage = () => {}, onMessage = () => {}) {
	sendMessageRef = sendMessage;

	if (resyncSessionsListener) {
		window.removeEventListener(
			"liminal:resync-sessions",
			resyncSessionsListener,
		);
	}
	resyncSessionsListener = () => {
		requestSessionListsForExpandedProjects();
	};
	window.addEventListener("liminal:resync-sessions", resyncSessionsListener);

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
				requestSessionListsForExpandedProjects();
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
					sendMessageRef({
						type: "session:list",
						projectId: message.project.id,
					});
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
			case "session:created": {
				if (
					typeof message.projectId === "string" &&
					typeof message.sessionId === "string"
				) {
					const existing = currentSessionsByProject[message.projectId] ?? [];
					const alreadyExists = existing.some(
						(session) => session.id === message.sessionId,
					);
					if (!alreadyExists) {
						currentSessionsByProject = {
							...currentSessionsByProject,
							[message.projectId]: [
								{
									id: message.sessionId,
									title: "New Session",
									lastActiveAt: new Date().toISOString(),
									cliType: parseCliType(message.sessionId),
								},
								...existing,
							],
						};
						renderProjects(
							currentProjects,
							sendMessageRef,
							currentSessionsByProject,
						);
					}
				}
				break;
			}
			case "session:archived": {
				if (typeof message.sessionId === "string") {
					const projectId = removeSessionFromState(message.sessionId);
					closeSessionTab(message.sessionId);
					if (projectId) {
						renderProjects(
							currentProjects,
							sendMessageRef,
							currentSessionsByProject,
						);
					}
				}
				break;
			}
			case "session:title-updated": {
				if (
					typeof message.sessionId === "string" &&
					typeof message.title === "string"
				) {
					const projectId = findProjectForSession(message.sessionId);
					if (projectId) {
						currentSessionsByProject = {
							...currentSessionsByProject,
							[projectId]: currentSessionsByProject[projectId].map((session) =>
								session.id === message.sessionId
									? { ...session, title: message.title }
									: session,
							),
						};
						renderProjects(
							currentProjects,
							sendMessageRef,
							currentSessionsByProject,
						);
					}
				}
				break;
			}
			case "agent:status": {
				if (
					typeof message.cliType === "string" &&
					typeof message.status === "string"
				) {
					updateAgentStatus(message.cliType, message.status);
				}
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
	sendMessageRef = sendMessage;
	currentProjects = projects;
	currentSessionsByProject = sessionsByProject;
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
		collapseButton.textContent = isCollapsed ? "▸" : "▾";
		collapseButton.setAttribute("aria-label", "Toggle project");
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
		removeButton.textContent = "×";
		removeButton.title = "Remove project";
		removeButton.setAttribute("aria-label", "Remove project");
		removeButton.addEventListener("click", () => {
			sendMessage({ type: "project:remove", projectId: project.id });
		});
		header.appendChild(removeButton);

		group.appendChild(header);

		const sessionList = document.createElement("div");
		sessionList.className = "session-list";
		sessionList.dataset.projectId = project.id;
		sessionList.hidden = isCollapsed;

		const newSessionButton = document.createElement("button");
		newSessionButton.className = "new-session-btn";
		newSessionButton.dataset.projectId = project.id;
		newSessionButton.textContent = "New Session";
		newSessionButton.addEventListener("click", () => {
			showCliPicker(project.id);
		});
		sessionList.appendChild(newSessionButton);

		group.appendChild(sessionList);
		container.appendChild(group);
		renderSessions(project.id, sessionsByProject[project.id] ?? []);
	}
}

/**
 * Render sessions for a project.
 *
 * @param {string} projectId
 * @param {Array<{id: string, title: string, lastActiveAt: string, cliType: string}>} sessions
 */
export function renderSessions(projectId, sessions) {
	const escapedProjectId = escapeCssSelector(projectId);
	const sessionList = document.querySelector(
		`.session-list[data-project-id="${escapedProjectId}"]`,
	);
	if (!sessionList) {
		return;
	}

	const newSessionButton = sessionList.querySelector(
		`.new-session-btn[data-project-id="${escapedProjectId}"]`,
	);
	const picker = sessionList.querySelector(
		`.cli-picker[data-project-id="${escapedProjectId}"]`,
	);
	const pickerHidden = picker ? picker.hidden : true;

	sessionList.innerHTML = "";
	if (newSessionButton) {
		sessionList.appendChild(newSessionButton);
	}
	if (picker) {
		picker.hidden = pickerHidden;
		sessionList.appendChild(picker);
	}

	if (sessions.length === 0) {
		const emptyState = document.createElement("div");
		emptyState.className = "session-empty-state";
		emptyState.textContent = "No sessions. Create one to get started.";
		sessionList.appendChild(emptyState);
		return;
	}

	for (const session of sessions) {
		const sessionItem = document.createElement("div");
		sessionItem.className = "session-item";
		sessionItem.dataset.sessionId = session.id;
		sessionItem.addEventListener("click", () => {
			const wasAlreadyOpen = hasShellTab(session.id);
			try {
				openShellTab(
					session.id,
					typeof session.title === "string" && session.title.length > 0
						? session.title
						: "New Session",
					typeof session.cliType === "string"
						? session.cliType
						: parseCliType(session.id),
				);
			} catch (error) {
				console.warn("[sidebar] Failed to open session tab:", error);
			}
			if (!wasAlreadyOpen) {
				sendMessageRef({ type: "session:open", sessionId: session.id });
			}
		});

		const sessionBadge = document.createElement("span");
		sessionBadge.className = "session-cli-badge";
		sessionBadge.textContent = session.cliType === "codex" ? "CX" : "CC";
		sessionItem.appendChild(sessionBadge);

		const sessionTitle = document.createElement("span");
		sessionTitle.className = "session-title";
		sessionTitle.textContent = session.title;
		sessionTitle.title = session.title;
		sessionItem.appendChild(sessionTitle);

		const sessionTime = document.createElement("span");
		sessionTime.className = "session-time";
		sessionTime.textContent = relativeTime(session.lastActiveAt);
		sessionItem.appendChild(sessionTime);

		const archiveButton = document.createElement("button");
		archiveButton.className = "archive-session-btn";
		archiveButton.dataset.sessionId = session.id;
		archiveButton.textContent = "Archive";
		archiveButton.title = "Archive session";
		archiveButton.setAttribute("aria-label", "Archive session");
		archiveButton.addEventListener("click", (event) => {
			event.stopPropagation();
			sendMessageRef({ type: "session:archive", sessionId: session.id });
			removeSessionFromState(session.id);
			renderProjects(currentProjects, sendMessageRef, currentSessionsByProject);
			closeSessionTab(session.id);
		});
		sessionItem.appendChild(archiveButton);

		sessionList.appendChild(sessionItem);
	}
}

/**
 * Show CLI picker for creating a session.
 *
 * @param {string} projectId
 */
export function showCliPicker(projectId) {
	const escapedProjectId = escapeCssSelector(projectId);
	const sessionList = document.querySelector(
		`.session-list[data-project-id="${escapedProjectId}"]`,
	);
	if (!sessionList) {
		return;
	}

	let picker = sessionList.querySelector(
		`.cli-picker[data-project-id="${escapedProjectId}"]`,
	);

	if (!picker) {
		picker = document.createElement("div");
		picker.className = "cli-picker";
		picker.dataset.projectId = projectId;

		const claudeButton = document.createElement("button");
		claudeButton.className = "cli-picker-option";
		claudeButton.textContent = "Claude Code";
		claudeButton.addEventListener("click", () => {
			sendMessageRef({
				type: "session:create",
				projectId,
				cliType: "claude-code",
			});
			hideCliPicker();
		});

		const codexButton = document.createElement("button");
		codexButton.className = "cli-picker-option";
		codexButton.textContent = "Codex";
		codexButton.addEventListener("click", () => {
			sendMessageRef({
				type: "session:create",
				projectId,
				cliType: "codex",
			});
			hideCliPicker();
		});

		const cancelButton = document.createElement("button");
		cancelButton.className = "cli-picker-cancel";
		cancelButton.dataset.projectId = projectId;
		cancelButton.textContent = "Cancel";
		cancelButton.addEventListener("click", () => {
			hideCliPicker();
		});

		picker.appendChild(claudeButton);
		picker.appendChild(codexButton);
		picker.appendChild(cancelButton);
		const newSessionBtn = sessionList.querySelector(
			`.new-session-btn[data-project-id="${escapedProjectId}"]`,
		);
		if (newSessionBtn?.nextSibling) {
			sessionList.insertBefore(picker, newSessionBtn.nextSibling);
		} else {
			sessionList.appendChild(picker);
		}
	}

	picker.hidden = false;
}

/** Hide CLI picker UI. */
export function hideCliPicker() {
	const pickers = document.querySelectorAll(".cli-picker");
	for (const picker of pickers) {
		picker.hidden = true;
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
		`.project-group[data-project-id="${escapeCssSelector(projectId)}"]`,
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
		collapseButton.textContent = isNowCollapsed ? "▸" : "▾";
	}

	const collapsedState = getCollapsedState();
	collapsedState[projectId] = isNowCollapsed;
	localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsedState));
}

function relativeTime(isoString) {
	const diff = Date.now() - new Date(isoString).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	const weeks = Math.floor(days / 7);
	return `${weeks}w`;
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

/**
 * Show or hide the reconnect button for a CLI type.
 * Called when agent:status messages arrive.
 *
 * @param {string} cliType - "claude-code" or "codex"
 * @param {"connected" | "disconnected" | "reconnecting" | "starting"} status
 */
export function updateAgentStatus(cliType, status) {
	const existingBtn = document.querySelector(
		`.reconnect-btn[data-cli-type="${escapeCssSelector(cliType)}"]`,
	);

	if (status === "disconnected") {
		if (existingBtn) {
			return;
		}

		const button = document.createElement("button");
		button.className = "reconnect-btn";
		button.dataset.cliType = cliType;
		button.textContent = `Reconnect ${cliType === "codex" ? "Codex" : "Claude Code"}`;
		button.addEventListener("click", () => {
			window.dispatchEvent(
				new CustomEvent("liminal:reconnect", {
					detail: { cliType },
				}),
			);
		});

		const sidebar = document.getElementById("sidebar");
		if (sidebar) {
			sidebar.appendChild(button);
		}
		return;
	}

	if (existingBtn) {
		existingBtn.remove();
	}
}
