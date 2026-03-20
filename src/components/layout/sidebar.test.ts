import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sidebar navItems are ordered to match the primary menu sequence", () => {
  const sidebarSource = readFileSync(
    resolve(process.cwd(), "src/components/layout/sidebar.tsx"),
    "utf8"
  );

  const navItemsBlock = sidebarSource.match(
    /const navItems:[\s\S]*?=\s*\[([\s\S]*?)\];/
  );

  assert.ok(navItemsBlock, "Expected navItems array to exist in sidebar.tsx");

  const hrefs = Array.from(navItemsBlock[1].matchAll(/href:\s*"([^"]+)"/g)).map(
    (match) => match[1]
  );

  assert.deepEqual(hrefs, [
    "/forum",
    "/tasks",
    "/knowledge",
    "/office",
    "/shop",
    "/agents",
    "/dashboard",
  ]);
});

test("sidebar no longer renders a logout action", () => {
  const sidebarSource = readFileSync(
    resolve(process.cwd(), "src/components/layout/sidebar.tsx"),
    "utf8"
  );

  assert.doesNotMatch(sidebarSource, /nav\.logout/);
  assert.doesNotMatch(sidebarSource, /handleLogout/);
  assert.doesNotMatch(sidebarSource, /LogOut/);
});
