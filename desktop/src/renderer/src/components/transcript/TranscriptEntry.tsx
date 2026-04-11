import { memo } from "react";
import type { RenderTurn, RenderTurnBlock } from "@renderer/lib/types";
import { MarkdownDocument } from "./MarkdownDocument";

export interface TranscriptEntryProps {
	turn: RenderTurn;
}

function ToolAnnotation({
	block,
}: {
	block: Extract<RenderTurnBlock, { type: "tool-call" }>;
}) {
	return (
		<details
			className="lb-turn-annotation lb-turn-tool"
			open={block.status === "running"}
		>
			<summary>
				<span className="lb-tool-summary-name">{block.name}</span>
				<span className={`lb-tool-status lb-tool-status-${block.status}`}>
					{block.status === "running"
						? "Running"
						: block.status === "complete"
							? "Complete"
							: "Error"}
				</span>
			</summary>
			<div className="lb-turn-annotation-body">
				{block.argumentsText ? (
					<div className="lb-annotation-section">
						<p className="lb-annotation-label">Arguments</p>
						<pre>{block.argumentsText}</pre>
					</div>
				) : null}
				{block.result ? (
					<div className="lb-annotation-section">
						<p className="lb-annotation-label">Output</p>
						<pre>{block.result}</pre>
					</div>
				) : null}
				{block.error ? <p className="lb-error-text">{block.error}</p> : null}
			</div>
		</details>
	);
}

function renderBlock(block: RenderTurnBlock) {
	switch (block.type) {
		case "user-prompt":
			return (
				<article key={block.blockId} className="lb-entry lb-entry-user-compact">
					<p className="lb-entry-user-content">{block.content}</p>
				</article>
			);
		case "assistant-document":
			if (!block.finalized) {
				return (
					<article
						key={block.blockId}
						className="lb-entry lb-entry-assistant-streaming"
					>
						<div className="lb-streaming-document">
							{block.content}
							<span className="lb-streaming-caret" aria-hidden="true" />
						</div>
					</article>
				);
			}
			return (
				<article
					key={block.blockId}
					className="lb-entry lb-entry-assistant-document"
				>
					<MarkdownDocument content={block.content} entryId={block.blockId} />
				</article>
			);
		case "thinking":
			return (
				<details
					key={block.blockId}
					className="lb-turn-annotation lb-entry-thinking"
				>
					<summary>Thinking</summary>
					<div className="lb-turn-annotation-body">
						<pre>{block.content}</pre>
					</div>
				</details>
			);
		case "tool-call":
			return <ToolAnnotation key={block.blockId} block={block} />;
		case "system-note":
			return (
				<article
					key={block.blockId}
					className={`lb-turn-annotation lb-system-note lb-system-note-${block.tone}`}
				>
					<p>{block.content}</p>
				</article>
			);
	}
}

function TranscriptEntryInner({ turn }: TranscriptEntryProps) {
	return (
		<section className="lb-turn-surface">
			{turn.blocks.map(renderBlock)}
		</section>
	);
}

export const TranscriptEntry = memo(
	TranscriptEntryInner,
	(prev, next) => prev.turn === next.turn,
);
