import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Project, SessionListItem } from "@renderer/lib/types";
import { relativeTime } from "@renderer/lib/time";
import type { PinnedSessionViewModel } from "@renderer/lib/sidebar-selectors";

type SessionUiState = {
  unread: boolean;
  isStreaming: boolean;
};

interface ProjectSidebarProps {
  projects: Project[];
  sessionsByProject: Record<string, SessionListItem[]>;
  projectPathById: Record<string, string>;
  pinnedSessions: PinnedSessionViewModel[];
  pinnedSessionIds: string[];
  sessionUiById: Record<string, SessionUiState>;
  collapsedByProjectId: Record<string, boolean>;
  selectedSessionId: string | null;
  onOpenNewThread: () => void;
  onAddProject: () => void;
  onRemoveProject: (projectId: string) => void;
  onToggleProject: (projectId: string) => void;
  onCreateSession: (projectId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
  onMarkUnread: (sessionId: string) => void;
  onPinSession: (sessionId: string) => void;
  onUnpinSession: (sessionId: string) => void;
}

interface SessionRowProps {
  session: SessionListItem;
  selected: boolean;
  ui: SessionUiState;
  pinned: boolean;
  subtitle?: string;
  onSelect: () => void;
  onArchive: () => void;
  onTogglePin: () => void;
  onOpenContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

type ContextMenuState = {
  session: SessionListItem;
  pinned: boolean;
  projectId: string | null;
  x: number;
  y: number;
};

function findProjectIdForSession(
  sessionsByProject: Record<string, SessionListItem[]>,
  sessionId: string,
): string | null {
  for (const [projectId, sessions] of Object.entries(sessionsByProject)) {
    if (sessions.some((session) => session.id === sessionId)) {
      return projectId;
    }
  }
  return null;
}

function SessionRow({
  session,
  selected,
  ui,
  pinned,
  subtitle,
  onSelect,
  onArchive,
  onTogglePin,
  onOpenContextMenu,
}: SessionRowProps) {
  return (
    <div
      className={`lb-session-row ${selected ? "is-selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onContextMenu={onOpenContextMenu}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="lb-session-mainline">
        <div className="lb-session-text">
          <p className="lb-session-title" title={session.title}>
            {session.title}
          </p>
          {subtitle ? <p className="lb-session-subtitle">{subtitle}</p> : null}
          <p className="lb-session-meta">
            {ui.isStreaming ? <span className="lb-state-dot is-streaming" /> : null}
            {ui.unread ? <span className="lb-state-dot is-unread" /> : null}
          </p>
        </div>
        <span className="lb-session-time">{relativeTime(session.lastActiveAt)}</span>
      </div>

      <div className="lb-session-actions">
        <button
          type="button"
          className={`lb-quick-icon-btn ${pinned ? "is-active" : ""}`}
          aria-label={pinned ? "Unpin thread" : "Pin thread"}
          title={pinned ? "Unpin thread" : "Pin thread"}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePin();
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6.7 2.4a.9.9 0 0 1 1.6-.7l4 4a.9.9 0 0 1-.7 1.6l-1.8-.2-2.1 2.1.2 1.8a.9.9 0 0 1-1.6.7l-4-4a.9.9 0 0 1 .7-1.6l1.8.2L6.9 4.2l-.2-1.8Z" />
          </svg>
        </button>
        <button
          type="button"
          className="lb-quick-icon-btn"
          aria-label="Archive thread"
          title="Archive thread"
          onClick={(event) => {
            event.stopPropagation();
            onArchive();
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="2" y="3" width="12" height="3" rx="1.2" />
            <rect x="3" y="6.5" width="10" height="7.5" rx="1.2" />
            <rect x="6" y="8.7" width="4" height="1.4" rx="0.6" className="lb-quick-cutout" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function ProjectSidebar({
  projects,
  sessionsByProject,
  projectPathById,
  pinnedSessions,
  pinnedSessionIds,
  sessionUiById,
  collapsedByProjectId,
  selectedSessionId,
  onOpenNewThread,
  onAddProject,
  onRemoveProject,
  onToggleProject,
  onCreateSession,
  onSelectSession,
  onArchiveSession,
  onMarkUnread,
  onPinSession,
  onUnpinSession,
}: ProjectSidebarProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const contextProjectPath = useMemo(() => {
    if (!contextMenu?.projectId) {
      return null;
    }
    return projectPathById[contextMenu.projectId] ?? null;
  }, [contextMenu, projectPathById]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => {
      setContextMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Ignore clipboard failures in prototype mode.
    }
  };

  return (
    <aside className="lb-sidebar">
      <div className="lb-sidebar-primary">
        <button type="button" className="lb-primary-item" onClick={onOpenNewThread}>
          <span className="lb-leading-icon">✎</span>
          <span>New thread</span>
        </button>
        <button type="button" className="lb-primary-item is-visual-only" tabIndex={-1}>
          <span className="lb-leading-icon">◷</span>
          <span>Automations</span>
        </button>
        <button type="button" className="lb-primary-item is-visual-only" tabIndex={-1}>
          <span className="lb-leading-icon">◌</span>
          <span>Skills</span>
        </button>
      </div>

      <div className="lb-sidebar-scroll">
        {pinnedSessions.length > 0 ? (
          <section className="lb-sidebar-section">
            <h3 className="lb-sidebar-section-title">Pinned</h3>
            <div className="lb-session-stack">
              {pinnedSessions.map((entry) => (
                <SessionRow
                  key={entry.session.id}
                  session={entry.session}
                  selected={selectedSessionId === entry.session.id}
                  ui={
                    sessionUiById[entry.session.id] ?? {
                      unread: false,
                      isStreaming: false,
                    }
                  }
                  subtitle={entry.projectName}
                  pinned
                  onSelect={() => onSelectSession(entry.session.id)}
                  onArchive={() => onArchiveSession(entry.session.id)}
                  onTogglePin={() => onUnpinSession(entry.session.id)}
                  onOpenContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({
                      session: entry.session,
                      pinned: true,
                      projectId: entry.projectId,
                      x: event.clientX,
                      y: event.clientY,
                    });
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="lb-sidebar-section">
          <div className="lb-threads-header">
            <h3 className="lb-sidebar-section-title">Threads</h3>
            <div className="lb-threads-header-actions">
              <button
                type="button"
                className="lb-row-icon-btn"
                onClick={onAddProject}
                aria-label="Add new project"
                title="Add new project"
              >
                ⊕
              </button>
              <button
                type="button"
                className="lb-row-icon-btn"
                aria-label="Filter, sort, and organize threads"
                title="Filter, sort, and organize threads"
              >
                ≡
              </button>
            </div>
          </div>

          <div className="lb-project-stack">
            {projects.map((project) => {
              const collapsed = collapsedByProjectId[project.id] === true;
              const sessions = sessionsByProject[project.id] ?? [];

              return (
                <section className="lb-project-group" key={project.id}>
                  <div className="lb-project-header-row">
                    <button
                      type="button"
                      className="lb-project-header"
                      onClick={() => onToggleProject(project.id)}
                    >
                      <span className="lb-project-disclosure">{collapsed ? "▸" : "▾"}</span>
                      <span className="lb-project-folder">▢</span>
                      <span className="lb-project-name" title={project.path}>
                        {project.name}
                      </span>
                    </button>
                    <div className="lb-project-actions">
                      <button
                        type="button"
                        className="lb-row-icon-btn"
                        title="New thread in project"
                        aria-label="New thread in project"
                        onClick={() => onCreateSession(project.id)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="lb-row-icon-btn"
                        title="Remove project"
                        aria-label="Remove project"
                        onClick={() => onRemoveProject(project.id)}
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {!collapsed ? (
                    <div className="lb-session-stack">
                      {sessions.map((session) => {
                        const pinned = pinnedSessionIds.includes(session.id);
                        return (
                          <SessionRow
                            key={session.id}
                            session={session}
                            selected={selectedSessionId === session.id}
                            ui={
                              sessionUiById[session.id] ?? {
                                unread: false,
                                isStreaming: false,
                              }
                            }
                            pinned={pinned}
                            onSelect={() => onSelectSession(session.id)}
                            onArchive={() => onArchiveSession(session.id)}
                            onTogglePin={() =>
                              pinned ? onUnpinSession(session.id) : onPinSession(session.id)
                            }
                            onOpenContextMenu={(event) => {
                              event.preventDefault();
                              setContextMenu({
                                session,
                                pinned,
                                projectId: project.id,
                                x: event.clientX,
                                y: event.clientY,
                              });
                            }}
                          />
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        </section>
      </div>

      {contextMenu ? (
        <div
          className="lb-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="lb-context-item"
            onClick={() => {
              if (contextMenu.pinned) {
                onUnpinSession(contextMenu.session.id);
              } else {
                onPinSession(contextMenu.session.id);
              }
              setContextMenu(null);
            }}
          >
            {contextMenu.pinned ? "Unpin thread" : "Pin thread"}
          </button>
          <button type="button" className="lb-context-item" disabled>
            Rename thread
          </button>
          <button
            type="button"
            className="lb-context-item"
            onClick={() => {
              onArchiveSession(contextMenu.session.id);
              setContextMenu(null);
            }}
          >
            Archive thread
          </button>
          <button
            type="button"
            className="lb-context-item"
            onClick={() => {
              onMarkUnread(contextMenu.session.id);
              setContextMenu(null);
            }}
          >
            Mark as unread
          </button>

          <div className="lb-context-separator" />

          <button
            type="button"
            className="lb-context-item"
            disabled={!contextProjectPath}
            onClick={() => {
              if (contextProjectPath) {
                void copyToClipboard(contextProjectPath);
              }
              setContextMenu(null);
            }}
          >
            Copy working directory
          </button>
          <button
            type="button"
            className="lb-context-item"
            onClick={() => {
              void copyToClipboard(contextMenu.session.id);
              setContextMenu(null);
            }}
          >
            Copy session ID
          </button>
          <button
            type="button"
            className="lb-context-item"
            onClick={() => {
              void copyToClipboard(`lb://session/${contextMenu.session.id}`);
              setContextMenu(null);
            }}
          >
            Copy deeplink
          </button>

          <div className="lb-context-separator" />

          <button type="button" className="lb-context-item" disabled>
            Fork into local
          </button>
          <button type="button" className="lb-context-item" disabled>
            Fork into new worktree
          </button>
        </div>
      ) : null}
    </aside>
  );
}
