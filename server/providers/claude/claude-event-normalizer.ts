import { NotImplementedError } from "../../errors";
import type { StreamEventEnvelope } from "../../streaming/stream-event-schema";

export interface ClaudeMessageStartEvent {
	type: "message_start";
	message: {
		id: string;
		model: string;
	};
}

export interface ClaudeMessageDeltaEvent {
	type: "message_delta";
	delta: {
		stopReason?: string;
		usage?: {
			inputTokens: number;
			outputTokens: number;
			cacheReadInputTokens?: number;
			cacheCreationInputTokens?: number;
		};
	};
}

export interface ClaudeMessageStopEvent {
	type: "message_stop";
}

export interface ClaudeContentBlockStartEvent {
	type: "content_block_start";
	index: number;
	contentBlock:
		| {
				type: "text";
				text: string;
		  }
		| {
				type: "thinking";
				thinking: string;
		  }
		| {
				type: "tool_use";
				id: string;
				name: string;
				input: Record<string, unknown>;
		  };
}

export interface ClaudeContentBlockDeltaEvent {
	type: "content_block_delta";
	index: number;
	delta:
		| {
				type: "text_delta";
				text: string;
		  }
		| {
				type: "thinking_delta";
				thinking: string;
		  }
		| {
				type: "input_json_delta";
				partialJson: string;
		  };
}

export interface ClaudeContentBlockStopEvent {
	type: "content_block_stop";
	index: number;
}

export interface ClaudeUserToolResultEvent {
	type: "user_tool_result";
	toolUseId: string;
	content: string;
	isError: boolean;
}

export type ClaudeSdkStreamEvent =
	| ClaudeMessageStartEvent
	| ClaudeMessageDeltaEvent
	| ClaudeMessageStopEvent
	| ClaudeContentBlockStartEvent
	| ClaudeContentBlockDeltaEvent
	| ClaudeContentBlockStopEvent
	| ClaudeUserToolResultEvent;

export interface ClaudeNormalizerTurnContext {
	sessionId: string;
	turnId: string;
	messageOrdinal: number;
}

export interface ClaudeEventNormalizerOptions {
	providerId?: string;
	createEventId?: () => string;
	now?: () => Date;
}

export class ClaudeEventNormalizer {
	private readonly options: ClaudeEventNormalizerOptions;

	constructor(options: ClaudeEventNormalizerOptions = {}) {
		this.options = options;
	}

	beginTurn(_context: ClaudeNormalizerTurnContext): void {
		throw new NotImplementedError("ClaudeEventNormalizer.beginTurn");
	}

	normalize(_event: ClaudeSdkStreamEvent): StreamEventEnvelope[] {
		throw new NotImplementedError("ClaudeEventNormalizer.normalize");
	}

	resetTurn(): void {
		throw new NotImplementedError("ClaudeEventNormalizer.resetTurn");
	}

	getProviderId(): string {
		return this.options.providerId ?? "claude-code";
	}
}
