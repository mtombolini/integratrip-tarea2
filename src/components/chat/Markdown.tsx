"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Model text is untrusted: react-markdown builds React elements (no
// innerHTML) and ignores raw HTML, so markup in the text is never executed.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm prose-slate max-w-none break-words prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mb-2 prose-headings:mt-4 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-table:text-sm first:prose-p:mt-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
