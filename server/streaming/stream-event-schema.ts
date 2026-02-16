import { z } from "zod";

// -- Item cancellation reasons --
export const cancellationReasonSchema = z.enum([
	"user_cancel",
	"timeout",
	"process_death",
]);

export type CancellationReason = z.infer<typeof cancellationReasonSchema>;

// -- Finalized item schema (concrete, not z.unknown()) --
export const finalizedItemSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("message"),
		content: z.string(),
		origin: z.enum(["user", "agent", "system"]),
	}),
	z.object({
		type: z.literal("reasoning"),
		content: z.string(),
		providerId: z.string(),
	}),
	z.object({
		type: z.literal("function_call"),
		name: z.string(),
		callId: z.string(),
		arguments: z.record(z.unknown()),
	}),
	z.object({
		type: z.literal("function_call_output"),
		callId: z.string(),
		output: z.string(),
		isError: z.boolean(),
	}),
]);

export type FinalizedItem = z.infer<typeof finalizedItemSchema>;

// -- Usage schema (concrete, not z.unknown()) --
export const usageSchema = z.object({
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheReadInputTokens: z.number().optional(),
	cacheCreationInputTokens: z.number().optional(),
});

export type Usage = z.infer<typeof usageSchema>;

// -- Stream event payloads --
export const streamEventPayloadSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("response_start"),
		modelId: z.string(),
		providerId: z.string(),
	}),
	z.object({
		type: z.literal("item_start"),
		itemId: z.string(),
		itemType: z.enum([
			"message",
			"reasoning",
			"function_call",
			"function_call_output",
		]),
		initialContent: z.string().optional(),
		name: z.string().optional(),
		callId: z.string().optional(),
	}),
	z.object({
		type: z.literal("item_delta"),
		itemId: z.string(),
		deltaContent: z.string(),
	}),
	z.object({
		type: z.literal("item_done"),
		itemId: z.string(),
		finalItem: finalizedItemSchema,
	}),
	z.object({
		type: z.literal("item_error"),
		itemId: z.string(),
		error: z.object({ code: z.string(), message: z.string() }),
	}),
	z.object({
		type: z.literal("item_cancelled"),
		itemId: z.string(),
		reason: cancellationReasonSchema.optional(),
	}),
	z.object({
		type: z.literal("response_done"),
		status: z.enum(["completed", "cancelled", "error"]),
		finishReason: z.string().optional(),
		usage: usageSchema.optional(),
	}),
	z.object({
		type: z.literal("response_error"),
		error: z.object({ code: z.string(), message: z.string() }),
	}),
]);

export type StreamEventPayload = z.infer<typeof streamEventPayloadSchema>;

// -- Stream event types --
export const streamEventTypeSchema = z.enum([
	"response_start",
	"item_start",
	"item_delta",
	"item_done",
	"item_error",
	"item_cancelled",
	"response_done",
	"response_error",
]);

export type StreamEventType = z.infer<typeof streamEventTypeSchema>;

// -- Envelope --
export const streamEventEnvelopeSchema = z
	.object({
		eventId: z.string(),
		timestamp: z.string().datetime(),
		turnId: z.string(),
		sessionId: z.string(),
		type: streamEventTypeSchema,
		payload: streamEventPayloadSchema,
	})
	.refine((event) => event.type === event.payload.type, {
		message: "Envelope type must match payload.type",
		path: ["type"],
	});

export type StreamEventEnvelope = z.infer<typeof streamEventEnvelopeSchema>;
