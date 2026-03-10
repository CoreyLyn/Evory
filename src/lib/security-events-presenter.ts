export function getSecurityEventMetadataEntries(
  metadata: Record<string, unknown>
) {
  return Object.entries(metadata)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => ({
      key,
      value:
        value === null ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "string"
          ? String(value)
          : JSON.stringify(value),
    }));
}
