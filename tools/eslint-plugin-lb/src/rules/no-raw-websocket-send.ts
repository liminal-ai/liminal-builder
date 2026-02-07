import type * as ts from "typescript";
import {
	ESLintUtils,
	type TSESLint,
	type TSESTree,
} from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
	(name) =>
		`https://github.com/leemoore/liminal-builder/tree/main/tools/eslint-plugin-lb#${name}`,
);

type MessageIds = "rawWebSocketSend" | "useSendEnvelopeSuggestion";
type Options = [];

function isWebSocketLikeType(type: ts.Type, checker: ts.TypeChecker): boolean {
	if (type.isUnionOrIntersection()) {
		return type.types.some((part) => isWebSocketLikeType(part, checker));
	}

	const typeName = checker.typeToString(type).toLowerCase();
	if (typeName.includes("websocket")) {
		return true;
	}

	const symbol = type.getSymbol();
	if (symbol?.getName().toLowerCase().includes("websocket")) {
		return true;
	}

	const aliasSymbol = type.aliasSymbol;
	return Boolean(aliasSymbol?.getName().toLowerCase().includes("websocket"));
}

function isSimpleSendCall(
	node: TSESTree.CallExpression,
): node is TSESTree.CallExpression & {
	callee: TSESTree.MemberExpression & {
		computed: false;
		property: TSESTree.Identifier;
	};
} {
	return (
		node.callee.type === "MemberExpression" &&
		node.callee.computed === false &&
		node.callee.property.type === "Identifier" &&
		node.callee.property.name === "send"
	);
}

function isInsideSendEnvelope(
	context: Readonly<TSESLint.RuleContext<MessageIds, Options>>,
	node: TSESTree.Node,
): boolean {
	for (const ancestor of context.sourceCode.getAncestors(node)) {
		if (
			ancestor.type === "FunctionDeclaration" &&
			ancestor.id?.name === "sendEnvelope"
		) {
			return true;
		}

		if (
			ancestor.type === "VariableDeclarator" &&
			ancestor.id.type === "Identifier" &&
			ancestor.id.name === "sendEnvelope"
		) {
			return true;
		}
	}

	return false;
}

export default createRule<Options, MessageIds>({
	name: "no-raw-websocket-send",
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow direct websocket `.send(...)` calls in server runtime code.",
		},
		hasSuggestions: true,
		schema: [],
		messages: {
			rawWebSocketSend:
				"Do not call websocket `.send(...)` directly. Use `sendEnvelope(...)` so payloads are emitted through the typed envelope path.",
			useSendEnvelopeSuggestion:
				"Replace direct send call with sendEnvelope(websocket, payload).",
		},
	},
	defaultOptions: [],
	create(context) {
		const sourceCode = context.sourceCode;
		const services = ESLintUtils.getParserServices(context);
		const checker = services.program.getTypeChecker();

		return {
			CallExpression(node): void {
				if (!isSimpleSendCall(node)) {
					return;
				}

				if (isInsideSendEnvelope(context, node)) {
					return;
				}

				const tsNode = services.esTreeNodeToTSNodeMap.get(node.callee.object);
				const type = checker.getTypeAtLocation(tsNode);
				if (!isWebSocketLikeType(type, checker)) {
					return;
				}

				const canSuggest = node.arguments.length === 1;
				const objectText = sourceCode.getText(node.callee.object);
				const payloadText = canSuggest
					? sourceCode.getText(node.arguments[0])
					: null;

				context.report({
					node: node.callee.property,
					messageId: "rawWebSocketSend",
					suggest:
						canSuggest && payloadText
							? [
									{
										messageId: "useSendEnvelopeSuggestion",
										fix: (fixer) =>
											fixer.replaceText(
												node,
												`sendEnvelope(${objectText}, ${payloadText})`,
											),
									},
								]
							: undefined,
				});
			},
		};
	},
});
