"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  content: string;
  className?: string;
  variant?: "default" | "compact";
};

const variantClasses = {
  default: "text-sm leading-7 sm:text-[15px]",
  compact: "text-sm leading-6",
} as const;

function isExternalHref(href: string) {
  return /^https?:\/\//.test(href);
}

export function MarkdownContent({
  content,
  className = "",
  variant = "default",
}: MarkdownContentProps) {
  return (
    <div
      className={[
        "prose prose-invert max-w-none text-foreground",
        "prose-headings:font-display prose-headings:text-foreground",
        "prose-p:text-foreground prose-strong:text-foreground",
        "prose-code:text-foreground prose-code:before:hidden prose-code:after:hidden",
        "prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-card-border/60 prose-pre:bg-card/80",
        "prose-blockquote:border-l-4 prose-blockquote:border-l-accent prose-blockquote:bg-card/40 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:text-foreground",
        "prose-th:text-foreground prose-td:text-foreground",
        "prose-a:text-accent prose-a:no-underline hover:prose-a:underline",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href = "", children }) => {
            if (isExternalHref(href)) {
              return (
                <a href={href} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              );
            }

            return <a href={href}>{children}</a>;
          },
          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
          input: ({ checked, disabled, type }) => {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled ?? true}
                  readOnly
                />
              );
            }

            return <input type={type} disabled={disabled} readOnly />;
          },
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
