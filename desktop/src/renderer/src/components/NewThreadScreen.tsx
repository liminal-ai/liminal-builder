import { useMemo } from "react";
import type { Project } from "@renderer/lib/types";

export interface SuggestionCard {
  id: string;
  title: string;
  prompt: string;
  icon: string;
}

interface NewThreadScreenProps {
  projects: Project[];
  selectedProjectId: string | null;
  draft: string;
  selectedSuggestionId: string | null;
  onProjectSelect: (projectId: string) => void;
  onDraftChange: (value: string) => void;
  onCreateThread: () => void;
  onSuggestionClick: (suggestion: SuggestionCard) => void;
}

export const SUGGESTION_CARDS: SuggestionCard[] = [
  {
    id: "snake",
    icon: "🎮",
    title: "Build a classic Snake game in this repo.",
    prompt:
      "Build a classic Snake game in this repo. Include keyboard controls, score tracking, and restart support.",
  },
  {
    id: "summary",
    icon: "📄",
    title: "Create a one-page summary of this app.",
    prompt:
      "Create a one-page summary of this app with architecture, key features, and current technical debt.",
  },
  {
    id: "plan",
    icon: "✏️",
    title: "Create a plan to improve the UI polish.",
    prompt:
      "Create a staged implementation plan to improve UI polish with acceptance criteria and test checklist.",
  },
];

export function NewThreadScreen({
  projects,
  selectedProjectId,
  draft,
  selectedSuggestionId,
  onProjectSelect,
  onDraftChange,
  onCreateThread,
  onSuggestionClick,
}: NewThreadScreenProps) {
  const selectedProjectName = useMemo(() => {
    const selected = projects.find((project) => project.id === selectedProjectId);
    return selected?.name ?? "Select project";
  }, [projects, selectedProjectId]);

  return (
    <section className="lb-new-thread-screen">
      <div className="lb-new-thread-content">
        <p className="lb-new-thread-label">New thread</p>
        <h2 className="lb-new-thread-title">Let's build</h2>

        <label className="lb-project-picker-shell" htmlFor="lb-project-picker">
          <span className="lb-project-picker-selected">{selectedProjectName}</span>
          <span className="lb-toolbar-chevron">▾</span>
          <select
            id="lb-project-picker"
            className="lb-project-picker"
            value={selectedProjectId ?? ""}
            onChange={(event) => onProjectSelect(event.target.value)}
          >
            <option value="" disabled>
              Select your project
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <div className="lb-suggestion-row">
          {SUGGESTION_CARDS.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              className={`lb-suggestion-card ${selectedSuggestionId === suggestion.id ? "is-selected" : ""}`}
              onClick={() => onSuggestionClick(suggestion)}
            >
              <span className="lb-suggestion-icon">{suggestion.icon}</span>
              <span className="lb-suggestion-title">{suggestion.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="lb-new-thread-composer-wrap">
        <div className="lb-new-thread-composer">
          <textarea
            className="lb-composer-input"
            value={draft}
            placeholder="Ask Claude anything, @ to add files, / for commands"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onCreateThread();
              }
            }}
            rows={3}
          />

          <div className="lb-composer-bottom-row">
            <div className="lb-composer-meta-cluster">
              <span className="lb-chip lb-chip-brand">Claude Code</span>
              <span className="lb-chip">Thinking: adaptive</span>
            </div>
            <button
              type="button"
              className="lb-send-circle"
              onClick={onCreateThread}
              disabled={!selectedProjectId}
              aria-label="Create thread"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
