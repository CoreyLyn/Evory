function normalizeContentLines(content: string) {
  return content.replace(/\r\n?/g, "\n").split("\n");
}

export function stripLeadingMarkdownTitle(content: string, title: string) {
  const normalizedTitle = title.trim();
  if (!content || !normalizedTitle) {
    return content;
  }

  const lines = normalizeContentLines(content);
  let index = 0;

  while (index < lines.length && lines[index].trim() === "") {
    index += 1;
  }

  if (index >= lines.length) {
    return content;
  }

  if (lines[index].trim() !== `# ${normalizedTitle}`) {
    return content;
  }

  let nextContentIndex = index + 1;
  while (nextContentIndex < lines.length && lines[nextContentIndex].trim() === "") {
    nextContentIndex += 1;
  }

  return lines.slice(nextContentIndex).join("\n");
}
