/* @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSidebar } from "../ProjectSidebar";

describe("ProjectSidebar controls", () => {
	it("shows threads header controls with tooltip labels", () => {
		render(
			<ProjectSidebar
				projects={[
					{
						id: "p1",
						name: "alpha",
						path: "/tmp/alpha",
						addedAt: new Date().toISOString(),
					},
				]}
				sessionsByProject={{
					p1: [
						{
							id: "claude-code:s1",
							projectId: "p1",
							title: "Session one",
							lastActiveAt: new Date().toISOString(),
							cliType: "claude-code",
							source: "builder",
							availability: "available",
							providerSessionId: "s1",
						},
					],
				}}
				projectPathById={{ p1: "/tmp/alpha" }}
				pinnedSessions={[]}
				pinnedSessionIds={[]}
				sessionUiById={{}}
				collapsedByProjectId={{}}
				selectedSessionId={null}
				onOpenNewThread={vi.fn()}
				onAddProject={vi.fn()}
				onRemoveProject={vi.fn()}
				onToggleProject={vi.fn()}
				onCreateSession={vi.fn()}
				onSelectSession={vi.fn()}
				onArchiveSession={vi.fn()}
				onMarkUnread={vi.fn()}
				onPinSession={vi.fn()}
				onUnpinSession={vi.fn()}
			/>,
		);

		expect(screen.getByTitle("Add new project")).toBeTruthy();
		expect(
			screen.getByTitle("Filter, sort, and organize threads"),
		).toBeTruthy();
	});

	it("emits the row projectId when selecting a session", () => {
		const onSelectSession = vi.fn();

		render(
			<ProjectSidebar
				projects={[
					{
						id: "p1",
						name: "alpha",
						path: "/tmp/alpha",
						addedAt: new Date().toISOString(),
					},
				]}
				sessionsByProject={{
					p1: [
						{
							id: "claude-code:s1",
							projectId: "p1",
							title: "Session one",
							lastActiveAt: new Date().toISOString(),
							cliType: "claude-code",
							source: "builder",
							availability: "available",
							providerSessionId: "s1",
						},
					],
				}}
				projectPathById={{ p1: "/tmp/alpha" }}
				pinnedSessions={[]}
				pinnedSessionIds={[]}
				sessionUiById={{}}
				collapsedByProjectId={{}}
				selectedSessionId={null}
				onOpenNewThread={vi.fn()}
				onAddProject={vi.fn()}
				onRemoveProject={vi.fn()}
				onToggleProject={vi.fn()}
				onCreateSession={vi.fn()}
				onSelectSession={onSelectSession}
				onArchiveSession={vi.fn()}
				onMarkUnread={vi.fn()}
				onPinSession={vi.fn()}
				onUnpinSession={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByText("Session one"));

		expect(onSelectSession).toHaveBeenCalledWith({
			sessionId: "claude-code:s1",
			projectId: "p1",
			availability: "available",
			source: "builder",
			warningReason: undefined,
		});
	});
});
