const REPLACEMENT_CHARACTER = "\uFFFD";
const C1_CONTROL_CHARACTER = /[\u0080-\u009F]/u;
const WINDOWS_1252_MOJIBAKE_CHARACTER =
  /[\u0080-\u009F\u00A0-\u00BF\u20AC\u2013\u2014\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u0152\u0153\u0160\u0161\u0178\u017D\u017E]/u;

const MOJIBAKE_PATTERNS = [
  /[\u00C2-\u00F4](?:[\u0080-\u009F\u00A0-\u00BF\u20AC\u2013\u2014\u2018-\u201E\u2020-\u2022\u2026\u2030\u2039\u203A\u0152\u0153\u0160\u0161\u0178\u017D\u017E]{1,2})/gu,
  /Ã[\u00A0-\u00FF]/gu,
  /Â(?: |[\u00A0-\u00FF])/gu,
  /â€™|â€œ|â€\u009d|â€¢|â€”|â€¦/gu,
  /[äåæ][\u00A0-\u00BF][\u0080-\u00BF]?/gu,
  /ðŸ[\u0080-\u00BF]{2}/gu,
] as const;

export const GARBLED_TEXT_ERROR =
  "Content appears garbled. If you're sending non-ASCII text from Windows bash, use a UTF-8-safe client or JSON Unicode escapes such as \\u4e2d\\u6587.";

function looksLikeQuestionMarkPlaceholder(value: string) {
  const compactValue = value.replace(/\s+/gu, "");
  const questionMarkMatches = [...compactValue.matchAll(/[?？]+/gu)];
  const questionMarkCount = questionMarkMatches.reduce(
    (count, match) => count + match[0].length,
    0
  );

  if (questionMarkCount < 4) {
    return false;
  }

  const longestQuestionMarkRun = questionMarkMatches.reduce(
    (maxRunLength, match) => Math.max(maxRunLength, match[0].length),
    0
  );

  if (longestQuestionMarkRun >= 8) {
    return true;
  }

  const visibleCharacterCount = [...compactValue].length;
  const alphanumericOrCjkCount = [
    ...compactValue.matchAll(/[A-Za-z0-9\u4E00-\u9FFF]/gu),
  ].length;

  return (
    questionMarkCount >= 6 &&
    visibleCharacterCount > 0 &&
    alphanumericOrCjkCount > 0 &&
    questionMarkCount / visibleCharacterCount >= 0.2
  );
}

export function looksLikeGarbledText(value: string) {
  if (value.includes(REPLACEMENT_CHARACTER)) {
    return true;
  }

  if (looksLikeQuestionMarkPlaceholder(value)) {
    return true;
  }

  if (C1_CONTROL_CHARACTER.test(value)) {
    return true;
  }

  let markerCount = 0;

  for (const pattern of MOJIBAKE_PATTERNS) {
    markerCount += [...value.matchAll(pattern)].length;

    if (markerCount >= 2) {
      return true;
    }
  }

  if (WINDOWS_1252_MOJIBAKE_CHARACTER.test(value)) {
    const latin1ClusterCount = [...value.matchAll(/[\u00C2-\u00F4][^\u0000-\u007F]{1,2}/gu)].length;
    if (latin1ClusterCount >= 2) {
      return true;
    }
  }

  return false;
}
