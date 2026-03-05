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
      rehypePlugins={[rehypeHighlight, [rehypeSanitize, markdownSanitizeSchema]]}
      components={{
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
        table: ({ children }) => <div className="lb-table-wrap"><table>{children}</table></div>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
