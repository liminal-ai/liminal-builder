import { useEffect, useMemo, useRef, useState } from "react";
import { AppToolbar } from "@renderer/components/AppToolbar";
import { ChatSessionPane } from "@renderer/components/ChatSessionPane";
import { NewThreadScreen } from "@renderer/components/NewThreadScreen";
import { ProjectSidebar } from "@renderer/components/ProjectSidebar";
import {
  addOptimisticUserEntry,
  applyTurnEvent,
  applyUpsert,
  applyUpsertHistory,
  createEmptySessionState,
} from "@renderer/lib/chat-state";
import { buildCreateSessionMessage } from "@renderer/lib/messages";
import { filterClaudeSessions } from "@renderer/lib/session-utils";
import {
  buildPinnedSessionViewModels,
  cleanupPinnedSessionIds,
} from "@renderer/lib/sidebar-selectors";
import {
  type ClientMessage,
  type Project,
  type ServerMessage,
  type SessionListItem,
  type SessionRenderState,
  type TurnEvent,
  type UpsertObject,
} from "@renderer/lib/types";
import { WsClient } from "@renderer/lib/ws-client";

const STORAGE_KEYS = {
  collapsed: "lb:desktop:collapsed",
  sidebarWidth: "lb:desktop:sidebar-width",
  selectedSession: "lb:desktop:selected-session",
  pinnedSessions: "lb:desktop:pinned-sessions",
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures.
  }
}

function isClaudeSessionId(sessionId: string): boolean {
  return sessionId.startsWith("claude-code:");
}

function findProjectForSession(
  sessionId: string,
  sessionsByProject: Record<string, SessionListItem[]>,
): string | null {
  for (const [projectId, sessions] of Object.entries(sessionsByProject)) {
    if (sessions.some((session) => session.id === sessionId)) {
      return projectId;
    }
  }
  return null;
}

function withSessionState(
  current: Record<string, SessionRenderState>,
  sessionId: string,
): SessionRenderState {
  return current[sessionId] ?? createEmptySessionState();
}

