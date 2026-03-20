"use client";

import type { ReactNode } from "react";

type TokenKind =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "operator"
  | "property";

type Token = {
  kind: TokenKind | null;
  value: string;
};

const KEYWORD_CLASS = {
  keyword: "text-cyan-300",
  string: "text-emerald-300",
  number: "text-amber-300",
  comment: "text-muted",
  operator: "text-rose-300",
  property: "text-sky-200",
} as const;

function renderTokens(tokens: Token[]) {
  return tokens.map((token, index) => {
    if (!token.kind) {
      return token.value;
    }

    return (
      <span
        key={`${token.kind}-${index}-${token.value}`}
        data-token={token.kind}
        className={KEYWORD_CLASS[token.kind]}
      >
        {token.value}
      </span>
    );
  });
}

function highlightTypeScriptLike(code: string) {
  const pattern = /(\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:const|let|var|function|return|if|else|for|while|await|async|import|from|export|new|class|extends|interface|type)\b|\b\d+(?:\.\d+)?\b|[=+\-*/<>!]+|\b[a-zA-Z_$][\w$]*(?=\s*:))/gm;
  const tokens: Token[] = [];
  let lastIndex = 0;

  for (const match of code.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      tokens.push({ kind: null, value: code.slice(lastIndex, index) });
    }

    let kind: TokenKind = "operator";
    if (value.startsWith("//")) kind = "comment";
    else if (/^["'`]/.test(value)) kind = "string";
    else if (/^\d/.test(value)) kind = "number";
    else if (/^[=+\-*/<>!]+$/.test(value)) kind = "operator";
    else if (/^(const|let|var|function|return|if|else|for|while|await|async|import|from|export|new|class|extends|interface|type)$/.test(value)) kind = "keyword";
    else kind = "property";

    tokens.push({ kind, value });
    lastIndex = index + value.length;
  }

  if (lastIndex < code.length) {
    tokens.push({ kind: null, value: code.slice(lastIndex) });
  }

  return renderTokens(tokens);
}

function highlightJson(code: string) {
  const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?|\b\d+(?:\.\d+)?\b|\b(?:true|false|null)\b/gm;
  const tokens: Token[] = [];
  let lastIndex = 0;

  for (const match of code.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      tokens.push({ kind: null, value: code.slice(lastIndex, index) });
    }

    const kind: TokenKind =
      match[2] ? "property" : /^"/.test(value) ? "string" : /^\d/.test(value) ? "number" : "keyword";

    tokens.push({ kind, value });
    lastIndex = index + value.length;
  }

  if (lastIndex < code.length) {
    tokens.push({ kind: null, value: code.slice(lastIndex) });
  }

  return renderTokens(tokens);
}

function highlightShell(code: string) {
  const pattern = /(#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:npm|pnpm|yarn|npx|node|curl|git|cd|ls|cat|export)\b|\$\w+|--?[a-zA-Z-]+|\b\d+(?:\.\d+)?\b)/gm;
  const tokens: Token[] = [];
  let lastIndex = 0;

  for (const match of code.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      tokens.push({ kind: null, value: code.slice(lastIndex, index) });
    }

    let kind: TokenKind = "keyword";
    if (value.startsWith("#")) kind = "comment";
    else if (/^["']/.test(value)) kind = "string";
    else if (/^\d/.test(value)) kind = "number";
    else if (/^--?/.test(value)) kind = "operator";
    else kind = "keyword";

    tokens.push({ kind, value });
    lastIndex = index + value.length;
  }

  if (lastIndex < code.length) {
    tokens.push({ kind: null, value: code.slice(lastIndex) });
  }

  return renderTokens(tokens);
}

function highlightHttp(code: string) {
  const pattern = /\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|HTTP\/1\.1|HTTP\/2)\b|https?:\/\/\S+|\/[A-Za-z0-9_./:-]*|\b\d{3}\b/gm;
  const tokens: Token[] = [];
  let lastIndex = 0;

  for (const match of code.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      tokens.push({ kind: null, value: code.slice(lastIndex, index) });
    }

    const kind: TokenKind =
      /^https?:\/\//.test(value) || value.startsWith("/") ? "string"
        : /^\d/.test(value) ? "number"
        : "keyword";

    tokens.push({ kind, value });
    lastIndex = index + value.length;
  }

  if (lastIndex < code.length) {
    tokens.push({ kind: null, value: code.slice(lastIndex) });
  }

  return renderTokens(tokens);
}

export function highlightCode(code: string, language: string | null): ReactNode {
  const normalized = language?.toLocaleLowerCase() ?? "";

  if (["ts", "tsx", "js", "jsx", "typescript", "javascript"].includes(normalized)) {
    return highlightTypeScriptLike(code);
  }

  if (normalized === "json") {
    return highlightJson(code);
  }

  if (["bash", "sh", "shell", "zsh"].includes(normalized)) {
    return highlightShell(code);
  }

  if (["http", "https"].includes(normalized)) {
    return highlightHttp(code);
  }

  return code;
}
