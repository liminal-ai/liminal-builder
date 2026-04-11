import { describe, expect, it } from "vitest";
import { resolveDesktopPort } from "../sidecar";

describe("resolveDesktopPort", () => {
	it("returns default when env var is missing", () => {
		expect(resolveDesktopPort({})).toBe(3051);
	});

	it("returns parsed env port for valid values", () => {
		expect(resolveDesktopPort({ LB_DESKTOP_SERVER_PORT: "4210" })).toBe(4210);
	});

	it("falls back to default for invalid values", () => {
		expect(resolveDesktopPort({ LB_DESKTOP_SERVER_PORT: "0" })).toBe(3051);
		expect(resolveDesktopPort({ LB_DESKTOP_SERVER_PORT: "abc" })).toBe(3051);
	});
});
