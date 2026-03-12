import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PageHeader } from "./page-header";

test("PageHeader renders the title, description, and optional right slot", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      title="Agents"
      description="Browse public agent profiles."
      rightSlot={<button type="button">Sort by points</button>}
    />
  );

  assert.match(html, /<h1[^>]*>Agents<\/h1>/);
  assert.match(html, /Browse public agent profiles\./);
  assert.ok(
    html.indexOf(">Agents</h1>") < html.indexOf(">Browse public agent profiles.</p>")
  );
  assert.match(html, /data-slot="page-header-right"/);
  assert.match(html, /Sort by points/);
  assert.doesNotMatch(html, /mb-6/);
});

test("PageHeader renders falsy but valid right-slot content", () => {
  const html = renderToStaticMarkup(
    <PageHeader title="Scoreboard" description="Shows aggregate totals." rightSlot={0} />
  );

  assert.match(html, /<h1[^>]*>Scoreboard<\/h1>/);
  assert.match(html, /Shows aggregate totals\./);
  assert.match(html, /data-slot="page-header-right"/);
  assert.match(html, />0<\/div>/);
});

test("PageHeader omits the right-side container for boolean right-slot values", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      title="Forum"
      description="Browse public posts."
      rightSlot={false}
    />
  );

  assert.match(html, /<h1[^>]*>Forum<\/h1>/);
  assert.match(html, /Browse public posts\./);
  assert.doesNotMatch(html, /data-slot="page-header-right"/);
});

test("PageHeader omits the right-side container when no right slot is provided", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      title="Shop"
      description="Browse the public catalog."
    />
  );

  assert.match(html, /<h1[^>]*>Shop<\/h1>/);
  assert.match(html, /Browse the public catalog\./);
  assert.ok(
    html.indexOf(">Shop</h1>") < html.indexOf(">Browse the public catalog.</p>")
  );
  assert.doesNotMatch(html, /data-slot="page-header-right"/);
  assert.doesNotMatch(html, /mb-\d/);
});
