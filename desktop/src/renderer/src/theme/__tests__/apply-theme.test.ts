/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, bootstrapTheme } from "../apply-theme";
import { defaultTheme } from "../default-theme";
import { THEME_STORAGE_KEY, type ThemeDefinition } from "../theme-types";

describe("theme apply/bootstrap", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("style");
  });

  it("applies default theme tokens and persists theme id", () => {
    const resolved = bootstrapTheme();

    expect(resolved.id).toBe(defaultTheme.id);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(defaultTheme.id);
    expect(document.documentElement.dataset.theme).toBe(defaultTheme.id);
    expect(getComputedStyle(document.documentElement).getPropertyValue("--lb-bg-main").trim()).toBe(
      defaultTheme.tokens["--lb-bg-main"],
    );
  });

  it("applies provided theme definition directly", () => {
    const customTheme: ThemeDefinition = {
      id: "test-theme",
      name: "Test Theme",
      tokens: {
        "--lb-bg-main": "#111111",
        "--lb-text-primary": "#efefef",
      },
    };

    applyTheme(customTheme);

    expect(document.documentElement.dataset.theme).toBe("test-theme");
    expect(getComputedStyle(document.documentElement).getPropertyValue("--lb-bg-main").trim()).toBe(
      "#111111",
    );
  });
});
