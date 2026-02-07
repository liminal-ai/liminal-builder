import js from "@eslint/js";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import tseslint from "typescript-eslint";

const repoRootDir = fileURLToPath(new URL(".", import.meta.url));
const pluginDistUrl = new URL(
	"./tools/eslint-plugin-lb/dist/index.js",
	import.meta.url,
);
const pluginDistPath = fileURLToPath(pluginDistUrl);

if (!existsSync(pluginDistPath)) {
	execFileSync("bun", ["run", "build:eslint-plugin"], {
		stdio: "inherit",
		cwd: repoRootDir,
	});
}

const { default: lbPlugin } = await import(pathToFileURL(pluginDistPath).href);

const typedSourceGlobs = ["server/**/*.ts", "shared/**/*.ts", "tests/**/*.ts"];

export default tseslint.config(
	{
		ignores: [
			"client/**",
			"dist/**",
			"node_modules/**",
			"tools/eslint-plugin-lb/dist/**",
		],
	},
	{
		files: typedSourceGlobs,
		extends: [
			js.configs.recommended,
			...tseslint.configs.recommendedTypeChecked,
		],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: repoRootDir,
			},
		},
		plugins: {
			lb: lbPlugin,
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/require-await": "off",
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-unsafe-assignment": "error",
			"@typescript-eslint/no-unsafe-call": "error",
			"@typescript-eslint/no-unsafe-member-access": "error",
			"@typescript-eslint/no-unsafe-return": "error",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/switch-exhaustiveness-check": "error",
			"@typescript-eslint/no-unnecessary-type-assertion": "error",
			"lb/no-placeholder-throw": "error",
			"lb/no-double-cast": "error",
			"lb/no-raw-websocket-send": "off",
		},
	},
	{
		files: ["server/**/*.ts"],
		rules: {
			"lb/no-raw-websocket-send": "error",
		},
	},
	{
		files: ["tests/**/*.ts", "**/fixtures/**/*.ts"],
		rules: {
			"lb/no-placeholder-throw": "off",
			"lb/no-raw-websocket-send": "off",
		},
	},
);
