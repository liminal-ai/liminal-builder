/* @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewThreadScreen, type SuggestionCard } from "../NewThreadScreen";

const projects = [
  {
    id: "p1",
    name: "alpha",
    path: "/tmp/alpha",
    addedAt: new Date().toISOString(),
  },
  {
    id: "p2",
    name: "beta",
    path: "/tmp/beta",
    addedAt: new Date().toISOString(),
  },
];

describe("NewThreadScreen", () => {
  it("updates selected project and creates thread", () => {
    const onProjectSelect = vi.fn();
    const onCreateThread = vi.fn();

    render(
      <NewThreadScreen
        projects={projects}
        selectedProjectId="p1"
        draft=""
        selectedSuggestionId={null}
        onProjectSelect={onProjectSelect}
        onDraftChange={() => {}}
        onCreateThread={onCreateThread}
        onSuggestionClick={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "p2" },
    });

    expect(onProjectSelect).toHaveBeenCalledWith("p2");

    fireEvent.click(screen.getByLabelText("Create thread"));
    expect(onCreateThread).toHaveBeenCalled();
  });

  it("clicking a suggestion can prefill draft through parent state", () => {
    function Harness() {
      const [draft, setDraft] = React.useState("");
      const [selectedSuggestionId, setSelectedSuggestionId] = React.useState<string | null>(null);

      return (
        <NewThreadScreen
          projects={projects}
          selectedProjectId="p1"
          draft={draft}
          selectedSuggestionId={selectedSuggestionId}
          onProjectSelect={() => {}}
          onDraftChange={setDraft}
          onCreateThread={() => {}}
          onSuggestionClick={(suggestion: SuggestionCard) => {
            setDraft(suggestion.prompt);
            setSelectedSuggestionId(suggestion.id);
          }}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getByText("Create a one-page summary of this app."));

    const composer = screen.getByPlaceholderText(
      "Ask Claude anything, @ to add files, / for commands",
    ) as HTMLTextAreaElement;

    expect(composer.value).toContain("Create a one-page summary of this app");
  });
});
