import type { ClientMessage } from "./types";

export function buildCreateSessionMessage(projectId: string): ClientMessage {
  return {
    type: "session:create",
    projectId,
    cliType: "claude-code",
  };
}

export function buildReconnectMessage(): ClientMessage {
  return {
    type: "session:reconnect",
    cliType: "claude-code",
  };
}
