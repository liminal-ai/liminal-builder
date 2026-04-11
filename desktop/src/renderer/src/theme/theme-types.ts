export interface ThemeTokenMap {
	[cssVarName: string]: string;
}

export interface ThemeDefinition {
	id: string;
	name: string;
	tokens: ThemeTokenMap;
}

export const THEME_STORAGE_KEY = "lb:desktop:theme-id";
