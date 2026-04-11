import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	TRANSCRIPT_OVERSCAN,
	VIRTUALIZATION_ENTRY_THRESHOLD,
} from "@renderer/lib/transcript-config";
import type { AgentStatus, RenderTurn } from "@renderer/lib/types";
import { TranscriptEntry } from "./TranscriptEntry";

export interface TranscriptViewProps {
	turns: RenderTurn[];
	agentStatus: AgentStatus;
	isLoadingHistory: boolean;
	errorMessage: string | null;
	virtualizationEnabled?: boolean;
}

const SCROLL_BOTTOM_THRESHOLD_PX = 48;

export function TranscriptView({
	turns,
	agentStatus,
	isLoadingHistory,
	errorMessage,
	virtualizationEnabled = true,
}: TranscriptViewProps) {
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const [isAtBottom, setIsAtBottom] = useState(true);

	const shouldVirtualize = useMemo(
		() =>
			virtualizationEnabled && turns.length > VIRTUALIZATION_ENTRY_THRESHOLD,
		[virtualizationEnabled, turns.length],
	);

	const rowVirtualizer = useVirtualizer({
		count: turns.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 220,
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
	}, [shouldVirtualize, rowVirtualizer]);

	useLayoutEffect(() => {
		if (!isAtBottom || turns.length === 0) {
			return;
		}

		if (shouldVirtualize) {
			rowVirtualizer.scrollToIndex(turns.length - 1, { align: "end" });
			return;
		}

		const element = scrollRef.current;
		if (!element) {
			return;
		}
		element.scrollTop = element.scrollHeight;
	}, [turns, isAtBottom, shouldVirtualize, rowVirtualizer]);

	return (
		<section className="lb-thread-transcript-shell">
			<p className="lb-thread-status-line">Claude status: {agentStatus}</p>
			<div
				ref={scrollRef}
				className="lb-thread-transcript"
				data-virtualized={shouldVirtualize ? "true" : "false"}
			>
				{isLoadingHistory ? (
					<p className="lb-transcript-muted">Loading session...</p>
				) : null}
				{errorMessage ? <p className="lb-error-text">{errorMessage}</p> : null}

				{shouldVirtualize ? (
					<div
						className="lb-virtual-list"
						style={{
							height: `${rowVirtualizer.getTotalSize()}px`,
						}}
					>
						{rowVirtualizer.getVirtualItems().map((virtualItem) => {
							const turn = turns[virtualItem.index];
							if (!turn) {
								return null;
							}

							return (
								<div
									key={turn.turnId}
									data-index={virtualItem.index}
									ref={rowVirtualizer.measureElement}
									className="lb-virtual-row"
									style={{
										transform: `translateY(${virtualItem.start}px)`,
									}}
								>
									<TranscriptEntry turn={turn} />
								</div>
							);
						})}
					</div>
				) : (
					<div className="lb-transcript-list">
						{turns.map((turn) => (
							<TranscriptEntry key={turn.turnId} turn={turn} />
						))}
					</div>
				)}
			</div>
		</section>
	);
}
