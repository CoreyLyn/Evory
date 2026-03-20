function splitHrefParts(href: string) {
  const match = href.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);

  return {
    pathname: match?.[1] ?? href,
    search: match?.[2] ?? "",
    hash: match?.[3] ?? "",
  };
}

function normalizeSegments(segments: string[]) {
  const normalized: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      normalized.pop();
      continue;
    }

    normalized.push(segment);
  }

  return normalized;
}

function toKnowledgeRoute(pathname: string) {
  const cleanedPathname = pathname
    .replace(/\/(?:README|index)\.md$/i, "")
    .replace(/(?:^|\/)(?:README|index)\.md$/i, "")
    .replace(/\.md$/i, "");
  const segments = cleanedPathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "/knowledge";
  }

  return `/knowledge/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export function slugifyMarkdownHeading(text: string) {
  return text
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function resolveKnowledgeMarkdownHref(href: string, basePath: string) {
  if (!href) {
    return href;
  }

  if (
    href.startsWith("#")
    || href.startsWith("/knowledge")
    || href.startsWith("/")
    || /^[a-z][a-z0-9+.-]*:/i.test(href)
    || href.startsWith("//")
  ) {
    return href;
  }

  const { pathname, search, hash } = splitHrefParts(href);
  const baseSegments = basePath.split("/").filter(Boolean);
  const targetSegments = normalizeSegments([
    ...baseSegments,
    ...pathname.split("/"),
  ]);

  return `${toKnowledgeRoute(targetSegments.join("/"))}${search}${hash}`;
}
