import type { Project } from "../../../../../server/projects/project-types";
import type { SessionListItem } from "../../../../../server/sessions/session-types";
import type { ClientMessage, ServerMessage } from "../../../../../shared/types";
import type { TurnEvent, UpsertObject } from "../../../../../server/streaming/upsert-types";

export type { Project, SessionListItem, ClientMessage, ServerMessage, TurnEvent, UpsertObject };

export type AgentStatus = "starting" | "connected" | "disconnected" | "reconnecting";

export type RenderChatEntry =
  | {
      entryId: string;
      type: "user";
      content: string;
      timestamp: string;
      presentation?: "document" | "compact";
    }
  | {
      entryId: string;
      type: "assistant";
      content: string;
      timestamp: string;
      finalized: boolean;
      presentation?: "document" | "compact";
    }
  | {
      entryId: string;
      type: "thinking";
      content: string;
      presentation?: "document" | "compact";
    }
  | {
      entryId: string;
      type: "tool-call";
      toolCallId: string;
      name: string;
      status: "running" | "complete" | "error";
      result?: string;
      error?: string;
      presentation?: "document" | "compact";
    };

export interface SessionRenderState {
  entries: RenderChatEntry[];
  upsertsByItemId: Record<string, UpsertObject>;
  entryIdByItemId: Record<string, string>;
  pendingOptimisticUserEntryIds: string[];
  isLoadingHistory: boolean;
  isStreaming: boolean;
  unread: boolean;
  errorMessage: string | null;
}

export interface WsConnectionState {
  socketState: "connecting" | "connected" | "disconnected" | "reconnecting";
}
