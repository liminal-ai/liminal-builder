import {
	query as claudeQuery,
	type Options as ClaudeQueryOptions,
	type SDKMessage,
	type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
	ClaudeContentBlockDeltaEvent,
	ClaudeContentBlockStartEvent,
	ClaudeContentBlockStopEvent,
	ClaudeMessageDeltaEvent,
	ClaudeMessageStartEvent,
	ClaudeMessageStopEvent,
	ClaudeSdkAdapter,
	ClaudeSdkQueryHandle,
	ClaudeSdkQueryRequest,
	ClaudeSdkStreamEvent,
	ClaudeUserToolResultEvent,
} from "./claude-sdk-provider";

type RecordLike = Record<string, unknown>;

export class ClaudeAgentSdkAdapter implements ClaudeSdkAdapter {
	async query(request: ClaudeSdkQueryRequest): Promise<ClaudeSdkQueryHandle> {
		let alive = true;
		const sdkQuery = claudeQuery({
			prompt: this.toSdkInput(request.input),
			options: {
				cwd: request.cwd,
				...(request.resumeSessionId ? { resume: request.resumeSessionId } : {}),
				...(request.options as Partial<ClaudeQueryOptions>),
				includePartialMessages: true,
			},
		});

		return {
			output: this.toClaudeStreamEvents(sdkQuery, () => {
				alive = false;
			}),
			interrupt: async () => {
				await sdkQuery.interrupt();
			},
			close: async () => {
				if (!alive) {
					return;
				}
				alive = false;
				sdkQuery.close();
			},
			isAlive: () => alive,
		};
	}

	private async *toSdkInput(
		input: AsyncIterable<string>,
	): AsyncGenerator<SDKUserMessage> {
		for await (const message of input) {
			yield {
				type: "user",
				session_id: "",
				message: {
					role: "user",
					content: [{ type: "text", text: message }],
				},
				parent_tool_use_id: null,
			} as SDKUserMessage;
		}
	}

	private async *toClaudeStreamEvents(
		stream: AsyncIterable<SDKMessage>,
		onDone: () => void,
	): AsyncGenerator<ClaudeSdkStreamEvent> {
		try {
			for await (const message of stream) {
				const event = this.mapSdkMessageToStreamEvent(message);
				if (event) {
					yield event;
				}
			}
		} finally {
			onDone();
		}
	}

	private mapSdkMessageToStreamEvent(
		message: SDKMessage,
	): ClaudeSdkStreamEvent | null {
		if (message.type !== "stream_event") {
			return null;
		}

		const rawEvent = this.asRecord(message.event);
		if (!rawEvent) {
			return null;
		}
		const eventType = this.asString(rawEvent?.type);
		if (!eventType) {
			return null;
		}

		switch (eventType) {
			case "message_start":
				return this.mapMessageStart(rawEvent);
			case "message_delta":
				return this.mapMessageDelta(rawEvent);
			case "message_stop":
				return { type: "message_stop" } satisfies ClaudeMessageStopEvent;
			case "content_block_start":
				return this.mapContentBlockStart(rawEvent);
			case "content_block_delta":
				return this.mapContentBlockDelta(rawEvent);
			case "content_block_stop":
				return this.mapContentBlockStop(rawEvent);
			case "user_tool_result":
				return this.mapUserToolResult(rawEvent);
			default:
				return null;
		}
	}

	private mapMessageStart(rawEvent: RecordLike): ClaudeMessageStartEvent {
		const message = this.asRecord(rawEvent.message);
		return {
			type: "message_start",
			message: {
				id: this.asString(message?.id) ?? "unknown-message",
				model: this.asString(message?.model) ?? "unknown-model",
			},
		};
	}

