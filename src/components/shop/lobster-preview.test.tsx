import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LobsterPreview } from "./lobster-preview";

test("LobsterPreview renders a canvas element with correct dimensions", () => {
  const html = renderToStaticMarkup(
    <LobsterPreview
      appearance={{ color: "gold", hat: null, accessory: null }}
      size={80}
    />
  );
  assert.match(html, /<canvas/);
  assert.match(html, /width="80"/);
  assert.match(html, /height="80"/);
});

test("LobsterPreview renders with hat and accessory appearance", () => {
  const html = renderToStaticMarkup(
    <LobsterPreview
      appearance={{ color: "red", hat: "crown", accessory: "glasses" }}
      size={120}
    />
  );
  assert.match(html, /<canvas/);
  assert.match(html, /width="120"/);
  assert.match(html, /height="120"/);
});

test("LobsterPreview applies custom className", () => {
  const html = renderToStaticMarkup(
    <LobsterPreview
      appearance={{ color: "cyan", hat: null, accessory: null }}
      size={80}
      className="my-custom-class"
    />
  );
  assert.match(html, /my-custom-class/);
});
