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

const bodyLinkClassName = "text-accent no-underline underline-offset-4 hover:underline";

function isExternalHref(href: string) {
  return /^(?:https?:)?\/\//.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href);
}

type MarkdownElementProps = {
  children?: ReactNode;
  className?: string;
};

type MarkdownTextNode = {
  type: "text";
  value: string;
};

type MarkdownStrongNode = {
  type: "strong";
  children: MarkdownPhrasingNode[];
};

type MarkdownInlineCodeNode = {
  type: "inlineCode";
  value: string;
};

type MarkdownParentNode = {
  type: string;
  children: MarkdownNode[];
};

type MarkdownPhrasingNode =
  | MarkdownTextNode
  | MarkdownStrongNode
  | MarkdownInlineCodeNode
  | MarkdownParentNode;

type MarkdownNode =
  | MarkdownTextNode
  | MarkdownStrongNode
  | MarkdownInlineCodeNode
  | MarkdownParentNode;

const quotedStrongPattern =
  /\*\*((?:"(?:[^"\n]+?)"[^*\n]*?|“(?:[^”\n]+?)”[^*\n]*?))\*\*/g;
const quotedStrongStartPattern =
  /^(.*)\*\*((?:"(?:[^"\n]+?)"|“(?:[^”\n]+?)”))$/;
const quotedStrongEndPattern =
  /^((?:"(?:[^"\n]+?)"|“(?:[^”\n]+?)”))\*\*(.*)$/;

const phrasingContainerTypes = new Set([
  "paragraph",
  "heading",
  "emphasis",
  "strong",
  "delete",
  "link",
  "linkReference",
  "tableCell",
]);

function isMarkdownTextNode(node: MarkdownNode): node is MarkdownTextNode {
  return node.type === "text" && "value" in node;
}

function isMarkdownParentNode(node: MarkdownNode): node is MarkdownParentNode {
  return "children" in node && Array.isArray(node.children);
}

export function removeEmptyMarkdownTextNodes(nodes: MarkdownPhrasingNode[]) {
  return nodes.filter((node) => !isMarkdownTextNode(node) || node.value.length > 0);
}

function isSerializableStrongNode(node: MarkdownPhrasingNode): node is MarkdownStrongNode {
  return node.type === "strong" && isMarkdownParentNode(node);
}

function isSerializableStrongSequence(nodes: MarkdownPhrasingNode[]): boolean {
  return nodes.every((node) => {
    if (isMarkdownTextNode(node)) {
      return true;
    }

    if (isSerializableStrongNode(node)) {
      return isSerializableStrongSequence(node.children);
    }

    return false;
  });
}

function serializeStrongSequence(nodes: MarkdownPhrasingNode[]): string {
  return nodes
    .map((node) => {
      if (isMarkdownTextNode(node)) {
        return node.value;
      }

      if (isSerializableStrongNode(node)) {
        return `**${serializeStrongSequence(node.children)}**`;
      }

      return "";
    })
    .join("");
}

