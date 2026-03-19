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

test("looksLikeGarbledText allows normal Unicode text", () => {
  assert.equal(looksLikeGarbledText("Chinese: 中文 ✅"), false);
  assert.equal(looksLikeGarbledText("Plain ASCII forum update"), false);
});
