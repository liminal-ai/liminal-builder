import { defaultTheme } from "./default-theme";
import { THEME_STORAGE_KEY, type ThemeDefinition } from "./theme-types";

const themeRegistry: Record<string, ThemeDefinition> = {
	[defaultTheme.id]: defaultTheme,
};

function resolveTheme(themeId: string | null | undefined): ThemeDefinition {
	if (!themeId) {
		return defaultTheme;
	}

	return themeRegistry[themeId] ?? defaultTheme;
}

export function applyTheme(theme: ThemeDefinition): void {
	const root = document.documentElement;
	root.dataset.theme = theme.id;
	for (const [token, value] of Object.entries(theme.tokens)) {
		root.style.setProperty(token, value);
	}
}

export function bootstrapTheme(): ThemeDefinition {
	let storedThemeId: string | null = null;
	try {
		storedThemeId = window.localStorage.getItem(THEME_STORAGE_KEY);
	} catch {
		storedThemeId = null;
	}

	const resolved = resolveTheme(storedThemeId);
	applyTheme(resolved);

	try {
		window.localStorage.setItem(THEME_STORAGE_KEY, resolved.id);
	} catch {
		// Ignore persistence failures.
	}

	return resolved;
}
