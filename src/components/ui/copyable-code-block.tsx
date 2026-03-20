"use client";

import type { CSSProperties, ReactNode } from "react";

import { CopyButton } from "@/components/ui/copy-button";

export const PROMPT_CODE_BLOCK_CHROME = {
  copyButtonClassName:
    "bg-card/80 shadow-sm backdrop-blur-md border border-card-border/50 text-foreground",
  style: {
    background: "var(--prompt-code-surface)",
    borderColor: "var(--prompt-code-border)",
    boxShadow: "var(--prompt-code-shadow)",
  } satisfies CSSProperties,
  preStyle: {
    color: "var(--prompt-code-foreground)",
  } satisfies CSSProperties,
} as const;

interface CopyableCodeBlockProps {
  value: string;
  children?: ReactNode;
  className?: string;
  preClassName?: string;
  copyButtonClassName?: string;
  style?: CSSProperties;
  preStyle?: CSSProperties;
}

export function CopyableCodeBlock({
  value,
  children,
  className = "",
  preClassName = "",
  copyButtonClassName = "",
  style,
  preStyle,
}: CopyableCodeBlockProps) {
  return (
    <div
      className={`group/code relative overflow-hidden rounded-2xl border border-card-border/50 bg-background/30 ${className}`}
      style={style}
    >
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-200 group-hover/code:opacity-100">
        <CopyButton
          value={value}
          className={copyButtonClassName}
        />
      </div>
      <pre
        className={`overflow-x-auto p-4 pr-12 text-sm whitespace-pre-wrap text-foreground ${preClassName}`}
        style={preStyle}
      >
        {children ?? value}
      </pre>
    </div>
  );
}
