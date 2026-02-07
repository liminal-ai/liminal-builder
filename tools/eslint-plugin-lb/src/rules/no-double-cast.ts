import { ESLintUtils, type TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(
	(name) =>
		`https://github.com/leemoore/liminal-builder/tree/main/tools/eslint-plugin-lb#${name}`,
);

type MessageIds = "doubleCast";
type Options = [];

type AssertionNode = TSESTree.TSAsExpression | TSESTree.TSTypeAssertion;

function isAssertion(
	node: TSESTree.Node | null | undefined,
): node is AssertionNode {
	return node?.type === "TSAsExpression" || node?.type === "TSTypeAssertion";
}

export default createRule<Options, MessageIds>({
	name: "no-double-cast",
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow chained type assertions such as `as unknown as T`.",
		},
		schema: [],
		messages: {
			doubleCast:
				"Avoid chained assertions like 'as unknown as T'. Use runtime validation or a narrowing guard before a single cast.",
		},
	},
	defaultOptions: [],
	create(context) {
		const checkNode = (node: AssertionNode): void => {
			if (isAssertion(node.parent)) {
				return;
			}

			if (!isAssertion(node.expression)) {
				return;
			}

			context.report({
				node,
				messageId: "doubleCast",
			});
		};

		return {
			TSAsExpression: checkNode,
			TSTypeAssertion: checkNode,
		};
	},
});
