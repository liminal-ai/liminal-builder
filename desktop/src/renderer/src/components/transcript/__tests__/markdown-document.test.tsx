/* @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownDocument } from "../MarkdownDocument";

describe("MarkdownDocument", () => {
	it("renders rich markdown with code block chrome and sanitized output", () => {
		render(
			<MarkdownDocument
				entryId="entry-1"
				content={[
					"# Title",
					"",
					"```ts",
					"const value = 1;",
					"```",
					"",
					"<script>alert('xss')</script>",
					"",
					"| a | b |",
					"|---|---|",
					"| 1 | 2 |",
				].join("\n")}
			/>,
		);

		expect(screen.getByRole("heading", { name: "Title" })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Copy ts code block" }),
		).toBeTruthy();
		expect(screen.getByText("ts")).toBeTruthy();
		expect(document.querySelector("script")).toBeNull();
		expect(document.querySelector(".lb-table-wrap table")).toBeTruthy();
	});
});
