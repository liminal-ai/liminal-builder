const STORAGE_KEY = "liminal:sidebar-width";
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 220;
const MAX_WIDTH_CAP = 640;
const MAX_WIDTH_RATIO = 0.6;

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function getMaxWidth(win) {
	return Math.max(
		MIN_WIDTH,
		Math.min(MAX_WIDTH_CAP, Math.floor(win.innerWidth * MAX_WIDTH_RATIO)),
	);
}

function parseSavedWidth(raw) {
	if (typeof raw !== "string") {
		return null;
	}
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

export function initSidebarResizer(options = {}) {
	const doc = options.document ?? document;
	const win = options.window ?? window;
	const storage = options.storage ?? win.localStorage;
	const app = doc.getElementById("app");
	const resizer = doc.getElementById("sidebar-resizer");

	if (!(app instanceof HTMLElement) || !(resizer instanceof HTMLElement)) {
		return () => {};
	}

	let currentWidth = DEFAULT_WIDTH;
	let dragging = false;
	let dragStartX = 0;
	let dragStartWidth = DEFAULT_WIDTH;

	function setAriaValue(width) {
		resizer.setAttribute("aria-valuemin", String(MIN_WIDTH));
		resizer.setAttribute("aria-valuemax", String(getMaxWidth(win)));
		resizer.setAttribute("aria-valuenow", String(width));
	}

	function applyWidth(width) {
		const next = clamp(width, MIN_WIDTH, getMaxWidth(win));
		currentWidth = next;
		app.style.setProperty("--sidebar-width", `${next}px`);
		setAriaValue(next);
		return next;
	}

	function persistWidth(width) {
		try {
			storage?.setItem(STORAGE_KEY, String(width));
		} catch {
			// Ignore storage failures (private mode, disabled storage).
		}
	}

	function loadSavedWidth() {
		try {
			return parseSavedWidth(storage?.getItem(STORAGE_KEY));
		} catch {
			return null;
		}
	}

	function resetWidth() {
		applyWidth(DEFAULT_WIDTH);
		try {
			storage?.removeItem(STORAGE_KEY);
		} catch {
			// Ignore storage failures.
		}
	}

	function onMouseMove(event) {
		if (!dragging) {
			return;
		}
		const delta = event.clientX - dragStartX;
		applyWidth(dragStartWidth + delta);
	}

	function onMouseUp() {
		if (!dragging) {
			return;
		}
		dragging = false;
		doc.body.classList.remove("sidebar-resizing");
		persistWidth(currentWidth);
	}

	function onMouseDown(event) {
		dragging = true;
		dragStartX = event.clientX;
		dragStartWidth = currentWidth;
		doc.body.classList.add("sidebar-resizing");
		event.preventDefault();
	}

	function onKeyDown(event) {
		const step = event.shiftKey ? 32 : 16;
		if (event.key === "ArrowLeft") {
			applyWidth(currentWidth - step);
			persistWidth(currentWidth);
			event.preventDefault();
			return;
		}
		if (event.key === "ArrowRight") {
			applyWidth(currentWidth + step);
			persistWidth(currentWidth);
			event.preventDefault();
			return;
		}
		if (event.key === "Home") {
			applyWidth(MIN_WIDTH);
			persistWidth(currentWidth);
			event.preventDefault();
			return;
		}
		if (event.key === "End") {
			applyWidth(getMaxWidth(win));
			persistWidth(currentWidth);
			event.preventDefault();
		}
	}

	function onWindowResize() {
		applyWidth(currentWidth);
	}

	const saved = loadSavedWidth();
	applyWidth(saved ?? DEFAULT_WIDTH);

	resizer.addEventListener("mousedown", onMouseDown);
	resizer.addEventListener("dblclick", resetWidth);
	resizer.addEventListener("keydown", onKeyDown);
	win.addEventListener("mousemove", onMouseMove);
	win.addEventListener("mouseup", onMouseUp);
	win.addEventListener("resize", onWindowResize);

	return () => {
		resizer.removeEventListener("mousedown", onMouseDown);
		resizer.removeEventListener("dblclick", resetWidth);
		resizer.removeEventListener("keydown", onKeyDown);
		win.removeEventListener("mousemove", onMouseMove);
		win.removeEventListener("mouseup", onMouseUp);
		win.removeEventListener("resize", onWindowResize);
		doc.body.classList.remove("sidebar-resizing");
	};
}
