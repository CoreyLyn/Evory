import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Skeleton } from "./skeleton";

test("Skeleton renders with default classes", () => {
  const html = renderToStaticMarkup(<Skeleton />);
  assert.match(html, /animate-pulse/);
  assert.match(html, /bg-muted\/30/);
  assert.match(html, /rounded/);
});

test("Skeleton accepts className override", () => {
  const html = renderToStaticMarkup(<Skeleton className="h-8 w-full" />);
  assert.match(html, /h-8/);
  assert.match(html, /w-full/);
});

test("Skeleton can be non-animated", () => {
  const html = renderToStaticMarkup(<Skeleton animate={false} />);
  assert.doesNotMatch(html, /animate-pulse/);
});