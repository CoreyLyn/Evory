"use client";

import { Children, isValidElement, type ReactNode, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { slugifyMarkdownHeading } from "./markdown-link-utils";

type MarkdownContentProps = {
  content: string;
  className?: string;
  variant?: "default" | "compact";
  resolveHref?: (href: string) => string;
};

const variantClasses = {
  default: "text-sm leading-7 sm:text-[15px]",
  compact: "text-sm leading-6",
} as const;

function isExternalHref(href: string) {
  return /^(?:https?:)?\/\//.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href);
}

function flattenMarkdownText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }

      if (isValidElement(child)) {
        return flattenMarkdownText(child.props.children);
      }

      return "";
    })
    .join("");
}

function MarkdownHeading({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
}) {
  const headingText = flattenMarkdownText(children);
  const slug = slugifyMarkdownHeading(headingText);
  const HeadingTag = `h${level}` as const;

  if (!slug) {
    return <HeadingTag>{children}</HeadingTag>;
  }

  return (
    <HeadingTag id={slug} className="group scroll-mt-24">
      <a
        href={`#${slug}`}
        className="inline-flex items-center gap-2 no-underline"
        data-markdown-heading-link={slug}
      >
        <span>{children}</span>
        <span
          aria-hidden="true"
          className="text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100"
        >
          #
        </span>
      </a>
    </HeadingTag>
  );
}

function MarkdownCodeBlock({
  code,
  language,
}: {
  code: string;
  language: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="my-6 overflow-hidden rounded-xl border border-card-border/60 bg-card/80">
      <div className="flex items-center justify-between gap-3 border-b border-card-border/60 px-3 py-2 text-xs text-muted">
        <span
          className="font-medium uppercase tracking-[0.16em]"
          data-markdown-code-language={language ?? "plain"}
        >
          {language ?? "plain text"}
        </span>
        <button
          type="button"
          onClick={() => {
            void handleCopy();
          }}
          className="rounded-md border border-card-border/60 px-2 py-1 text-foreground transition-colors hover:border-accent/40 hover:text-accent"
          data-markdown-copy="code-block"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto rounded-none border-0 bg-transparent p-4">
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownContent({
  content,
  className = "",
  variant = "default",
  resolveHref,
}: MarkdownContentProps) {
  return (
    <div
      data-markdown-content={variant}
      className={[
        "prose prose-invert max-w-none text-foreground",
        "prose-headings:font-display prose-headings:text-foreground",
        "prose-p:text-foreground prose-strong:text-foreground",
        "prose-code:text-foreground prose-code:before:hidden prose-code:after:hidden",
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
          h1: ({ children }) => <MarkdownHeading level={1}>{children}</MarkdownHeading>,
          h2: ({ children }) => <MarkdownHeading level={2}>{children}</MarkdownHeading>,
          h3: ({ children }) => <MarkdownHeading level={3}>{children}</MarkdownHeading>,
          h4: ({ children }) => <MarkdownHeading level={4}>{children}</MarkdownHeading>,
          h5: ({ children }) => <MarkdownHeading level={5}>{children}</MarkdownHeading>,
          h6: ({ children }) => <MarkdownHeading level={6}>{children}</MarkdownHeading>,
          a: ({ href = "", children }) => {
            const resolvedHref = resolveHref?.(href) ?? href;

            if (isExternalHref(resolvedHref)) {
              return (
                <a href={resolvedHref} target="_blank" rel="noreferrer noopener">
                  {children}
                </a>
              );
            }

            if (resolvedHref.startsWith("#")) {
              return <a href={resolvedHref}>{children}</a>;
            }

            return <Link href={resolvedHref}>{children}</Link>;
          },
          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
          code: ({ children, className }) => (
            <code className={className}>{children}</code>
          ),
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
          pre: ({ children }) => {
            const child = Children.only(children);

            if (!isValidElement(child)) {
              return <pre>{children}</pre>;
            }

            const code = flattenMarkdownText(child.props.children).replace(/\n$/, "");
            const className = typeof child.props.className === "string"
              ? child.props.className
              : "";
            const language = className.startsWith("language-")
              ? className.replace(/^language-/, "")
              : null;

            return <MarkdownCodeBlock code={code} language={language} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
