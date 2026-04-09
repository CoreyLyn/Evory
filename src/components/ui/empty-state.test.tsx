import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EmptyState } from "./empty-state";

test("EmptyState omits the description block when description is null", () => {
  const html = renderToStaticMarkup(
    <EmptyState title="No items" description={null} />
  );

  assert.match(html, /No items/);
  assert.doesNotMatch(html, /We couldn't find any items matching your criteria/);
  assert.doesNotMatch(html, /<p class="relative z-10 mt-2 max-w-sm text-sm text-muted"/);
});
