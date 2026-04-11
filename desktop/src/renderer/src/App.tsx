import { useEffect, useRef } from "react";
import { AppToolbar } from "@renderer/components/AppToolbar";
import { ChatSessionPane } from "@renderer/components/ChatSessionPane";
import { NewThreadScreen } from "@renderer/components/NewThreadScreen";
import { ProjectSidebar } from "@renderer/components/ProjectSidebar";
import { useDesktopSessionController } from "@renderer/state/useDesktopSessionController";

export function App() {
	const controller = useDesktopSessionController();
	const isResizingRef = useRef(false);
	const { setSidebarWidth, sidebarWidth } = controller;

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
	}, [setSidebarWidth]);

	if (controller.fatalError) {
		return (
			<main className="lb-fatal">
				<h1>Desktop startup error</h1>
				<p>{controller.fatalError}</p>
			</main>
		);
	}

	return (
		<div className="lb-shell">
			<AppToolbar
				title={controller.toolbarTitle}
				context={controller.toolbarContext}
				sidebarWidth={controller.sidebarWidth}
			/>

			<div className="lb-main">
				<div className="lb-sidebar-wrap" style={{ width: `${sidebarWidth}px` }}>
					<ProjectSidebar
						projects={controller.projects}
						sessionsByProject={controller.sessionsByProject}
						projectPathById={controller.projectPathById}
						pinnedSessions={controller.pinnedSessions}
						pinnedSessionIds={controller.pinnedSessionIds}
						sessionUiById={controller.sessionUiById}
						collapsedByProjectId={controller.collapsedByProjectId}
						selectedSessionId={controller.selectedSession?.sessionId ?? null}
						onOpenNewThread={controller.openNewThread}
						onAddProject={controller.addProject}
						onRemoveProject={controller.removeProject}
						onToggleProject={controller.toggleProject}
						onCreateSession={controller.createSession}
						onSelectSession={controller.selectSession}
						onArchiveSession={controller.archiveSession}
						onMarkUnread={controller.markUnread}
						onPinSession={controller.pinSession}
						onUnpinSession={controller.unpinSession}
					/>
				</div>

				<button
					type="button"
					className="lb-sidebar-resizer"
					onMouseDown={() => {
						isResizingRef.current = true;
					}}
					aria-label="Resize sidebar"
					onKeyDown={(event) => {
						if (event.key === "ArrowLeft") {
							event.preventDefault();
							setSidebarWidth(Math.max(280, sidebarWidth - 16));
						}
						if (event.key === "ArrowRight") {
							event.preventDefault();
							setSidebarWidth(Math.min(460, sidebarWidth + 16));
						}
					}}
				/>

				<div className="lb-content-wrap">
					{controller.viewMode === "new-thread" ? (
						<NewThreadScreen
							projects={controller.projects}
							selectedProjectId={controller.newThreadProjectId}
							draft={controller.newThreadDraft}
							selectedSuggestionId={controller.selectedSuggestionId}
							onProjectSelect={controller.setNewThreadProjectId}
							onDraftChange={(value) => {
								controller.setNewThreadDraft(value);
								if (!value.trim()) {
									controller.setSelectedSuggestionId(null);
								}
							}}
							onSuggestionClick={(suggestion) => {
								controller.setNewThreadDraft(suggestion.prompt);
								controller.setSelectedSuggestionId(suggestion.id);
							}}
							onCreateThread={controller.createFromNewThread}
						/>
					) : (
						<ChatSessionPane
							workspace={controller.workspace}
							agentStatus={controller.agentStatus}
							modelValue={controller.composerSelection.model}
							thinkingValue={controller.composerSelection.thinking}
							onModelChange={(value) =>
								controller.setComposerValue({ model: value })
							}
							onThinkingChange={(value) =>
								controller.setComposerValue({ thinking: value })
							}
							onSend={controller.send}
							onCancel={controller.cancel}
						/>
					)}
				</div>
			</div>

			<footer className="lb-footer-note">
				<span>
					{controller.serverNotice ??
						`Sidecar ${controller.backendConfig?.httpUrl ?? ""}`}
				</span>
				<span>Socket {controller.socketState} · Claude-only desktop mode</span>
			</footer>
		</div>
	);
}
