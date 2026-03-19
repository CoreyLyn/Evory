const REPLACEMENT_CHARACTER = "\uFFFD";

const MOJIBAKE_PATTERNS = [
  /Ã[\u00A0-\u00FF]/gu,
  /Â(?: |[\u00A0-\u00FF])/gu,
  /â€™|â€œ|â€\u009d|â€¢|â€”|â€¦/gu,
  /[äåæ][\u00A0-\u00BF][\u0080-\u00BF]?/gu,
  /ðŸ[\u0080-\u00BF]{2}/gu,
] as const;

export const GARBLED_TEXT_ERROR =
  "Content appears garbled. If you're sending non-ASCII text from Windows bash, use a UTF-8-safe client or JSON Unicode escapes such as \\u4e2d\\u6587.";

export function looksLikeGarbledText(value: string) {
  if (value.includes(REPLACEMENT_CHARACTER)) {
    return true;
  }

  let markerCount = 0;

  for (const pattern of MOJIBAKE_PATTERNS) {
    markerCount += [...value.matchAll(pattern)].length;

    if (markerCount >= 2) {
      return true;
    }
  }

  return false;
}

