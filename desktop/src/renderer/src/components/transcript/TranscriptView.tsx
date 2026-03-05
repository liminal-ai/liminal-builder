import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  TRANSCRIPT_OVERSCAN,
  VIRTUALIZATION_ENTRY_THRESHOLD,
} from "@renderer/lib/transcript-config";
import type { AgentStatus, RenderChatEntry } from "@renderer/lib/types";
import { TranscriptEntry } from "./TranscriptEntry";

export interface TranscriptViewProps {
  entries: RenderChatEntry[];
  agentStatus: AgentStatus;
  isLoadingHistory: boolean;
  errorMessage: string | null;
  virtualizationEnabled?: boolean;
}

const SCROLL_BOTTOM_THRESHOLD_PX = 48;

export function TranscriptView({
  entries,
  agentStatus,
  isLoadingHistory,
  errorMessage,
  virtualizationEnabled = true,
}: TranscriptViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const shouldVirtualize = useMemo(
    () => virtualizationEnabled && entries.length > VIRTUALIZATION_ENTRY_THRESHOLD,
    [virtualizationEnabled, entries.length],
  );

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 170,
    overscan: TRANSCRIPT_OVERSCAN,
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const updateScrollState = () => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      setIsAtBottom(distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD_PX);
    };

    updateScrollState();
    element.addEventListener("scroll", updateScrollState, { passive: true });
    return () => {
      element.removeEventListener("scroll", updateScrollState);
    };
  }, []);

  useEffect(() => {
    if (!shouldVirtualize) {
      return;
    }
    rowVirtualizer.measure();
  }, [entries, shouldVirtualize, rowVirtualizer]);

  useLayoutEffect(() => {
    if (!isAtBottom || entries.length === 0) {
      return;
    }

    if (shouldVirtualize) {
      rowVirtualizer.scrollToIndex(entries.length - 1, { align: "end" });
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [entries, isAtBottom, shouldVirtualize, rowVirtualizer]);

  return (
    <section className="lb-thread-transcript-shell">
      <p className="lb-thread-status-line">Claude status: {agentStatus}</p>
      <div
        ref={scrollRef}
        className="lb-thread-transcript"
        data-virtualized={shouldVirtualize ? "true" : "false"}
      >
        {isLoadingHistory ? <p className="lb-transcript-muted">Loading session...</p> : null}
        {errorMessage ? <p className="lb-error-text">{errorMessage}</p> : null}

        {shouldVirtualize ? (
          <div
            className="lb-virtual-list"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const entry = entries[virtualItem.index];
              if (!entry) {
                return null;
              }

              return (
                <div
                  key={entry.entryId}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  className="lb-virtual-row"
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <TranscriptEntry entry={entry} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="lb-transcript-list">
            {entries.map((entry) => (
              <TranscriptEntry key={entry.entryId} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
