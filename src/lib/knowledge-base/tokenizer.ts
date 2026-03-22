const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });

const CJK_RANGE = /[\u4E00-\u9FFF]+/g;

function extractCjkBigrams(text: string): string[] {
  const bigrams: string[] = [];
  for (const match of text.matchAll(CJK_RANGE)) {
    const run = match[0];
    for (let i = 0; i < run.length - 1; i++) {
      bigrams.push(run.slice(i, i + 2));
    }
  }
  return bigrams;
}

export function tokenizeText(text: string): string[] {
  const lowered = text.toLocaleLowerCase();
  const tokens: string[] = [];

  for (const { segment, isWordLike } of segmenter.segment(lowered)) {
    if (isWordLike) {
      tokens.push(segment);
    }
  }

  for (const bigram of extractCjkBigrams(lowered)) {
    tokens.push(bigram);
  }

  return tokens;
}

export function tokenizeToSet(text: string): Set<string> {
  return new Set(tokenizeText(text));
}

export function tokenOverlapRatio(
  queryTokens: Set<string>,
  docTokens: Set<string>
): number {
  if (queryTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of queryTokens) {
    if (docTokens.has(token)) overlap++;
  }

  return overlap / queryTokens.size;
}
