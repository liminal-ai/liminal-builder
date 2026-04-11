import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildCreateSessionMessage } from "@renderer/lib/messages";
import type {
	AgentStatus,
	ClientMessage,
	Project,
	ServerMessage,
	SessionListItem,
	SessionRenderState,
	SessionSelection,
	TurnEvent,
	UpsertObject,
} from "@renderer/lib/types";
import { WsClient } from "@renderer/lib/ws-client";
import {
	buildPinnedSessionViewModels,
	cleanupPinnedSessionIds,
} from "@renderer/lib/sidebar-selectors";
import {
	STORAGE_KEYS,
	buildProjectNameById,
	buildProjectPathById,
	ensureProjectSessionBuckets,
	filterClaudeSessions,
	findSessionSelection,
	readStorage,
	removeSessionFromLists,
	toSelection,
	writeStorage,
} from "./session-list-state";
import {
	addOptimisticPrompt,
	applyHistoryMessage,
	applyTurnMessage,
	applyUpsertMessage,
	archiveWorkspaceSession,
	buildSessionUiById,
	buildWorkspaceView,
	setSessionError,
	setSessionLoading,
	withSessionState,
} from "./session-workspace-state";

function isClaudeSessionId(sessionId: string): boolean {
	return sessionId.startsWith("claude-code:");
}

function providerSessionIdFromCanonical(sessionId: string): string {
	const colonIndex = sessionId.indexOf(":");
	return colonIndex >= 0 ? sessionId.substring(colonIndex + 1) : sessionId;
}

function readStoredSelection(): SessionSelection | null {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEYS.selectedSession);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			typeof (parsed as { sessionId?: unknown }).sessionId === "string" &&
			typeof (parsed as { projectId?: unknown }).projectId === "string"
		) {
			return parsed as SessionSelection;
		}
		if (typeof parsed === "string") {
			const projectId = readStorage<string | null>(
				STORAGE_KEYS.selectedSessionProject,
				null,
			);
			if (!projectId) {
				return null;
			}
			return {
				sessionId: parsed,
				projectId,
				availability: "available",
				source: "builder",
			};
		}
		return null;
	} catch {
		return null;
	}
}

