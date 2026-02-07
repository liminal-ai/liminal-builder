import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
	(name) =>
		`https://github.com/leemoore/liminal-builder/tree/main/tools/eslint-plugin-lb#${name}`,
);

const PLACEHOLDER_MESSAGE = /\b(not[\s-]?implemented|todo|stub)\b/i;

type MessageIds = "placeholderThrow";
type Options = [];

function getStringValue(node: TSESTree.Expression): string | null {
	if (node.type === "Literal") {
		return typeof node.value === "string" ? node.value : null;
	}

	if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
		return node.quasis
			.map((part) => part.value.cooked ?? part.value.raw)
			.join("");
	}

	return null;
}

export default createRule<Options, MessageIds>({
	name: "no-placeholder-throw",
	meta: {
		type: "problem",
		docs: {
			description: "Disallow placeholder Error throws in runtime code.",
		},
		schema: [],
		messages: {
			placeholderThrow:
				"Placeholder throw detected. Implement the runtime path or replace it with a tracked, typed alternative instead of throwing '{{text}}'.",
		},
	},
	defaultOptions: [],
	create(context) {
		return {
			ThrowStatement(node) {
				const argument = node.argument;
				if (!argument || argument.type !== "NewExpression") {
					return;
				}

				if (
					argument.callee.type !== "Identifier" ||
					argument.callee.name !== "Error"
				) {
					return;
				}

				const [firstArg] = argument.arguments;
				if (!firstArg || firstArg.type === "SpreadElement") {
					return;
				}

				const text = getStringValue(firstArg);
				if (!text || !PLACEHOLDER_MESSAGE.test(text)) {
					return;
				}

				context.report({
					node: firstArg,
					messageId: "placeholderThrow",
					data: {
						text,
					},
				});
			},
		};
	},
});
