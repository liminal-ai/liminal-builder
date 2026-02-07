import { marked } from "/node_modules/marked/lib/marked.esm.js";

/**
 * Render markdown string to sanitized HTML.
 * Uses marked for GFM parsing.
 * DOMPurify will be loaded from CDN in the HTML pages.
 *
 * For MVP, we skip highlight.js integration and use basic marked rendering.
 * Syntax highlighting will be added when chat rendering is implemented.
 *
 * @param {string} text - Raw markdown text
 * @returns {string} Sanitized HTML string
 */
export function renderMarkdown(text) {
	const html = marked.parse(text, { gfm: true, breaks: true });
	// DOMPurify is expected to be available globally (loaded via CDN in HTML)
	if (typeof DOMPurify !== "undefined") {
		return DOMPurify.sanitize(html);
	}
	return html;
}
