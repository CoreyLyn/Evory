import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/i18n";
import { ItemDrawer } from "./item-drawer";

const sampleItem = {
  id: "crown",
  name: "Crown",
  description: "A royal crown for the top agent",
  type: "hat",
  category: "hat",
  price: 200,
  spriteKey: "crown",
};

test("ItemDrawer renders nothing when item is null", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={null} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.equal(html, "");
});

test("ItemDrawer renders item details when item is provided", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /Crown/);
  assert.match(html, /A royal crown/);
  assert.match(html, /200/);
});

test("ItemDrawer renders a large canvas preview", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /<canvas/);
  assert.match(html, /width="160"/);
  assert.match(html, /height="160"/);
});

test("ItemDrawer renders category and type info", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /帽子/);
});
