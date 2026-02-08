import { marked } from "/node_modules/marked/lib/marked.esm.js";

marked.setOptions({ gfm: true, breaks: true });

/** @param {string} text */
export function renderMarkdown(text) {
	const html = marked.parse(text ?? "");
	if (typeof window !== "undefined" && window.DOMPurify) {
		return window.DOMPurify.sanitize(html, {
			USE_PROFILES: { html: true },
			ADD_TAGS: ["pre", "code", "span"],
			ADD_ATTR: ["class"],
		});
	}
	return html;
}
