import assert from "node:assert/strict";
import test from "node:test";

import { tokenizeText, tokenizeToSet, tokenOverlapRatio } from "./tokenizer";

test("tokenizeText returns empty array for empty string", () => {
  assert.deepEqual(tokenizeText(""), []);
});

test("tokenizeText returns empty array for whitespace-only input", () => {
  assert.deepEqual(tokenizeText("   "), []);
});

test("tokenizeText handles pure English text", () => {
  const tokens = tokenizeToSet("Getting started with deploy");
  assert.ok(tokens.has("getting"));
  assert.ok(tokens.has("started"));
  assert.ok(tokens.has("with"));
  assert.ok(tokens.has("deploy"));
});

test("tokenizeText handles pure Chinese text and generates bigrams", () => {
  const tokens = tokenizeToSet("发帖教程");
  // Should contain individual segmented words and CJK bigrams
  assert.ok(tokens.has("发帖"), "should contain bigram 发帖");
  assert.ok(tokens.has("帖教"), "should contain bigram 帖教");
  assert.ok(tokens.has("教程"), "should contain bigram 教程");
});

test("tokenizeText handles mixed Chinese and English", () => {
  const tokens = tokenizeToSet("Agent 配置指南");
  assert.ok(tokens.has("agent"));
  assert.ok(tokens.has("配置"), "should contain bigram 配置");
  assert.ok(tokens.has("指南"), "should contain bigram 指南");
});

test("Chinese query tokens overlap with related Chinese document tokens", () => {
  const queryTokens = tokenizeToSet("发帖");
  const docTokens = tokenizeToSet("发帖教程指南");
  const ratio = tokenOverlapRatio(queryTokens, docTokens);
  assert.ok(ratio > 0, `expected positive overlap, got ${ratio}`);
});

test("tokenOverlapRatio returns 0 for empty query", () => {
  const queryTokens = tokenizeToSet("");
  const docTokens = tokenizeToSet("some document text");
  assert.equal(tokenOverlapRatio(queryTokens, docTokens), 0);
});

test("tokenOverlapRatio returns 1 when all query tokens are in doc", () => {
  const queryTokens = tokenizeToSet("hello world");
  const docTokens = tokenizeToSet("hello world is great");
  assert.equal(tokenOverlapRatio(queryTokens, docTokens), 1);
});

test("tokenOverlapRatio returns partial ratio for partial overlap", () => {
  const queryTokens = tokenizeToSet("hello world");
  const docTokens = tokenizeToSet("hello there");
  const ratio = tokenOverlapRatio(queryTokens, docTokens);
  assert.ok(ratio > 0 && ratio < 1, `expected partial overlap, got ${ratio}`);
});

test("tokenizeText handles single CJK character without bigrams", () => {
  const tokens = tokenizeText("好");
  // Single char run produces no bigrams, but the segmenter should return the character
  const tokenSet = new Set(tokens);
  assert.ok(tokenSet.has("好"));
});

test("tokenizeText handles punctuation-only input", () => {
  const tokens = tokenizeToSet("...!!??");
  assert.equal(tokens.size, 0);
});
