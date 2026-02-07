/** CLI type constants */
export const CLI_TYPES = {
	CLAUDE_CODE: "claude-code",
	CODEX: "codex",
};

/** Agent status values */
export const AGENT_STATUS = {
	IDLE: "idle",
	STARTING: "starting",
	CONNECTED: "connected",
	DISCONNECTED: "disconnected",
	RECONNECTING: "reconnecting",
};

/** Chat entry types */
export const ENTRY_TYPES = {
	USER: "user",
	ASSISTANT: "assistant",
	THINKING: "thinking",
	TOOL_CALL: "tool-call",
};

/** Tool call status */
export const TOOL_STATUS = {
	RUNNING: "running",
	COMPLETE: "complete",
	ERROR: "error",
};

/** localStorage keys */
export const STORAGE_KEYS = {
	TABS: "liminal:tabs",
	COLLAPSED: "liminal:collapsed",
};
