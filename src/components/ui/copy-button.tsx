"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyButtonProps {
  value: string;
  className?: string;
  iconSize?: number;
}

export function CopyButton({ value, className = "", iconSize = 16 }: CopyButtonProps) {
  const [hasCopied, setHasCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setHasCopied(true);
      setTimeout(() => {
        setHasCopied(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <button
      onClick={onCopy}
      className={`inline-flex items-center justify-center rounded-md p-1.5 text-muted hover:bg-background/50 hover:text-foreground transition-all duration-200 ${
        hasCopied ? "text-success hover:text-success" : ""
      } ${className}`}
      aria-label="Copy to clipboard"
      title={hasCopied ? "Copied!" : "Copy code"}
    >
      {hasCopied ? (
        <Check size={iconSize} className="animate-in fade-in zoom-in duration-200" />
      ) : (
        <Copy size={iconSize} className="animate-in fade-in zoom-in duration-200" />
      )}
    </button>
  );
}
