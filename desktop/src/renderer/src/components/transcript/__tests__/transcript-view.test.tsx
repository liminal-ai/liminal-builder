/* @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RenderTurn } from "@renderer/lib/types";
import { TranscriptView } from "../TranscriptView";

function buildAssistantTurn(
	id: string,
	content: string,
	finalized = true,
): RenderTurn {
	return {
		turnId: id,
		turnOrder: 1,
		timestamp: new Date().toISOString(),
		isStreaming: !finalized,
		blocks: [
			{
				blockId: `${id}:assistant`,
				type: "assistant-document",
				content,
				timestamp: new Date().toISOString(),
				finalized,
			},
		],
	};
}

describe("TranscriptView", () => {
	it("switches between streaming and finalized assistant rendering", () => {
		const { rerender } = render(
			<TranscriptView
				turns={[buildAssistantTurn("a1", "streaming response", false)]}
				agentStatus="connected"
				isLoadingHistory={false}
				errorMessage={null}
			/>,
		);

		expect(
			document.querySelector(".lb-entry-assistant-streaming"),
		).toBeTruthy();
		expect(document.querySelector(".lb-markdown-doc")).toBeNull();

		rerender(
			<TranscriptView
				turns={[buildAssistantTurn("a1", "## done", true)]}
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
		const manyTurns = Array.from({ length: 181 }, (_unused, index) =>
			buildAssistantTurn(`turn-${index}`, `entry ${index}`),
		);

		const { rerender } = render(
			<TranscriptView
				turns={manyTurns.slice(0, 12)}
				agentStatus="connected"
				isLoadingHistory={false}
				errorMessage={null}
			/>,
		);

		expect(document.querySelector('[data-virtualized="false"]')).toBeTruthy();

		rerender(
			<TranscriptView
				turns={manyTurns}
				agentStatus="connected"
				isLoadingHistory={false}
				errorMessage={null}
			/>,
		);

		expect(document.querySelector('[data-virtualized="true"]')).toBeTruthy();
	});
});
