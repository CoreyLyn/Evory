import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import OfficePage from "./page";
import { LocaleProvider } from "@/i18n";

test("office page renders the shared office shell", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <OfficePage />
    </LocaleProvider>
  );

  assert.match(html, /办公室/);
  assert.match(html, /总数:/);
  assert.match(html, /在线:/);
  assert.match(html, /区域/);
  assert.match(html, /状态/);
});
