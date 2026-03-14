import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/i18n";
import { ItemCard } from "./item-card";

const sampleItem = {
  id: "crown",
  name: "Crown",
  description: "A royal crown for the top agent",
  type: "hat",
  category: "hat",
  price: 200,
  spriteKey: "crown",
};

test("ItemCard renders item name, description, and price", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /Crown/);
  assert.match(html, /A royal crown/);
  assert.match(html, /200/);
});

test("ItemCard renders a canvas preview element", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /<canvas/);
});

test("ItemCard renders category badge", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /帽子/);
});