function parseSerializedStrongSequence(value: string): MarkdownPhrasingNode[] | null {
  const strongPattern = /\*\*([^*\n]+?)\*\*/g;
  const matches = [...value.matchAll(strongPattern)];

  if (matches.length === 0) {
    return null;
  }

  const nodes: MarkdownPhrasingNode[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    if (typeof match.index !== "number") {
      continue;
    }

    if (match.index > lastIndex) {
      nodes.push({
        type: "text",
        value: value.slice(lastIndex, match.index),
      });
    }

    nodes.push({
      type: "strong",
      children: [{ type: "text", value: match[1] }],
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push({
      type: "text",
      value: value.slice(lastIndex),
    });
  }

  return removeEmptyMarkdownTextNodes(nodes);
}

function flattenMarkdownNodesToText(nodes: MarkdownPhrasingNode[]): string {
  return nodes
    .map((node) => {
      if (isMarkdownTextNode(node)) {
        return node.value;
      }

      if (isMarkdownParentNode(node)) {
        return flattenMarkdownNodesToText(node.children);
      }

      if ("value" in node && typeof node.value === "string") {
        return node.value;
      }

      return "";
    })
    .join("");
}

function repairQuotedStrongText(value: string): MarkdownPhrasingNode[] | null {
  const matches = [...value.matchAll(quotedStrongPattern)];

  if (matches.length === 0) {
    return null;
  }

  const nodes: MarkdownPhrasingNode[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    if (typeof match.index !== "number") {
      continue;
    }

    if (match.index > lastIndex) {
      nodes.push({
        type: "text",
        value: value.slice(lastIndex, match.index),
      });
    }

    nodes.push({
      type: "strong",
      children: [
        {
          type: "text",
          value: match[1],
        },
      ],
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push({
      type: "text",
      value: value.slice(lastIndex),
    });
  }

  return removeEmptyMarkdownTextNodes(nodes);
}

function repairQuotedStrongNodes(node: MarkdownParentNode) {
  const shouldRewriteTextChildren = phrasingContainerTypes.has(node.type);
  const nextChildren: MarkdownNode[] = [];

  for (const child of node.children) {
    if (shouldRewriteTextChildren && isMarkdownTextNode(child)) {
      const repaired = repairQuotedStrongText(child.value);

      if (repaired) {
        nextChildren.push(...repaired);
        continue;
      }
    }

    if (isMarkdownParentNode(child) && child.type !== "code") {
      repairQuotedStrongNodes(child);
    }

    nextChildren.push(child);
  }

  if (!shouldRewriteTextChildren) {
    node.children = nextChildren;
    return;
  }

  const repairedChildren: MarkdownPhrasingNode[] = [];

  for (let index = 0; index < nextChildren.length; index += 1) {
    const current = nextChildren[index];
    const middle = nextChildren[index + 1];
    const next = nextChildren[index + 2];

    if (
      isMarkdownTextNode(current) &&
      middle?.type === "strong" &&
      isMarkdownParentNode(middle) &&
      isMarkdownTextNode(next)
    ) {
      const leftMatch = current.value.match(quotedStrongStartPattern);
      const rightMatch = next.value.match(quotedStrongEndPattern);

      if (leftMatch && rightMatch) {
        const [, leftPrefix, leftQuoted] = leftMatch;
        const [, rightQuoted, rightSuffix] = rightMatch;
        const middleText = flattenMarkdownNodesToText(middle.children);

        if (leftPrefix) {
          repairedChildren.push({ type: "text", value: leftPrefix });
        }

        repairedChildren.push({
          type: "strong",
          children: [{ type: "text", value: leftQuoted }],
        });

        if (middleText) {
          repairedChildren.push({ type: "text", value: middleText });
        }

        repairedChildren.push({
          type: "strong",
          children: [{ type: "text", value: rightQuoted }],
        });

        if (rightSuffix) {
          repairedChildren.push({ type: "text", value: rightSuffix });
        }

        index += 2;
        continue;
      }
    }

    repairedChildren.push(current as MarkdownPhrasingNode);
  }

  const compactChildren = removeEmptyMarkdownTextNodes(repairedChildren);

  if (!isSerializableStrongSequence(compactChildren)) {
    node.children = compactChildren;
    return;
  }

  const serialized = serializeStrongSequence(compactChildren);
  const normalized = parseSerializedStrongSequence(serialized);

  node.children = normalized ?? compactChildren;
}

function remarkQuotedStrong() {
  return (tree: MarkdownParentNode) => {
    repairQuotedStrongNodes(tree);
  };
}

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
    "font-reading text-foreground",
    headingLevelClasses[level],
  ].join(" ");

  if (!slug) {
    return <HeadingTag className={headingClassName}>{children}</HeadingTag>;
  }

  return (
    <HeadingTag id={slug} className={headingClassName}>
      <a
        href={`#${slug}`}
        className="inline-flex items-center gap-2 no-underline transition-colors hover:text-accent hover:no-underline"
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
      <pre className="m-0 overflow-x-auto rounded-none border-0 bg-transparent p-4 font-mono">
        <code
          className={[
            "font-mono",
            language ? `language-${language}` : "",
          ].filter(Boolean).join(" ")}
        >
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
        "max-w-none font-reading text-foreground",
        "[&_p]:my-4 [&_p]:text-foreground",
        "[&_strong]:text-foreground",
        "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6",
        "[&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6",
        "[&_li]:my-1 [&_li]:text-foreground",
        "[&_hr]:my-8 [&_hr]:border-t [&_hr]:border-card-border/60",
        "[&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-l-accent [&_blockquote]:bg-card/40 [&_blockquote]:px-4 [&_blockquote]:py-2 [&_blockquote]:text-foreground",
        "[&_table]:min-w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-sm",
        "[&_thead]:border-b [&_thead]:border-card-border/70 [&_thead]:bg-background/40",
        "[&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-[0.02em] [&_th]:text-foreground",
        "[&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_td]:text-foreground/90",
        variantClasses[variant],
        variantInsetClasses[variant],
        className,
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkQuotedStrong]}
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
                <a
                  href={resolvedHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={bodyLinkClassName}
                >
                  {children}
                </a>
              );
            }

            if (resolvedHref.startsWith("#")) {
              return (
                <a href={resolvedHref} className={bodyLinkClassName}>
                  {children}
                </a>
              );
            }

            return (
              <Link href={resolvedHref} className={bodyLinkClassName}>
                {children}
              </Link>
            );
          },
          hr: () => (
            <hr className="my-8 border-t border-card-border/60" />
          ),
          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
          code: ({ children, className }) => (
            <code className={["font-mono", className ?? ""].filter(Boolean).join(" ")}>
              {children}
            </code>
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