	private mapMessageDelta(rawEvent: RecordLike): ClaudeMessageDeltaEvent {
		const delta = this.asRecord(rawEvent.delta);
		const usageRecord = this.asRecord(delta?.usage);
		const usage = usageRecord
			? {
					inputTokens: this.asNumber(
						usageRecord.inputTokens ?? usageRecord.input_tokens,
					),
					outputTokens: this.asNumber(
						usageRecord.outputTokens ?? usageRecord.output_tokens,
					),
					cacheReadInputTokens: this.asOptionalNumber(
						usageRecord.cacheReadInputTokens ??
							usageRecord.cache_read_input_tokens,
					),
					cacheCreationInputTokens: this.asOptionalNumber(
						usageRecord.cacheCreationInputTokens ??
							usageRecord.cache_creation_input_tokens,
					),
				}
			: undefined;

		return {
			type: "message_delta",
			delta: {
				stopReason:
					this.asString(delta?.stopReason) ?? this.asString(delta?.stop_reason),
				usage,
			},
		};
	}

	private mapContentBlockStart(
		rawEvent: RecordLike,
	): ClaudeContentBlockStartEvent {
		const index = this.asNumber(rawEvent.index);
		const contentBlock =
			this.asRecord(rawEvent.contentBlock) ??
			this.asRecord(rawEvent.content_block);
		const blockType = this.asString(contentBlock?.type);
		if (blockType === "tool_use") {
			return {
				type: "content_block_start",
				index,
				contentBlock: {
					type: "tool_use",
					id: this.asString(contentBlock?.id) ?? "unknown-tool-call",
					name: this.asString(contentBlock?.name) ?? "unknown_tool",
					input: this.asRecord(contentBlock?.input) ?? {},
				},
			};
		}
		if (blockType === "thinking") {
			return {
				type: "content_block_start",
				index,
				contentBlock: {
					type: "thinking",
					thinking: this.asString(contentBlock?.thinking) ?? "",
				},
			};
		}
		return {
			type: "content_block_start",
			index,
			contentBlock: {
				type: "text",
				text: this.asString(contentBlock?.text) ?? "",
			},
		};
	}

	private mapContentBlockDelta(
		rawEvent: RecordLike,
	): ClaudeContentBlockDeltaEvent {
		const index = this.asNumber(rawEvent.index);
		const delta = this.asRecord(rawEvent.delta);
		const deltaType = this.asString(delta?.type);
		if (deltaType === "input_json_delta") {
			return {
				type: "content_block_delta",
				index,
				delta: {
					type: "input_json_delta",
					partialJson:
						this.asString(delta?.partialJson) ??
						this.asString(delta?.partial_json) ??
						"",
				},
			};
		}
		if (deltaType === "thinking_delta") {
			return {
				type: "content_block_delta",
				index,
				delta: {
					type: "thinking_delta",
					thinking: this.asString(delta?.thinking) ?? "",
				},
			};
		}
		return {
			type: "content_block_delta",
			index,
			delta: {
				type: "text_delta",
				text: this.asString(delta?.text) ?? "",
			},
		};
	}

	private mapContentBlockStop(
		rawEvent: RecordLike,
	): ClaudeContentBlockStopEvent {
		return {
			type: "content_block_stop",
			index: this.asNumber(rawEvent.index),
		};
	}

	private mapUserToolResult(rawEvent: RecordLike): ClaudeUserToolResultEvent {
		return {
			type: "user_tool_result",
			toolUseId:
				this.asString(rawEvent.toolUseId) ??
				this.asString(rawEvent.tool_use_id) ??
				"unknown-tool-call",
			content: this.asString(rawEvent.content) ?? "",
			isError: Boolean(rawEvent.isError ?? rawEvent.is_error),
		};
	}

	private asRecord(value: unknown): RecordLike | undefined {
		if (typeof value === "object" && value !== null && !Array.isArray(value)) {
			return value as RecordLike;
		}
		return undefined;
	}

	private asString(value: unknown): string | undefined {
		return typeof value === "string" ? value : undefined;
	}

	private asOptionalNumber(value: unknown): number | undefined {
		return typeof value === "number" ? value : undefined;
	}

	private asNumber(value: unknown): number {
		return typeof value === "number" ? value : 0;
	}
}
