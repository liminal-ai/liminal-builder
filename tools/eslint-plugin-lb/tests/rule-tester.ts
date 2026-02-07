import { RuleTester } from "@typescript-eslint/rule-tester";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	it,
} from "vitest";
import tseslint from "typescript-eslint";

RuleTester.afterAll = afterAll;
RuleTester.afterEach = afterEach;
RuleTester.beforeAll = beforeAll;
RuleTester.beforeEach = beforeEach;
RuleTester.describe = describe;
RuleTester.it = it;

export function createRuleTester(): RuleTester {
	return new RuleTester({
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				projectService: {
					allowDefaultProject: ["*.ts"],
				},
				tsconfigRootDir: process.cwd(),
			},
		},
	});
}
