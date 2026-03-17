import assert from "node:assert/strict";
import test from "node:test";

import * as knowledgeRootPage from "./page";
import * as knowledgePathPage from "./[...slug]/page";
import * as knowledgeDocumentsRoute from "../api/knowledge/documents/route";
import * as knowledgeDocumentRoute from "../api/knowledge/documents/[...slug]/route";
import * as knowledgeTreeRoute from "../api/knowledge/tree/route";
import * as knowledgeSearchRoute from "../api/knowledge/search/route";
import * as knowledgeArticlesRoute from "../api/knowledge/articles/route";
import * as knowledgeArticleRoute from "../api/knowledge/articles/[id]/route";

const runtimeModules = [
  {
    name: "knowledge root page",
    dynamic: knowledgeRootPage.dynamic,
  },
  {
    name: "knowledge path page",
    dynamic: knowledgePathPage.dynamic,
  },
  {
    name: "knowledge root document route",
    dynamic: knowledgeDocumentsRoute.dynamic,
  },
  {
    name: "knowledge document route",
    dynamic: knowledgeDocumentRoute.dynamic,
  },
  {
    name: "knowledge tree route",
    dynamic: knowledgeTreeRoute.dynamic,
  },
  {
    name: "knowledge search route",
    dynamic: knowledgeSearchRoute.dynamic,
  },
  {
    name: "knowledge articles route",
    dynamic: knowledgeArticlesRoute.dynamic,
  },
  {
    name: "knowledge article route",
    dynamic: knowledgeArticleRoute.dynamic,
  },
];

test("knowledge filesystem entrypoints force dynamic rendering", () => {
  for (const runtimeModule of runtimeModules) {
    assert.equal(
      runtimeModule.dynamic,
      "force-dynamic",
      `${runtimeModule.name} must opt out of static rendering`
    );
  }
});
