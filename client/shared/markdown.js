import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

/** @param {string} text */
export function renderMarkdown(text) {
	const html = marked.parse(text ?? "");
	return DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
		ADD_TAGS: ["pre", "code", "span"],
		ADD_ATTR: ["class"],
	});
}
