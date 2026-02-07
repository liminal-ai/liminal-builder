import rule from "../src/rules/no-placeholder-throw";
import { createRuleTester } from "./rule-tester";

const ruleTester = createRuleTester();

ruleTester.run("no-placeholder-throw", rule, {
	valid: [
		{
			code: "throw new Error('Invalid canonical ID');",
			filename: "input.ts",
		},
		{
			code: "throw err;",
			filename: "input.ts",
		},
		{
			code: `throw new Error(\`Missing value: \${name}\`);`,
			filename: "input.ts",
		},
	],
	invalid: [
		{
			code: "throw new Error('not implemented');",
			filename: "input.ts",
			errors: [{ messageId: "placeholderThrow" }],
		},
		{
			code: "throw new Error('TODO: wire this handler');",
			filename: "input.ts",
			errors: [{ messageId: "placeholderThrow" }],
		},
		{
			code: "throw new Error('Stub for now');",
			filename: "input.ts",
			errors: [{ messageId: "placeholderThrow" }],
		},
	],
});
