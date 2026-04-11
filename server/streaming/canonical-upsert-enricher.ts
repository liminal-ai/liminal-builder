import type {
	CanonicalAnnotationKind,
	CanonicalContentFormat,
	CanonicalSemanticRole,
	ToolCallUpsert,
	UpsertObject,
} from "./upsert-types";

export interface CanonicalUpsertContext {
	itemOrder: number;
	turnOrder: number;
}

function inferTextFormat(content: string): CanonicalContentFormat {
	const trimmed = content.trim();
	if (trimmed.length === 0) {
		return "plain";
	}
	if (
		(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
		(trimmed.startsWith("[") && trimmed.endsWith("]"))
	) {
		return "json";
	}
	if (
		trimmed.startsWith("diff --git") ||
		trimmed.startsWith("@@ ") ||
		trimmed.startsWith("--- ") ||
		trimmed.startsWith("+++ ")
	) {
		return "diff";
	}
	if (trimmed.includes("```")) {
		return "markdown";
	}
	return "plain";
}

function inferMessageRole(upsert: Extract<UpsertObject, { type: "message" }>): {
	semanticRole: CanonicalSemanticRole;
	annotationKind?: CanonicalAnnotationKind;
	contentFormat: CanonicalContentFormat;
	isPrimaryTurnOutput: boolean;
} {
	if (upsert.origin === "user") {
		return {
			semanticRole: "user_prompt",
			contentFormat: "plain",
			isPrimaryTurnOutput: false,
		};
	}
	if (upsert.origin === "system") {
		return {
			semanticRole: upsert.status === "error" ? "error" : "system_notice",
			annotationKind: upsert.status === "error" ? "error" : "system",
			contentFormat: inferTextFormat(upsert.content),
			isPrimaryTurnOutput: false,
		};
	}
	return {
		semanticRole: upsert.status === "error" ? "error" : "primary_response",
		annotationKind: upsert.status === "error" ? "error" : undefined,
		contentFormat: "markdown",
		isPrimaryTurnOutput: upsert.status !== "error",
	};
}

function enrichToolUpsert(
	upsert: ToolCallUpsert,
	context: CanonicalUpsertContext,
): ToolCallUpsert {
	const toolArgumentsText =
		Object.keys(upsert.toolArguments).length > 0
			? JSON.stringify(upsert.toolArguments, null, 2)
			: undefined;
	const toolOutputFormat =
		typeof upsert.toolOutput === "string" && upsert.toolOutput.length > 0
			? inferTextFormat(upsert.toolOutput)
			: undefined;
	return {
		...upsert,
		semanticRole:
			upsert.status === "error" || upsert.toolOutputIsError
				? "error"
				: "tool_activity",
		annotationKind:
			upsert.status === "error" || upsert.toolOutputIsError ? "error" : "tool",
		contentFormat: upsert.contentFormat ?? "plain",
		itemOrder: upsert.itemOrder ?? context.itemOrder,
		turnOrder: upsert.turnOrder ?? context.turnOrder,
		isPrimaryTurnOutput: false,
		toolDisplayName: upsert.toolDisplayName ?? upsert.toolName,
		...(toolArgumentsText ? { toolArgumentsText } : {}),
		...(toolOutputFormat ? { toolOutputFormat } : {}),
	};
}

export function enrichCanonicalUpsert(
	upsert: UpsertObject,
	context: CanonicalUpsertContext,
): UpsertObject {
	if (upsert.type === "message") {
		const derived = inferMessageRole(upsert);
		return {
			...upsert,
			semanticRole: upsert.semanticRole ?? derived.semanticRole,
			annotationKind: upsert.annotationKind ?? derived.annotationKind,
			contentFormat: upsert.contentFormat ?? derived.contentFormat,
			itemOrder: upsert.itemOrder ?? context.itemOrder,
			turnOrder: upsert.turnOrder ?? context.turnOrder,
			isPrimaryTurnOutput:
				upsert.isPrimaryTurnOutput ?? derived.isPrimaryTurnOutput,
		};
	}

	if (upsert.type === "thinking") {
		return {
			...upsert,
			semanticRole: upsert.semanticRole ?? "thinking",
			annotationKind: upsert.annotationKind ?? "thinking",
			contentFormat: upsert.contentFormat ?? "plain",
			itemOrder: upsert.itemOrder ?? context.itemOrder,
			turnOrder: upsert.turnOrder ?? context.turnOrder,
			isPrimaryTurnOutput: upsert.isPrimaryTurnOutput ?? false,
		};
	}

	return enrichToolUpsert(upsert, context);
}
