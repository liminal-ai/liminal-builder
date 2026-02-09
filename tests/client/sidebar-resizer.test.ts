// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

type StorageLike = {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
	removeItem: (key: string) => void;
};

type SidebarResizerModule = {
	initSidebarResizer: (options?: {
		document?: Document;
		window?: Window;
		storage?: StorageLike;
	}) => () => void;
};

const MODULE_PATH = "../../client/shell/sidebar-resizer.js";
const STORAGE_KEY = "liminal:sidebar-width";

function setupDOM() {
	document.body.innerHTML = `
		<div id="app" class="shell-layout"></div>
		<div id="sidebar-resizer" tabindex="0"></div>
	`;
}

function createStorage(initial: Record<string, string> = {}): StorageLike {
	const map = new Map(Object.entries(initial));
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => {
			map.set(key, value);
		},
		removeItem: (key) => {
			map.delete(key);
		},
	};
}

function setWindowWidth(width: number) {
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		value: width,
	});
}

async function importSidebarResizer(): Promise<SidebarResizerModule> {
	const moduleValue: unknown = await import(MODULE_PATH);
	return moduleValue as SidebarResizerModule;
}

describe("Sidebar resizer", () => {
	beforeEach(() => {
		vi.resetModules();
		setupDOM();
		setWindowWidth(1400);
	});

	it("loads saved width on init", async () => {
		const storage = createStorage({ [STORAGE_KEY]: "340" });
		const { initSidebarResizer } = await importSidebarResizer();

		initSidebarResizer({ storage, window, document });

		const app = document.getElementById("app");
		expect(app?.style.getPropertyValue("--sidebar-width")).toBe("340px");
	});

	it("drag updates width and persists on mouseup", async () => {
		const storage = createStorage();
		const setItem = vi.spyOn(storage, "setItem");
		const { initSidebarResizer } = await importSidebarResizer();
		initSidebarResizer({ storage, window, document });

		const resizer = document.getElementById("sidebar-resizer");
		const app = document.getElementById("app");
		if (!(resizer instanceof HTMLElement) || !(app instanceof HTMLElement)) {
			throw new Error("Missing test elements");
		}

		resizer.dispatchEvent(
			new MouseEvent("mousedown", { clientX: 300, bubbles: true }),
		);
		window.dispatchEvent(
			new MouseEvent("mousemove", { clientX: 380, bubbles: true }),
		);
		window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

		expect(app.style.getPropertyValue("--sidebar-width")).toBe("340px");
		expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, "340");
	});

	it("double-click resets to default and clears storage", async () => {
		const storage = createStorage({ [STORAGE_KEY]: "400" });
		const removeItem = vi.spyOn(storage, "removeItem");
		const { initSidebarResizer } = await importSidebarResizer();
		initSidebarResizer({ storage, window, document });

		const resizer = document.getElementById("sidebar-resizer");
		const app = document.getElementById("app");
		if (!(resizer instanceof HTMLElement) || !(app instanceof HTMLElement)) {
			throw new Error("Missing test elements");
		}

		resizer.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		expect(app.style.getPropertyValue("--sidebar-width")).toBe("260px");
		expect(removeItem).toHaveBeenCalledWith(STORAGE_KEY);
	});

	it("keyboard resize works with arrow keys", async () => {
		const storage = createStorage();
		const setItem = vi.spyOn(storage, "setItem");
		const { initSidebarResizer } = await importSidebarResizer();
		initSidebarResizer({ storage, window, document });

		const resizer = document.getElementById("sidebar-resizer");
		const app = document.getElementById("app");
		if (!(resizer instanceof HTMLElement) || !(app instanceof HTMLElement)) {
			throw new Error("Missing test elements");
		}

		resizer.dispatchEvent(
			new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
		);
		expect(app.style.getPropertyValue("--sidebar-width")).toBe("276px");
		expect(setItem).toHaveBeenLastCalledWith(STORAGE_KEY, "276");
	});
});
