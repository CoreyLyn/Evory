"use client";

import { Children, isValidElement, type ReactElement, type ReactNode, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { highlightCode } from "./code-highlighter";
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

const variantInsetClasses = {
  default: "px-1 sm:px-2",
  compact: "px-0.5 sm:px-1",
} as const;

const headingLevelClasses = {
  1: "first:mt-0 mt-8 text-3xl font-semibold tracking-tight sm:text-4xl",
  2: "mt-10 text-2xl font-semibold tracking-tight sm:text-[1.75rem]",
  3: "mt-8 text-lg font-semibold tracking-tight sm:text-xl",
  4: "mt-6 text-base font-semibold uppercase tracking-[0.14em] text-muted",
  5: "mt-5 text-sm font-semibold uppercase tracking-[0.12em] text-muted",
  6: "mt-5 text-sm font-medium tracking-[0.08em] text-muted",
} as const;

function isExternalHref(href: string) {
  return /^(?:https?:)?\/\//.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href);
}

type MarkdownElementProps = {
  children?: ReactNode;
  className?: string;
};

function isMarkdownElement(child: ReactNode): child is ReactElement<MarkdownElementProps> {
  return isValidElement<MarkdownElementProps>(child);
}

function flattenMarkdownText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }

      if (isMarkdownElement(child)) {
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
  const headingClassName = [
    "group scroll-mt-24",
    headingLevelClasses[level],
  ].join(" ");

  if (!slug) {
    return <HeadingTag className={headingClassName}>{children}</HeadingTag>;
  }

  return (
    <HeadingTag id={slug} className={headingClassName}>
      <a
        href={`#${slug}`}
        className="inline-flex items-center gap-2 no-underline transition-colors hover:text-accent"
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
        <code className={language ? `language-${language}` : undefined}>
          {highlightCode(code, language)}
        </code>
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
        variantInsetClasses[variant],
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
          hr: () => (
            <hr className="my-8 border-t border-card-border/60" />
          ),
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
            <div
              data-markdown-table="true"
              className="my-6 overflow-x-auto rounded-2xl border border-card-border/60 bg-card/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_10px_24px_-18px_rgba(0,0,0,0.3)]"
            >
              <table className="min-w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-card-border/70 bg-background/40">
              {children}
            </thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-card-border/40 last:border-b-0">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-xs font-semibold tracking-[0.02em] text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 align-top text-foreground/90">
              {children}
            </td>
          ),
          pre: ({ children }) => {
            const child = Children.only(children);

            if (!isMarkdownElement(child)) {
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
