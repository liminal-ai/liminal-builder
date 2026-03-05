import { memo } from "react";
import type { RenderChatEntry } from "@renderer/lib/types";
import { MarkdownDocument } from "./MarkdownDocument";

export interface TranscriptEntryProps {
  entry: RenderChatEntry;
}

function TranscriptEntryInner({ entry }: TranscriptEntryProps) {
  if (entry.type === "user") {
    return (
      <article className="lb-entry lb-entry-user-compact">
        <p className="lb-entry-user-content">{entry.content}</p>
      </article>
    );
  }

  if (entry.type === "assistant") {
    if (!entry.finalized) {
      return (
        <article className="lb-entry lb-entry-assistant-streaming">
          <pre className="lb-streaming-block">{entry.content}</pre>
        </article>
      );
    }

    return (
      <article className="lb-entry lb-entry-assistant-document">
        <MarkdownDocument content={entry.content} entryId={entry.entryId} />
      </article>
    );
  }

  if (entry.type === "thinking") {
    return (
      <details className="lb-entry lb-entry-thinking">
        <summary>Thinking</summary>
        <pre>{entry.content}</pre>
      </details>
    );
  }

  return (
    <article className="lb-entry lb-entry-tool">
      <p className="lb-tool-title">{entry.name}</p>
      {entry.status === "running" ? <p>Running…</p> : null}
      {entry.status === "complete" ? (
        <details>
          <summary>Tool output</summary>
          <pre>{entry.result ?? ""}</pre>
        </details>
      ) : null}
      {entry.status === "error" ? <p className="lb-error-text">{entry.error ?? "Error"}</p> : null}
    </article>
  );
}

export const TranscriptEntry = memo(
  TranscriptEntryInner,
  (prev, next) => prev.entry === next.entry,
);