export function useDesktopSessionController() {
	const [backendConfig, setBackendConfig] = useState<{
		port: number;
		httpUrl: string;
		wsUrl: string;
	} | null>(null);
	const [fatalError, setFatalError] = useState<string | null>(null);
	const [socketState, setSocketState] = useState<
		"connecting" | "connected" | "disconnected" | "reconnecting"
	>("connecting");
	const [projects, setProjects] = useState<Project[]>([]);
	const [sessionsByProject, setSessionsByProject] = useState<
		Record<string, SessionListItem[]>
	>({});
	const [loadedSessionProjects, setLoadedSessionProjects] = useState<
		Record<string, boolean>
	>({});
	const [sessionStates, setSessionStates] = useState<
		Record<string, SessionRenderState>
	>({});
	const [agentStatus, setAgentStatus] = useState<AgentStatus>("starting");
	const [collapsedByProjectId, setCollapsedByProjectId] = useState<
		Record<string, boolean>
	>(() => readStorage<Record<string, boolean>>(STORAGE_KEYS.collapsed, {}));
	const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
		readStorage<number>(STORAGE_KEYS.sidebarWidth, 352),
	);
	const [selectedSession, setSelectedSession] =
		useState<SessionSelection | null>(() => readStoredSelection());
	const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>(() =>
		readStorage<string[]>(STORAGE_KEYS.pinnedSessions, []),
	);
	const [composerBySession, setComposerBySession] = useState<
		Record<string, { model: string; thinking: string }>
	>({});
	const [serverNotice, setServerNotice] = useState<string | null>(null);
	const [viewMode, setViewMode] = useState<"thread" | "new-thread">(
		readStoredSelection() ? "thread" : "new-thread",
	);
	const [newThreadProjectId, setNewThreadProjectId] = useState<string | null>(
		null,
	);
	const [newThreadDraft, setNewThreadDraft] = useState("");
	const [selectedSuggestionId, setSelectedSuggestionId] = useState<
		string | null
	>(null);

	const wsRef = useRef<WsClient | null>(null);
	const selectedSessionRef = useRef<SessionSelection | null>(selectedSession);
	const sessionsByProjectRef =
		useRef<Record<string, SessionListItem[]>>(sessionsByProject);
	const collapsedRef = useRef<Record<string, boolean>>(collapsedByProjectId);
	const pendingInitialPromptRef = useRef<string | null>(null);

	useEffect(() => {
		selectedSessionRef.current = selectedSession;
	}, [selectedSession]);

	useEffect(() => {
		sessionsByProjectRef.current = sessionsByProject;
	}, [sessionsByProject]);

	useEffect(() => {
		collapsedRef.current = collapsedByProjectId;
	}, [collapsedByProjectId]);

	useEffect(() => {
		writeStorage(STORAGE_KEYS.collapsed, collapsedByProjectId);
	}, [collapsedByProjectId]);

	useEffect(() => {
		writeStorage(STORAGE_KEYS.sidebarWidth, sidebarWidth);
	}, [sidebarWidth]);

	useEffect(() => {
		writeStorage(STORAGE_KEYS.selectedSession, selectedSession);
	}, [selectedSession]);

	useEffect(() => {
		writeStorage(STORAGE_KEYS.pinnedSessions, pinnedSessionIds);
	}, [pinnedSessionIds]);

	useEffect(() => {
		if (!window.desktopApi) {
			setFatalError("Desktop preload API is unavailable.");
			return;
		}

		let active = true;

		void window.desktopApi
			.getBackendConfig()
			.then((config) => {
				if (!active) {
					return;
				}
				setBackendConfig(config);
			})
			.catch((error) => {
				if (!active) {
					return;
				}
				setFatalError(String(error));
			});

		const disposeStatus = window.desktopApi.onSidecarStatus((status) => {
			setServerNotice(status.message);
			if (status.level === "error") {
				setFatalError(status.message);
			}
		});

		return () => {
			active = false;
			disposeStatus();
		};
	}, []);

	const sendMessage = useCallback((message: ClientMessage) => {
		wsRef.current?.send(message);
	}, []);

	const requestSessionListsForExpandedProjects = useCallback(
		(projectList: Project[]) => {
			for (const project of projectList) {
				if (collapsedRef.current[project.id] === true) {
					continue;
				}
				sendMessage({ type: "session:list", projectId: project.id });
			}
		},
		[sendMessage],
	);

	const handleServerMessage = useCallback(
		(message: ServerMessage) => {
			switch (message.type) {
				case "project:list": {
					setProjects(message.projects);
					setSessionsByProject((prev) =>
						ensureProjectSessionBuckets(prev, message.projects),
					);
					setLoadedSessionProjects((prev) => {
						const next: Record<string, boolean> = {};
						for (const project of message.projects) {
							if (prev[project.id]) {
								next[project.id] = true;
							}
						}
						return next;
					});
					requestSessionListsForExpandedProjects(message.projects);
					break;
				}

				case "project:added": {
					setProjects((prev) => {
						if (prev.some((project) => project.id === message.project.id)) {
							return prev;
						}
						return [...prev, message.project];
					});
					setSessionsByProject((prev) => ({
						...prev,
						[message.project.id]: prev[message.project.id] ?? [],
					}));
					if (!collapsedRef.current[message.project.id]) {
						sendMessage({
							type: "session:list",
							projectId: message.project.id,
						});
					}
					break;
				}

				case "project:removed": {
					setProjects((prev) =>
						prev.filter((project) => project.id !== message.projectId),
					);
					setLoadedSessionProjects((prev) => {
						const next = { ...prev };
						delete next[message.projectId];
						return next;
					});
					setSessionsByProject((prev) => {
						const next = { ...prev };
						delete next[message.projectId];
						return next;
					});
					if (selectedSessionRef.current?.projectId === message.projectId) {
						setSelectedSession(null);
						setViewMode("new-thread");
					}
					break;
				}

				case "session:list": {
					const claudeOnly = filterClaudeSessions(message.sessions);
					setLoadedSessionProjects((prev) => ({
						...prev,
						[message.projectId]: true,
					}));
					setSessionsByProject((prev) => ({
						...prev,
						[message.projectId]: claudeOnly,
					}));
					break;
				}

				case "session:created": {
					if (!isClaudeSessionId(message.sessionId)) {
						break;
					}

					const createdSession: SessionListItem = {
						id: message.sessionId,
						projectId: message.projectId,
						title: "New Session",
						lastActiveAt: new Date().toISOString(),
						cliType: "claude-code",
						source: "builder",
						availability: "available",
						providerSessionId: providerSessionIdFromCanonical(
							message.sessionId,
						),
					};

					setSessionsByProject((prev) => {
						const existing = prev[message.projectId] ?? [];
						if (existing.some((session) => session.id === message.sessionId)) {
							return prev;
						}
						return {
							...prev,
							[message.projectId]: [createdSession, ...existing],
						};
					});

					const selection = toSelection(createdSession);
					setSelectedSession(selection);
					setViewMode("thread");

					const pendingPrompt = pendingInitialPromptRef.current;
					pendingInitialPromptRef.current = null;
					setSessionStates((prev) => {
						const base = {
							...withSessionState(prev, message.sessionId),
							isLoadingHistory: true,
							unread: false,
						};
						const optimisticState = pendingPrompt
							? addOptimisticPrompt(prev, message.sessionId, pendingPrompt)[
									message.sessionId
								]
							: undefined;
						return {
							...prev,
							[message.sessionId]: optimisticState ?? base,
						};
					});
					sendMessage({
						type: "session:open",
						sessionId: selection.sessionId,
						projectId: selection.projectId,
					});
					if (pendingPrompt) {
						sendMessage({
							type: "session:send",
							sessionId: message.sessionId,
							content: pendingPrompt,
						});
					}
					break;
				}

				case "session:title-updated": {
					setSessionsByProject((prev) => {
						const next: Record<string, SessionListItem[]> = {};
						for (const [projectId, sessions] of Object.entries(prev)) {
							next[projectId] = sessions.map((session) =>
								session.id === message.sessionId
									? { ...session, title: message.title }
									: session,
							);
						}
						return next;
					});
					break;
				}

				case "session:archived": {
					setSessionsByProject((prev) =>
						removeSessionFromLists(prev, message.sessionId),
					);
					setSessionStates((prev) =>
						archiveWorkspaceSession(prev, message.sessionId),
					);
					setPinnedSessionIds((prev) =>
						prev.filter((candidate) => candidate !== message.sessionId),
					);
					if (selectedSessionRef.current?.sessionId === message.sessionId) {
						setSelectedSession(null);
						setViewMode("new-thread");
					}
					break;
				}

				case "session:history": {
					if (!isClaudeSessionId(message.sessionId)) {
						break;
					}
					setSessionStates((prev) =>
						applyHistoryMessage(
							prev,
							message.sessionId,
							message.entries as UpsertObject[],
							selectedSessionRef.current?.sessionId ?? null,
						),
					);
					break;
				}

				case "session:upsert": {
					if (!isClaudeSessionId(message.sessionId)) {
						break;
					}
					setSessionStates((prev) =>
						applyUpsertMessage(
							prev,
							message.sessionId,
							message.payload as UpsertObject,
							selectedSessionRef.current?.sessionId ?? null,
						),
					);
					break;
				}

				case "session:turn": {
					if (!isClaudeSessionId(message.sessionId)) {
						break;
					}
					setSessionStates((prev) =>
						applyTurnMessage(
							prev,
							message.sessionId,
							message.payload as TurnEvent,
							selectedSessionRef.current?.sessionId ?? null,
						),
					);
					break;
				}

				case "session:error": {
					if (!isClaudeSessionId(message.sessionId)) {
						break;
					}
					setSessionStates((prev) =>
						setSessionError(prev, message.sessionId, message.message),
					);
					break;
				}

				case "agent:status": {
					if (message.cliType === "claude-code") {
						setAgentStatus(message.status);
					}
					break;
				}

				case "error": {
					setServerNotice(message.message);
					break;
				}

				default:
					break;
			}
		},
		[requestSessionListsForExpandedProjects, sendMessage],
	);

	useEffect(() => {
		if (!backendConfig) {
			return;
		}

		const client = new WsClient({
			wsUrl: backendConfig.wsUrl,
			onMessage: handleServerMessage,
			onStateChange: setSocketState,
			onConnected: () => {
				sendMessage({ type: "project:list" });
				const selected = selectedSessionRef.current;
				if (selected && selected.availability === "available") {
					sendMessage({
						type: "session:open",
						sessionId: selected.sessionId,
						projectId: selected.projectId,
					});
				}
			},
		});

		wsRef.current = client;
		client.connect();

		return () => {
			wsRef.current = null;
			client.dispose();
		};
	}, [backendConfig, handleServerMessage, sendMessage]);

	useEffect(() => {
		setPinnedSessionIds((prev) =>
			cleanupPinnedSessionIds(prev, sessionsByProject),
		);
	}, [sessionsByProject]);

	useEffect(() => {
		if (projects.length === 0) {
			setNewThreadProjectId(null);
			return;
		}

		setNewThreadProjectId((current) => {
			if (current && projects.some((project) => project.id === current)) {
				return current;
			}
			return projects[0]?.id ?? null;
		});
	}, [projects]);

	useEffect(() => {
		const current = selectedSessionRef.current;
		if (!current) {
			return;
		}
		if (!loadedSessionProjects[current.projectId]) {
			return;
		}

		const nextSelection = findSessionSelection(
			sessionsByProject,
			current.sessionId,
			current.projectId,
		);
		if (!nextSelection) {
			setSelectedSession(null);
			setViewMode("new-thread");
			return;
		}
		if (
			nextSelection.projectId !== current.projectId ||
			nextSelection.availability !== current.availability ||
			nextSelection.source !== current.source ||
			nextSelection.warningReason !== current.warningReason
		) {
			setSelectedSession(nextSelection);
		}
	}, [loadedSessionProjects, sessionsByProject]);

	const selectSession = (selection: SessionSelection) => {
		setSelectedSession(selection);
		setViewMode("thread");
		if (selection.availability !== "available") {
			return;
		}
		setSessionStates((prev) => setSessionLoading(prev, selection.sessionId));
		sendMessage({
			type: "session:open",
			sessionId: selection.sessionId,
			projectId: selection.projectId,
		});
	};

	const handleAddProject = async () => {
		const selectedPath = await window.desktopApi.pickProjectDirectory();
		if (!selectedPath) {
			return;
		}
		sendMessage({ type: "project:add", path: selectedPath });
	};

	const handleToggleProject = (projectId: string) => {
		setCollapsedByProjectId((prev) => {
			const currentlyCollapsed = prev[projectId] === true;
			const next = {
				...prev,
				[projectId]: !currentlyCollapsed,
			};

			if (currentlyCollapsed) {
				sendMessage({ type: "session:list", projectId });
			}
			return next;
		});
	};

	const handleCreateSession = (projectId: string) => {
		sendMessage(buildCreateSessionMessage(projectId));
	};

	const handleCreateFromNewThread = () => {
		const projectId = newThreadProjectId ?? projects[0]?.id;
		if (!projectId) {
			return;
		}

		const draft = newThreadDraft.trim();
		pendingInitialPromptRef.current = draft.length > 0 ? draft : null;
		setNewThreadDraft("");
		setSelectedSuggestionId(null);
		handleCreateSession(projectId);
	};

	const handleArchiveSession = (sessionId: string) => {
		sendMessage({ type: "session:archive", sessionId });
		setSessionsByProject((prev) => removeSessionFromLists(prev, sessionId));
		setSessionStates((prev) => archiveWorkspaceSession(prev, sessionId));
		setPinnedSessionIds((prev) =>
			prev.filter((candidate) => candidate !== sessionId),
		);
		if (selectedSessionRef.current?.sessionId === sessionId) {
			setSelectedSession(null);
			setViewMode("new-thread");
		}
	};

	const handleSend = (content: string) => {
		const selection = selectedSessionRef.current;
		if (!selection || selection.availability !== "available") {
			return;
		}

		setSessionStates((prev) =>
			addOptimisticPrompt(prev, selection.sessionId, content),
		);

		sendMessage({
			type: "session:send",
			sessionId: selection.sessionId,
			content,
		});
	};

	const handleCancel = () => {
		const selection = selectedSessionRef.current;
		if (!selection) {
			return;
		}
		sendMessage({ type: "session:cancel", sessionId: selection.sessionId });
	};

	const composerSelection = selectedSession
		? (composerBySession[selectedSession.sessionId] ?? {
				model: "claude-default",
				thinking: "adaptive",
			})
		: { model: "claude-default", thinking: "adaptive" };

	const setComposerValue = (partial: { model?: string; thinking?: string }) => {
		const selection = selectedSessionRef.current;
		if (!selection) {
			return;
		}

		setComposerBySession((prev) => ({
			...prev,
			[selection.sessionId]: {
				model:
					partial.model ?? prev[selection.sessionId]?.model ?? "claude-default",
				thinking:
					partial.thinking ?? prev[selection.sessionId]?.thinking ?? "adaptive",
			},
		}));
	};

	const projectNameById = useMemo(
		() => buildProjectNameById(projects),
		[projects],
	);
	const projectPathById = useMemo(
		() => buildProjectPathById(projects),
		[projects],
	);
	const pinnedSessions = useMemo(
		() =>
			buildPinnedSessionViewModels(
				pinnedSessionIds,
				sessionsByProject,
				projectNameById,
			),
		[pinnedSessionIds, sessionsByProject, projectNameById],
	);
	const sessionUiById = useMemo(
		() => buildSessionUiById(sessionStates),
		[sessionStates],
	);
	const workspace = useMemo(
		() =>
			buildWorkspaceView({
				selection: selectedSession,
				sessionsByProject,
				sessionStates,
			}),
		[selectedSession, sessionsByProject, sessionStates],
	);

	const toolbarTitle =
		viewMode === "new-thread" ? "New thread" : workspace?.title || "Thread";
	const toolbarContext =
		viewMode === "new-thread"
			? (projects.find((project) => project.id === newThreadProjectId)?.name ??
				"")
			: workspace
				? (projectNameById[workspace.projectId] ?? "")
				: "";

	return {
		backendConfig,
		fatalError,
		socketState,
		projects,
		sessionsByProject,
		agentStatus,
		collapsedByProjectId,
		sidebarWidth,
		setSidebarWidth,
		selectedSession,
		pinnedSessionIds,
		serverNotice,
		viewMode,
		newThreadProjectId,
		newThreadDraft,
		selectedSuggestionId,
		workspace,
		composerSelection,
		sessionUiById,
		pinnedSessions,
		projectPathById,
		toolbarTitle,
		toolbarContext,
		setNewThreadProjectId,
		setNewThreadDraft,
		setSelectedSuggestionId,
		setViewMode,
		openNewThread: () => {
			setViewMode("new-thread");
			setSelectedSuggestionId(null);
			if (selectedSessionRef.current?.projectId) {
				setNewThreadProjectId(selectedSessionRef.current.projectId);
			}
		},
		addProject: handleAddProject,
		removeProject: (projectId: string) =>
			sendMessage({ type: "project:remove", projectId }),
		toggleProject: handleToggleProject,
		createSession: handleCreateSession,
		selectSession,
		archiveSession: handleArchiveSession,
		markUnread: (sessionId: string) => {
			setSessionStates((prev) => ({
				...prev,
				[sessionId]: {
					...withSessionState(prev, sessionId),
					unread: true,
				},
			}));
		},
		pinSession: (sessionId: string) => {
			setPinnedSessionIds((prev) =>
				prev.includes(sessionId) ? prev : [...prev, sessionId],
			);
		},
		unpinSession: (sessionId: string) => {
			setPinnedSessionIds((prev) =>
				prev.filter((candidate) => candidate !== sessionId),
			);
		},
		createFromNewThread: handleCreateFromNewThread,
		send: handleSend,
		cancel: handleCancel,
		setComposerValue,
	};
}
