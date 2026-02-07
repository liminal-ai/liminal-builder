import rule from "../src/rules/no-double-cast";
import { createRuleTester } from "./rule-tester";

const ruleTester = createRuleTester();

ruleTester.run("no-double-cast", rule, {
	valid: [
		{
			code: "const value = input as string;",
			filename: "input.ts",
		},
		{
			code: "const value = (<string>input).toUpperCase();",
			filename: "input.ts",
		},
		{
			code: "const value = parse(input);",
			filename: "input.ts",
		},
	],
	invalid: [
		{
			code: "const value = input as unknown as string;",
			filename: "input.ts",
			errors: [{ messageId: "doubleCast" }],
		},
		{
			code: "const value = (<unknown>input) as string;",
			filename: "input.ts",
			errors: [{ messageId: "doubleCast" }],
		},
		{
			code: "const value = (input as unknown as string) as number;",
			filename: "input.ts",
			errors: [{ messageId: "doubleCast" }],
		},
	],
});
