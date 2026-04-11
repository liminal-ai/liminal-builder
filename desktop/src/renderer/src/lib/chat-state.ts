import type {
	OptimisticUserEntry,
	RenderTurn,
	RenderTurnBlock,
	SessionRenderState,
	TurnEvent,
	UpsertObject,
} from "./types";

function toToolStatus(
	status: UpsertObject["status"],
): "running" | "complete" | "error" {
	if (status === "complete") {
		return "complete";
	}
	if (status === "error") {
		return "error";
	}
	return "running";
}

function sortUpserts(upserts: UpsertObject[]): UpsertObject[] {
	return [...upserts].sort((left, right) => {
		const leftTurn = left.turnOrder ?? Number.MAX_SAFE_INTEGER;
		const rightTurn = right.turnOrder ?? Number.MAX_SAFE_INTEGER;
		if (leftTurn !== rightTurn) {
			return leftTurn - rightTurn;
		}
		const leftItem = left.itemOrder ?? Number.MAX_SAFE_INTEGER;
		const rightItem = right.itemOrder ?? Number.MAX_SAFE_INTEGER;
		if (leftItem !== rightItem) {
			return leftItem - rightItem;
		}
		return left.emittedAt.localeCompare(right.emittedAt);
	});
}

function coalesceAssistantContent(
	blocks: RenderTurnBlock[],
	content: string,
	timestamp: string,
	finalized: boolean,
	blockId: string,
): RenderTurnBlock[] {
	const existingIndex = blocks.findIndex(
		(block) => block.type === "assistant-document",
	);
	if (existingIndex === -1) {
		return [
			...blocks,
			{
				blockId,
				type: "assistant-document",
				content,
				timestamp,
				finalized,
			},
		];
	}
	const nextBlocks = [...blocks];
	const existing = nextBlocks[existingIndex];
	if (existing?.type !== "assistant-document") {
		return blocks;
	}
	nextBlocks[existingIndex] = {
		...existing,
		content:
			existing.content.length === 0
				? content
				: `${existing.content.trimEnd()}\n\n${content.trimStart()}`,
		finalized: existing.finalized && finalized,
		timestamp: existing.timestamp,
	};
	return nextBlocks;
}

function blockFromUpsert(upsert: UpsertObject): RenderTurnBlock | null {
	if (upsert.type === "message") {
		if (upsert.origin === "user") {
			return {
				blockId: upsert.itemId,
				type: "user-prompt",
				content: upsert.content,
				timestamp: upsert.sourceTimestamp,
			};
		}
		if (upsert.origin === "system" || upsert.semanticRole === "system_notice") {
			return {
				blockId: upsert.itemId,
				type: "system-note",
				content: upsert.content,
				timestamp: upsert.sourceTimestamp,
				tone: upsert.status === "error" ? "error" : "notice",
			};
		}
		return {
			blockId: upsert.itemId,
			type: "assistant-document",
			content: upsert.content,
			timestamp: upsert.sourceTimestamp,
			finalized: upsert.status === "complete",
		};
	}

	if (upsert.type === "thinking") {
		return {
			blockId: upsert.itemId,
			type: "thinking",
			content: upsert.content,
		};
	}

	return {
		blockId: upsert.itemId,
		type: "tool-call",
		toolCallId: upsert.callId,
		name: upsert.toolDisplayName ?? upsert.toolName,
		argumentsText: upsert.toolArgumentsText,
		status: toToolStatus(upsert.status),
		result: upsert.status === "error" ? undefined : upsert.toolOutput,
		error:
			upsert.status === "error"
				? (upsert.errorMessage ?? upsert.toolOutput ?? "Tool call failed")
				: undefined,
		outputFormat: upsert.toolOutputFormat,
	};
}

