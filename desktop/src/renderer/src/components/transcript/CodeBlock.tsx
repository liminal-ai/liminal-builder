import { useState, type ReactNode } from "react";

export interface CodeBlockProps {
	entryId: string;
	language: string;
	rawCode: string;
	preClassName?: string;
	children: ReactNode;
}

export function CodeBlock({
	entryId,
	language,
	rawCode,
	preClassName,
	children,
}: CodeBlockProps) {
	const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
		"idle",
	);

	const handleCopy = async () => {
		if (!rawCode) {
			return;
		}

		try {
			await navigator.clipboard.writeText(rawCode);
			setCopyState("copied");
			window.setTimeout(() => {
				setCopyState("idle");
			}, 1500);
		} catch {
			setCopyState("error");
			window.setTimeout(() => {
				setCopyState("idle");
			}, 1500);
		}
	};

	return (
		<figure className="lb-codeblock" data-entry-id={entryId}>
			<figcaption className="lb-codeblock-header">
				<span className="lb-codeblock-language">
					{(language || "text").replace(/^language-/, "")}
				</span>
				<button
					type="button"
					className="lb-codeblock-copy-btn"
					onClick={handleCopy}
					aria-label={`Copy ${language || "text"} code block`}
				>
					{copyState === "copied"
						? "Copied"
						: copyState === "error"
							? "Retry"
							: "Copy"}
				</button>
			</figcaption>
			<pre className={`lb-codeblock-pre ${preClassName ?? ""}`.trim()}>
				{children}
			</pre>
		</figure>
	);
}
