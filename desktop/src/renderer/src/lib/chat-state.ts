import type {
  RenderChatEntry,
  SessionRenderState,
  TurnEvent,
  UpsertObject,
} from "./types";

function toToolStatus(status: UpsertObject["status"]): "running" | "complete" | "error" {
  if (status === "complete") {
    return "complete";
  }
  if (status === "error") {
    return "error";
  }
  return "running";
}

function formatToolArguments(toolArguments: Record<string, unknown>): string {
  const keys = Object.keys(toolArguments);
  if (keys.length === 0) {
    return "";
  }
  return ` ${JSON.stringify(toolArguments)}`;
}

function mapUpsertToEntry(
  upsert: UpsertObject,
  entryIdByItemId: Record<string, string>,
): RenderChatEntry | null {
  const entryId = entryIdByItemId[upsert.itemId] ?? `upsert-${upsert.itemId}`;

  if (upsert.type === "message") {
    return {
      entryId,
      type: upsert.origin === "user" ? "user" : "assistant",
      content: upsert.content,
      timestamp: upsert.sourceTimestamp,
      presentation: upsert.origin === "user" ? "compact" : "document",
      ...(upsert.origin === "user" ? {} : { finalized: upsert.status === "complete" }),
    } as RenderChatEntry;
  }

  if (upsert.type === "thinking") {
    return {
      entryId,
      type: "thinking",
      content: upsert.content,
      presentation: "compact",
    };
  }

  const toolOutput =
    typeof upsert.toolOutput === "string"
      ? upsert.toolOutput
      : typeof upsert.errorMessage === "string"
        ? upsert.errorMessage
        : undefined;

  const toolName =
    typeof upsert.toolName === "string" && upsert.toolName.length > 0
      ? upsert.toolName
      : upsert.callId;

  return {
    entryId,
    type: "tool-call",
    toolCallId: upsert.callId,
    name: `${toolName}${formatToolArguments(upsert.toolArguments)}`,
    status: toToolStatus(upsert.status),
    result: upsert.status === "error" ? undefined : toolOutput,
    error: upsert.status === "error" ? upsert.errorMessage ?? "Tool call failed" : undefined,
    presentation: "compact",
  };
}

export function createEmptySessionState(): SessionRenderState {
  return {
    entries: [],
    upsertsByItemId: {},
    entryIdByItemId: {},
    pendingOptimisticUserEntryIds: [],
    isLoadingHistory: false,
    isStreaming: false,
    unread: false,
    errorMessage: null,
  };
}

function replaceOrAppend(
  entries: RenderChatEntry[],
  entry: RenderChatEntry,
): RenderChatEntry[] {
  const index = entries.findIndex((candidate) => candidate.entryId === entry.entryId);
  if (index === -1) {
    return [...entries, entry];
  }

  const nextEntries = [...entries];
  nextEntries.splice(index, 1, entry);
  return nextEntries;
}

export function applyUpsertHistory(
  prev: SessionRenderState,
  history: UpsertObject[],
): SessionRenderState {
  const upsertsByItemId: Record<string, UpsertObject> = {};
  const entryIdByItemId: Record<string, string> = {};
  let entries: RenderChatEntry[] = [];

  for (const upsert of history) {
    upsertsByItemId[upsert.itemId] = {
      ...upsert,
      status: upsert.status === "error" ? "error" : "complete",
    };

    const entry = mapUpsertToEntry(upsertsByItemId[upsert.itemId], entryIdByItemId);
    if (!entry) {
      continue;
    }

    entryIdByItemId[upsert.itemId] = entry.entryId;
    if (entry.type === "assistant") {
      entry.finalized = true;
    }

    entries = replaceOrAppend(entries, entry);
  }

  return {
    ...prev,
    entries,
    upsertsByItemId,
    entryIdByItemId,
    pendingOptimisticUserEntryIds: [],
    isLoadingHistory: false,
    errorMessage: null,
  };
}

function consumeOptimisticUserEntry(state: SessionRenderState): SessionRenderState {
  if (state.pendingOptimisticUserEntryIds.length === 0) {
    return state;
  }

  const [optimisticId, ...rest] = state.pendingOptimisticUserEntryIds;
  return {
    ...state,
    pendingOptimisticUserEntryIds: rest,
    entries: state.entries.filter((entry) => entry.entryId !== optimisticId),
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
    entryIdByItemId: {
      ...prev.entryIdByItemId,
      [upsert.itemId]: prev.entryIdByItemId[upsert.itemId] ?? `upsert-${upsert.itemId}`,
    },
    errorMessage: null,
  };

  if (
    upsert.type === "message" &&
    upsert.origin === "user" &&
    upsert.status === "complete" &&
    next.pendingOptimisticUserEntryIds.length > 0
  ) {
    next = consumeOptimisticUserEntry(next);
  }

  const mapped = mapUpsertToEntry(upsert, next.entryIdByItemId);
  if (!mapped) {
    return next;
  }

  if (mapped.type === "assistant" && upsert.status === "complete") {
    mapped.finalized = true;
  }

  return {
    ...next,
    entries: replaceOrAppend(next.entries, mapped),
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
  const entryId = `optimistic-user-${
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Date.now().toString(36)
  }`;
  return {
    ...prev,
    entries: [
      ...prev.entries,
      {
        entryId,
        type: "user",
        content,
        timestamp: new Date().toISOString(),
        presentation: "compact",
      },
    ],
    pendingOptimisticUserEntryIds: [...prev.pendingOptimisticUserEntryIds, entryId],
    errorMessage: null,
  };
}
