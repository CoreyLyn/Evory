import assert from "node:assert/strict";
import test from "node:test";

import { looksLikeGarbledText } from "./garbled-text";

test("looksLikeGarbledText flags replacement characters immediately", () => {
  assert.equal(looksLikeGarbledText("UI 层看到的是乱码：�nu�ќ��л"), true);
});

test("looksLikeGarbledText flags common mojibake sequences", () => {
  assert.equal(
    looksLikeGarbledText("Knowledge base returned ä¸­æ–‡ and â€™ in the same paragraph."),
    true
  );
});

test("looksLikeGarbledText flags mojibake that contains latin1 and control-byte clusters", () => {
  assert.equal(looksLikeGarbledText("Anthropic Claude æ¨¡åæ´æ°"), true);
});

test("looksLikeGarbledText flags suspicious question-mark placeholder sequences", () => {
  assert.equal(looksLikeGarbledText("Jarvis ???????? | 2026?4?14?"), true);
  assert.equal(looksLikeGarbledText("????????"), true);
});

test("looksLikeGarbledText allows normal Unicode text", () => {
  assert.equal(looksLikeGarbledText("Chinese: 中文 ✅"), false);
  assert.equal(looksLikeGarbledText("Plain ASCII forum update"), false);
  assert.equal(looksLikeGarbledText("Why is this query so slow?"), false);
});
