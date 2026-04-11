import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { markdownSanitizeSchema, rehypeSanitize } from "./markdown-sanitize";

export interface MarkdownDocumentProps {
	content: string;
	entryId: string;
}

function flattenText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map((child) => flattenText(child)).join("");
	}
	if (isValidElement(node)) {
		return flattenText(node.props.children);
	}
	return "";
}

function deriveLanguageFromCodeNode(node: ReactNode): string {
	if (!isValidElement(node)) {
		return "text";
	}

	const className = String(node.props.className ?? "");
	const langMatch = className.match(/language-([\w-]+)/);
	return langMatch?.[1] ?? "text";
}

export function MarkdownDocument({ content, entryId }: MarkdownDocumentProps) {
	return (
		<ReactMarkdown
			className="lb-markdown-doc"
			remarkPlugins={[remarkGfm]}
			rehypePlugins={[
				rehypeHighlight,
				[rehypeSanitize, markdownSanitizeSchema],
			]}
			components={{
				h1: ({ children }) => <h1 className="lb-md-h1">{children}</h1>,
				h2: ({ children }) => <h2 className="lb-md-h2">{children}</h2>,
				h3: ({ children }) => <h3 className="lb-md-h3">{children}</h3>,
				h4: ({ children }) => <h4 className="lb-md-h4">{children}</h4>,
				p: ({ children }) => <p className="lb-md-paragraph">{children}</p>,
				ul: ({ children }) => (
					<ul className="lb-md-list lb-md-list-ul">{children}</ul>
				),
				ol: ({ children }) => (
					<ol className="lb-md-list lb-md-list-ol">{children}</ol>
				),
				li: ({ children }) => <li className="lb-md-list-item">{children}</li>,
				blockquote: ({ children }) => (
					<blockquote className="lb-md-blockquote">{children}</blockquote>
				),
				hr: () => <hr className="lb-md-rule" />,
				pre: ({ children, className }) => {
					const codeNode = Children.toArray(children)[0] ?? null;
					const language = deriveLanguageFromCodeNode(codeNode);
					const rawCode = flattenText(codeNode).replace(/\n$/, "");

					return (
						<CodeBlock
							entryId={entryId}
							language={language}
							rawCode={rawCode}
							preClassName={className}
						>
							{children}
						</CodeBlock>
					);
				},
				code: ({ children, className }) => {
					const inlineCode = !String(className ?? "").includes("language-");
					if (!inlineCode) {
						return <code className={className}>{children}</code>;
					}
					return <code className="lb-inline-code">{children}</code>;
				},
				table: ({ children }) => (
					<div className="lb-table-wrap">
						<table>{children}</table>
					</div>
				),
				thead: ({ children }) => (
					<thead className="lb-md-thead">{children}</thead>
				),
				tbody: ({ children }) => (
					<tbody className="lb-md-tbody">{children}</tbody>
				),
				th: ({ children }) => <th className="lb-md-th">{children}</th>,
				td: ({ children }) => <td className="lb-md-td">{children}</td>,
				a: ({ href, children }) => (
					<a
						className="lb-md-link"
						href={href}
						target="_blank"
						rel="noreferrer noopener"
					>
						{children}
					</a>
				),
			}}
		>
			{content}
		</ReactMarkdown>
	);
}
