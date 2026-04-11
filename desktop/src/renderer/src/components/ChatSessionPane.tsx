import { useMemo, useState } from "react";
import type { AgentStatus, SessionWorkspaceView } from "@renderer/lib/types";
import { TranscriptView } from "./transcript/TranscriptView";

const CLAUDE_MODEL_OPTIONS = [
	{ value: "claude-default", label: "Claude (default)" },
	{ value: "claude-sonnet", label: "Claude Sonnet" },
	{ value: "claude-opus", label: "Claude Opus" },
];

const THINKING_OPTIONS = [
	{ value: "adaptive", label: "Thinking: adaptive" },
	{ value: "low", label: "Thinking: low" },
	{ value: "medium", label: "Thinking: medium" },
	{ value: "high", label: "Thinking: high" },
];

interface ChatSessionPaneProps {
	workspace: SessionWorkspaceView | null;
	agentStatus: AgentStatus;
	modelValue: string;
	thinkingValue: string;
	onModelChange: (value: string) => void;
	onThinkingChange: (value: string) => void;
	onSend: (content: string) => void;
	onCancel: () => void;
}

export function ChatSessionPane({
	workspace,
	agentStatus,
	modelValue,
	thinkingValue,
	onModelChange,
	onThinkingChange,
	onSend,
	onCancel,
}: ChatSessionPaneProps) {
	const [draft, setDraft] = useState("");
	const sessionId = workspace?.sessionId ?? null;
	const state = workspace?.renderState ?? null;
	const isUnavailable = workspace?.status === "unavailable";

	const canSend = useMemo(() => {
		if (!sessionId || !state || !workspace) {
			return false;
		}
		if (
			workspace.status !== "ready" ||
			state.isStreaming ||
			agentStatus !== "connected"
		) {
			return false;
		}
		return draft.trim().length > 0;
	}, [sessionId, state, workspace, agentStatus, draft]);

	if (!workspace || !sessionId || !state) {
		return (
			<section className="lb-chat-empty">
				<p className="lb-chat-empty-title">Select a thread from the left</p>
			</section>
		);
	}

	const handleSubmit = () => {
		const trimmed = draft.trim();
		if (trimmed.length === 0) {
			return;
		}
		onSend(trimmed);
		setDraft("");
	};

	return (
		<section className="lb-thread-pane">
			<TranscriptView
				turns={state.turns}
				isLoadingHistory={state.isLoadingHistory}
				errorMessage={workspace.status === "error" ? state.errorMessage : null}
				agentStatus={agentStatus}
			/>

			{isUnavailable ? (
				<div className="lb-thread-state-banner">
					{workspace.warningReason ?? "This session is unavailable."}
				</div>
			) : null}

			<footer className="lb-thread-composer">
				<textarea
					value={draft}
					className="lb-composer-input"
					placeholder="Message Claude Code..."
					rows={3}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							handleSubmit();
						}
					}}
					disabled={
						isUnavailable || state.isStreaming || agentStatus !== "connected"
					}
				/>

				<div className="lb-composer-bottom-row">
					<div className="lb-composer-meta-cluster">
						<span className="lb-chip lb-chip-brand">Claude Code</span>
						<label>
							<span className="lb-visually-hidden">Model picker</span>
							<select
								className="lb-chip-select"
								value={modelValue}
								onChange={(event) => onModelChange(event.target.value)}
							>
								{CLAUDE_MODEL_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>
						<label>
							<span className="lb-visually-hidden">Thinking picker</span>
							<select
								className="lb-chip-select"
								value={thinkingValue}
								onChange={(event) => onThinkingChange(event.target.value)}
							>
								{THINKING_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>
					</div>

					<div className="lb-composer-actions">
						<button
							type="button"
							className="lb-subtle-btn"
							onClick={onCancel}
							disabled={isUnavailable || !state.isStreaming}
						>
							Cancel
						</button>
						<button
							type="button"
							className="lb-send-circle"
							onClick={handleSubmit}
							disabled={!canSend}
							aria-label="Send"
						>
							↑
						</button>
					</div>
				</div>
			</footer>
		</section>
	);
}
