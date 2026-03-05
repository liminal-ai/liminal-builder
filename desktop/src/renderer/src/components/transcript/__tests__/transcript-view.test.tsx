/* @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RenderChatEntry } from "@renderer/lib/types";
import { TranscriptView } from "../TranscriptView";

function buildAssistantEntry(
  id: string,
  content: string,
  finalized = true,
): RenderChatEntry {
  return {
    entryId: id,
    type: "assistant",
    content,
    timestamp: new Date().toISOString(),
    finalized,
    presentation: "document",
  };
}

describe("TranscriptView", () => {
  it("switches between streaming and finalized assistant rendering", () => {
    const { rerender } = render(
      <TranscriptView
        entries={[buildAssistantEntry("a1", "streaming response", false)]}
        agentStatus="connected"
        isLoadingHistory={false}
        errorMessage={null}
      />,
    );

    expect(document.querySelector(".lb-entry-assistant-streaming")).toBeTruthy();
    expect(document.querySelector(".lb-markdown-doc")).toBeNull();

    rerender(
      <TranscriptView
        entries={[buildAssistantEntry("a1", "## done", true)]}
        agentStatus="connected"
        isLoadingHistory={false}
        errorMessage={null}
      />,
    );

    expect(document.querySelector(".lb-entry-assistant-streaming")).toBeNull();
    expect(document.querySelector(".lb-markdown-doc")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "done" })).toBeTruthy();
  });

  it("enables virtualization only above threshold", () => {
    const manyEntries = Array.from({ length: 181 }, (_unused, index) =>
      buildAssistantEntry(`e-${index}`, `entry ${index}`),
    );

    const { rerender } = render(
      <TranscriptView
        entries={manyEntries.slice(0, 12)}
        agentStatus="connected"
        isLoadingHistory={false}
        errorMessage={null}
      />,
    );

    expect(document.querySelector('[data-virtualized="false"]')).toBeTruthy();

    rerender(
      <TranscriptView
        entries={manyEntries}
        agentStatus="connected"
        isLoadingHistory={false}
        errorMessage={null}
      />,
    );

    expect(document.querySelector('[data-virtualized="true"]')).toBeTruthy();
  });
});