function projectTurns(
	upsertsByItemId: Record<string, UpsertObject>,
	pendingOptimisticUserEntries: OptimisticUserEntry[],
): RenderTurn[] {
	const turnsById = new Map<string, RenderTurn>();

	for (const upsert of sortUpserts(Object.values(upsertsByItemId))) {
		const turnOrder = upsert.turnOrder ?? 0;
		const existingTurn = turnsById.get(upsert.turnId) ?? {
			turnId: upsert.turnId,
			turnOrder,
			timestamp: upsert.sourceTimestamp,
			blocks: [],
			isStreaming: false,
		};
		existingTurn.turnOrder = turnOrder;
		existingTurn.timestamp = existingTurn.timestamp || upsert.sourceTimestamp;
		existingTurn.isStreaming =
			existingTurn.isStreaming ||
			(upsert.status !== "complete" && upsert.status !== "error");

		const block = blockFromUpsert(upsert);
		if (!block) {
			turnsById.set(upsert.turnId, existingTurn);
			continue;
		}

		if (
			block.type === "assistant-document" &&
			(upsert.isPrimaryTurnOutput ||
				(upsert.type === "message" && upsert.origin === "agent"))
		) {
			existingTurn.blocks = coalesceAssistantContent(
				existingTurn.blocks,
				block.content,
				block.timestamp,
				block.finalized,
				block.blockId,
			);
		} else {
			existingTurn.blocks = [...existingTurn.blocks, block];
		}

		turnsById.set(upsert.turnId, existingTurn);
	}

	const projectedTurns = [...turnsById.values()].sort(
		(left, right) => left.turnOrder - right.turnOrder,
	);

	for (const optimistic of pendingOptimisticUserEntries) {
		projectedTurns.push({
			turnId: `optimistic:${optimistic.entryId}`,
			turnOrder: (projectedTurns.at(-1)?.turnOrder ?? 0) + 1,
			timestamp: optimistic.timestamp,
			isStreaming: false,
			blocks: [
				{
					blockId: optimistic.entryId,
					type: "user-prompt",
					content: optimistic.content,
					timestamp: optimistic.timestamp,
				},
			],
		});
	}

	return projectedTurns;
}

export function createEmptySessionState(): SessionRenderState {
	return {
		turns: [],
		upsertsByItemId: {},
		pendingOptimisticUserEntries: [],
		isLoadingHistory: false,
		isStreaming: false,
		unread: false,
		errorMessage: null,
	};
}

export function applyUpsertHistory(
	prev: SessionRenderState,
	history: UpsertObject[],
): SessionRenderState {
	const upsertsByItemId: Record<string, UpsertObject> = {};
	for (const upsert of history) {
		upsertsByItemId[upsert.itemId] = {
			...upsert,
			status: upsert.status === "error" ? "error" : "complete",
		};
	}
	return {
		...prev,
		upsertsByItemId,
		turns: projectTurns(upsertsByItemId, []),
		pendingOptimisticUserEntries: [],
		isLoadingHistory: false,
		errorMessage: null,
	};
}

function consumeOptimisticUserEntry(
	state: SessionRenderState,
): SessionRenderState {
	if (state.pendingOptimisticUserEntries.length === 0) {
		return state;
	}
	return {
		...state,
		pendingOptimisticUserEntries: state.pendingOptimisticUserEntries.slice(1),
	};
}

export function applyUpsert(
	prev: SessionRenderState,
	upsert: UpsertObject,
): SessionRenderState {
	let next: SessionRenderState = {
		...prev,
		upsertsByItemId: {
			...prev.upsertsByItemId,
			[upsert.itemId]: upsert,
		},
		errorMessage: null,
	};

	if (
		upsert.type === "message" &&
		upsert.origin === "user" &&
		upsert.status === "complete" &&
		next.pendingOptimisticUserEntries.length > 0
	) {
		next = consumeOptimisticUserEntry(next);
	}

	return {
		...next,
		turns: projectTurns(
			next.upsertsByItemId,
			next.pendingOptimisticUserEntries,
		),
	};
}

export function applyTurnEvent(
	prev: SessionRenderState,
	event: TurnEvent,
): SessionRenderState {
	if (event.type === "turn_started") {
		return {
			...prev,
			isStreaming: true,
			errorMessage: null,
		};
	}

	if (event.type === "turn_complete") {
		return {
			...prev,
			isStreaming: false,
		};
	}

	return {
		...prev,
		isStreaming: false,
		errorMessage: event.errorMessage,
	};
}

export function addOptimisticUserEntry(
	prev: SessionRenderState,
	content: string,
): SessionRenderState {
	const optimisticEntry: OptimisticUserEntry = {
		entryId: `optimistic-user-${
			typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
				? crypto.randomUUID()
				: Date.now().toString(36)
		}`,
		content,
		timestamp: new Date().toISOString(),
	};
	const nextPending = [...prev.pendingOptimisticUserEntries, optimisticEntry];
	return {
		...prev,
		pendingOptimisticUserEntries: nextPending,
		turns: projectTurns(prev.upsertsByItemId, nextPending),
		errorMessage: null,
	};
}