export function App() {
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
  const [sessionsByProject, setSessionsByProject] = useState<Record<string, SessionListItem[]>>({});
  const [sessionStates, setSessionStates] = useState<Record<string, SessionRenderState>>({});
  const [agentStatus, setAgentStatus] = useState<
    "starting" | "connected" | "disconnected" | "reconnecting"
  >("starting");
  const [collapsedByProjectId, setCollapsedByProjectId] = useState<Record<string, boolean>>(() =>
    readStorage<Record<string, boolean>>(STORAGE_KEYS.collapsed, {}),
  );
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    readStorage<number>(STORAGE_KEYS.sidebarWidth, 352),
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(() =>
    readStorage<string | null>(STORAGE_KEYS.selectedSession, null),
  );
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>(() =>
    readStorage<string[]>(STORAGE_KEYS.pinnedSessions, []),
  );
  const [composerBySession, setComposerBySession] = useState<
    Record<string, { model: string; thinking: string }>
  >({});
  const [serverNotice, setServerNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"thread" | "new-thread">(
    selectedSessionId ? "thread" : "new-thread",
  );
  const [newThreadProjectId, setNewThreadProjectId] = useState<string | null>(null);
  const [newThreadDraft, setNewThreadDraft] = useState("");
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);

  const wsRef = useRef<WsClient | null>(null);
  const selectedSessionRef = useRef<string | null>(selectedSessionId);
  const sessionsByProjectRef = useRef<Record<string, SessionListItem[]>>(sessionsByProject);
  const collapsedRef = useRef<Record<string, boolean>>(collapsedByProjectId);
  const isResizingRef = useRef(false);
  const pendingInitialPromptRef = useRef<string | null>(null);

  useEffect(() => {
    selectedSessionRef.current = selectedSessionId;
  }, [selectedSessionId]);

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
    writeStorage(STORAGE_KEYS.selectedSession, selectedSessionId);
  }, [selectedSessionId]);

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

  const sendMessage = (message: ClientMessage) => {
    wsRef.current?.send(message);
  };

  const requestSessionListsForExpandedProjects = (projectList: Project[]) => {
    for (const project of projectList) {
      if (collapsedRef.current[project.id] === true) {
        continue;
      }
      sendMessage({ type: "session:list", projectId: project.id });
    }
  };

  const handleServerMessage = (message: ServerMessage) => {
    switch (message.type) {
      case "project:list": {
        setProjects(message.projects);
        setSessionsByProject((prev) => {
          const next: Record<string, SessionListItem[]> = {};
          for (const project of message.projects) {
            next[project.id] = prev[project.id] ?? [];
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
          sendMessage({ type: "session:list", projectId: message.project.id });
        }
        break;
      }

      case "project:removed": {
        const activeProjectId = selectedSessionRef.current
          ? findProjectForSession(selectedSessionRef.current, sessionsByProjectRef.current)
          : null;
        setProjects((prev) => prev.filter((project) => project.id !== message.projectId));
        setSessionsByProject((prev) => {
          const next = { ...prev };
          delete next[message.projectId];
          return next;
        });
        if (activeProjectId === message.projectId) {
          setSelectedSessionId(null);
          setViewMode("new-thread");
        }
        break;
      }

      case "session:list": {
        const claudeOnly = filterClaudeSessions(message.sessions);
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

        setSessionsByProject((prev) => {
          const existing = prev[message.projectId] ?? [];
          if (existing.some((session) => session.id === message.sessionId)) {
            return prev;
          }
          return {
            ...prev,
            [message.projectId]: [
              {
                id: message.sessionId,
                title: "New Session",
                lastActiveAt: new Date().toISOString(),
                cliType: "claude-code",
              },
              ...existing,
            ],
          };
        });

        setSelectedSessionId(message.sessionId);
        setViewMode("thread");
        const pendingPrompt = pendingInitialPromptRef.current;
        pendingInitialPromptRef.current = null;
        setSessionStates((prev) => {
          const base = {
            ...withSessionState(prev, message.sessionId),
            isLoadingHistory: true,
            unread: false,
          };
          return {
            ...prev,
            [message.sessionId]: pendingPrompt ? addOptimisticUserEntry(base, pendingPrompt) : base,
          };
        });
        sendMessage({ type: "session:open", sessionId: message.sessionId, projectId: message.projectId });
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
              session.id === message.sessionId ? { ...session, title: message.title } : session,
            );
          }
          return next;
        });
        break;
      }

      case "session:archived": {
        setSessionsByProject((prev) => {
          const next: Record<string, SessionListItem[]> = {};
          for (const [projectId, sessions] of Object.entries(prev)) {
            next[projectId] = sessions.filter((session) => session.id !== message.sessionId);
          }
          return next;
        });
        setSessionStates((prev) => {
          const next = { ...prev };
          delete next[message.sessionId];
          return next;
        });
        setPinnedSessionIds((prev) => prev.filter((candidate) => candidate !== message.sessionId));
        if (selectedSessionRef.current === message.sessionId) {
          setSelectedSessionId(null);
          setViewMode("new-thread");
        }
        break;
      }

      case "session:history": {
        if (!isClaudeSessionId(message.sessionId)) {
          break;
        }
        setSessionStates((prev) => {
          const current = withSessionState(prev, message.sessionId);
          const nextState = applyUpsertHistory(current, message.entries as UpsertObject[]);
          nextState.unread = selectedSessionRef.current !== message.sessionId;
          return {
            ...prev,
            [message.sessionId]: nextState,
          };
        });
        break;
      }

      case "session:upsert": {
        if (!isClaudeSessionId(message.sessionId)) {
          break;
        }
        setSessionStates((prev) => {
          const current = withSessionState(prev, message.sessionId);
          const nextState = applyUpsert(current, message.payload as UpsertObject);
          nextState.unread = selectedSessionRef.current !== message.sessionId;
          return {
            ...prev,
            [message.sessionId]: nextState,
          };
        });
        break;
      }

      case "session:turn": {
        if (!isClaudeSessionId(message.sessionId)) {
          break;
        }
        setSessionStates((prev) => {
          const current = withSessionState(prev, message.sessionId);
          const nextState = applyTurnEvent(current, message.payload as TurnEvent);
          nextState.unread =
            selectedSessionRef.current !== message.sessionId && nextState.unread;
          return {
            ...prev,
            [message.sessionId]: nextState,
          };
        });
        break;
      }

      case "session:error": {
        if (!isClaudeSessionId(message.sessionId)) {
          break;
        }
        setSessionStates((prev) => ({
          ...prev,
          [message.sessionId]: {
            ...withSessionState(prev, message.sessionId),
            isLoadingHistory: false,
            isStreaming: false,
            errorMessage: message.message,
          },
        }));
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
  };

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
        if (selected) {
          sendMessage({ type: "session:open", sessionId: selected });
        }
      },
    });

    wsRef.current = client;
    client.connect();

    return () => {
      wsRef.current = null;
      client.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendConfig?.wsUrl]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current) {
        return;
      }
      const nextWidth = Math.max(280, Math.min(460, event.clientX));
      setSidebarWidth(nextWidth);
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    setPinnedSessionIds((prev) => cleanupPinnedSessionIds(prev, sessionsByProject));
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

  const openSession = (sessionId: string) => {
    if (!isClaudeSessionId(sessionId)) {
      return;
    }

    setSelectedSessionId(sessionId);
    setViewMode("thread");
    setSessionStates((prev) => ({
      ...prev,
      [sessionId]: {
        ...withSessionState(prev, sessionId),
        isLoadingHistory: true,
        unread: false,
        errorMessage: null,
      },
    }));
    sendMessage({ type: "session:open", sessionId });
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

  const handleRemoveProject = (projectId: string) => {
    sendMessage({ type: "project:remove", projectId });
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
    setSessionsByProject((prev) => {
      const next: Record<string, SessionListItem[]> = {};
      for (const [projectId, sessions] of Object.entries(prev)) {
        next[projectId] = sessions.filter((session) => session.id !== sessionId);
      }
      return next;
    });
    setSessionStates((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setPinnedSessionIds((prev) => prev.filter((candidate) => candidate !== sessionId));
    if (selectedSessionRef.current === sessionId) {
      setSelectedSessionId(null);
      setViewMode("new-thread");
    }
  };

  const handleSend = (content: string) => {
    const sessionId = selectedSessionRef.current;
    if (!sessionId) {
      return;
    }

    setSessionStates((prev) => ({
      ...prev,
      [sessionId]: addOptimisticUserEntry(withSessionState(prev, sessionId), content),
    }));

    sendMessage({
      type: "session:send",
      sessionId,
      content,
    });
  };

  const handleCancel = () => {
    const sessionId = selectedSessionRef.current;
    if (!sessionId) {
      return;
    }
    sendMessage({ type: "session:cancel", sessionId });
  };

  const selectedSessionTitle = useMemo(() => {
    if (!selectedSessionId) {
      return "";
    }
    const projectId = findProjectForSession(selectedSessionId, sessionsByProject);
    if (!projectId) {
      return "";
    }
    const session = sessionsByProject[projectId]?.find((candidate) => candidate.id === selectedSessionId);
    return session?.title ?? "";
  }, [selectedSessionId, sessionsByProject]);

  const selectedSessionProjectId = useMemo(() => {
    if (!selectedSessionId) {
      return null;
    }
    return findProjectForSession(selectedSessionId, sessionsByProject);
  }, [selectedSessionId, sessionsByProject]);

  const selectedSessionState = selectedSessionId ? sessionStates[selectedSessionId] ?? null : null;

  const sessionUiById = useMemo(() => {
    const next: Record<string, { unread: boolean; isStreaming: boolean }> = {};
    for (const [sessionId, state] of Object.entries(sessionStates)) {
      next[sessionId] = {
        unread: state.unread,
        isStreaming: state.isStreaming,
      };
    }
    return next;
  }, [sessionStates]);

  const composerSelection = selectedSessionId
    ? composerBySession[selectedSessionId] ?? { model: "claude-default", thinking: "adaptive" }
    : { model: "claude-default", thinking: "adaptive" };

  const setComposerValue = (partial: { model?: string; thinking?: string }) => {
    const sessionId = selectedSessionRef.current;
    if (!sessionId) {
      return;
    }

    setComposerBySession((prev) => ({
      ...prev,
      [sessionId]: {
        model: partial.model ?? prev[sessionId]?.model ?? "claude-default",
        thinking: partial.thinking ?? prev[sessionId]?.thinking ?? "adaptive",
      },
    }));
  };

  const projectNameById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const project of projects) {
      next[project.id] = project.name;
    }
    return next;
  }, [projects]);

  const projectPathById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const project of projects) {
      next[project.id] = project.path;
    }
    return next;
  }, [projects]);

  const pinnedSessions = useMemo(
    () => buildPinnedSessionViewModels(pinnedSessionIds, sessionsByProject, projectNameById),
    [pinnedSessionIds, sessionsByProject, projectNameById],
  );

  const toolbarTitle = viewMode === "new-thread" ? "New thread" : selectedSessionTitle || "Thread";
  const toolbarContext =
    viewMode === "new-thread"
      ? (projects.find((project) => project.id === newThreadProjectId)?.name ?? "")
      : (selectedSessionProjectId ? projectNameById[selectedSessionProjectId] : "");

  if (fatalError) {
    return (
      <main className="lb-fatal">
        <h1>Desktop startup error</h1>
        <p>{fatalError}</p>
      </main>
    );
  }

  return (
    <div className="lb-shell">
      <AppToolbar title={toolbarTitle} context={toolbarContext} sidebarWidth={sidebarWidth} />

      <div className="lb-main">
        <div className="lb-sidebar-wrap" style={{ width: `${sidebarWidth}px` }}>
          <ProjectSidebar
            projects={projects}
            sessionsByProject={sessionsByProject}
            projectPathById={projectPathById}
            pinnedSessions={pinnedSessions}
            pinnedSessionIds={pinnedSessionIds}
            sessionUiById={sessionUiById}
            collapsedByProjectId={collapsedByProjectId}
            selectedSessionId={selectedSessionId}
            onOpenNewThread={() => {
              setViewMode("new-thread");
              setSelectedSuggestionId(null);
              if (selectedSessionProjectId) {
                setNewThreadProjectId(selectedSessionProjectId);
              }
            }}
            onAddProject={handleAddProject}
            onRemoveProject={handleRemoveProject}
            onToggleProject={handleToggleProject}
            onCreateSession={handleCreateSession}
            onSelectSession={openSession}
            onArchiveSession={handleArchiveSession}
            onMarkUnread={(sessionId) => {
              setSessionStates((prev) => ({
                ...prev,
                [sessionId]: {
                  ...withSessionState(prev, sessionId),
                  unread: true,
                },
              }));
            }}
            onPinSession={(sessionId) => {
              setPinnedSessionIds((prev) =>
                prev.includes(sessionId) ? prev : [...prev, sessionId],
              );
            }}
            onUnpinSession={(sessionId) => {
              setPinnedSessionIds((prev) =>
                prev.filter((candidate) => candidate !== sessionId),
              );
            }}
          />
        </div>

        <div
          className="lb-sidebar-resizer"
          onMouseDown={() => {
            isResizingRef.current = true;
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />

        <div className="lb-content-wrap">
          {viewMode === "new-thread" ? (
            <NewThreadScreen
              projects={projects}
              selectedProjectId={newThreadProjectId}
              draft={newThreadDraft}
              selectedSuggestionId={selectedSuggestionId}
              onProjectSelect={(projectId) => setNewThreadProjectId(projectId)}
              onDraftChange={(value) => {
                setNewThreadDraft(value);
                if (!value.trim()) {
                  setSelectedSuggestionId(null);
                }
              }}
              onSuggestionClick={(suggestion) => {
                setNewThreadDraft(suggestion.prompt);
                setSelectedSuggestionId(suggestion.id);
              }}
              onCreateThread={handleCreateFromNewThread}
            />
          ) : (
            <ChatSessionPane
              sessionId={selectedSessionId}
              state={selectedSessionState}
              agentStatus={agentStatus}
              modelValue={composerSelection.model}
              thinkingValue={composerSelection.thinking}
              onModelChange={(value) => setComposerValue({ model: value })}
              onThinkingChange={(value) => setComposerValue({ thinking: value })}
              onSend={handleSend}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>

      <footer className="lb-footer-note">
        <span>{serverNotice ?? `Sidecar ${backendConfig?.httpUrl ?? ""}`}</span>
        <span>Socket {socketState} · Claude-only desktop mode</span>
      </footer>
    </div>
  );
}
