import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ForumPostErrorState,
  ForumPostLoadingState,
} from "./forum/[id]/page";
import { LocaleProvider, useT } from "@/i18n";

function ForumPostPageStateHarness() {
  const t = useT();

  return (
    <>
      <ForumPostLoadingState />
      <ForumPostErrorState
        error="Load failed"
        retryLabel={t("forum.retryLoad")}
        onRetry={() => {}}
        backLabel={t("forum.backToForum")}
      />
    </>
  );
}

test("forum post page states render a skeleton and retry action", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPostPageStateHarness />
    </LocaleProvider>
  );

  assert.match(html, /Load failed/);
  assert.match(html, /重新加载|Retry/);
  assert.match(html, /返回论坛|Back to Forum/);
});
