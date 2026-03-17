import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFICE_DETAIL_CARD_SURFACE_CLASS,
  OFFICE_SEARCH_INPUT_CLASS,
  OFFICE_SIDEBAR_SURFACE_CLASS,
  OFFICE_STAT_CARD_CLASS,
  getOfficeDetailCardStyle,
  getOfficeLegendSurfaceStyle,
  getOfficeSearchInputStyle,
  getOfficeSidebarSurfaceStyle,
  getOfficeSidebarToggleStyle,
  getOfficeStatCardStyle,
} from "./overlay-styles";

test("office sidebar surface stays readable in light theme while keeping dark overrides", () => {
  assert.match(OFFICE_SIDEBAR_SURFACE_CLASS, /bg-background\/80/);
  assert.match(OFFICE_SIDEBAR_SURFACE_CLASS, /border-card-border\/50/);
  assert.match(OFFICE_SIDEBAR_SURFACE_CLASS, /backdrop-blur-2xl/);
});

test("office search input uses a solid light surface", () => {
  assert.match(OFFICE_SEARCH_INPUT_CLASS, /bg-foreground\/\[0\.02\]/);
  assert.match(OFFICE_SEARCH_INPUT_CLASS, /border-card-border\/40/);
  assert.match(OFFICE_SEARCH_INPUT_CLASS, /placeholder:text-muted\/50/);
});

test("office detail card uses a brighter light surface and keeps dark theme fallback", () => {
  assert.match(OFFICE_DETAIL_CARD_SURFACE_CLASS, /bg-card\/80/);
  assert.match(OFFICE_DETAIL_CARD_SURFACE_CLASS, /border-card-border\/60/);
  assert.match(OFFICE_DETAIL_CARD_SURFACE_CLASS, /backdrop-blur-2xl/);
});

test("office stat cards use a distinct light surface", () => {
  assert.match(OFFICE_STAT_CARD_CLASS, /bg-card/);
  assert.match(OFFICE_STAT_CARD_CLASS, /border-card-border\/50/);
  assert.doesNotMatch(OFFICE_STAT_CARD_CLASS, /dark:bg-card/);
});

test("office light sidebar styles disable glass blur explicitly", () => {
  assert.deepEqual(getOfficeSidebarToggleStyle("light"), {
    background: "rgba(255, 255, 255, 0.96)",
    borderColor: "rgba(203, 213, 225, 0.88)",
    boxShadow: "0 18px 48px -28px rgba(15, 23, 42, 0.28)",
    backdropFilter: "none",
  });
  assert.deepEqual(getOfficeSidebarSurfaceStyle("light"), {
    background: "rgba(255, 255, 255, 0.985)",
    borderRightColor: "rgba(203, 213, 225, 0.92)",
    boxShadow: "0 24px 64px -32px rgba(15, 23, 42, 0.28)",
    backdropFilter: "none",
  });
});

test("office light detail styles force opaque readable panels", () => {
  assert.deepEqual(getOfficeSearchInputStyle("light"), {
    background: "rgba(255, 255, 255, 0.96)",
    borderColor: "rgba(203, 213, 225, 0.9)",
  });
  assert.deepEqual(getOfficeLegendSurfaceStyle("light"), {
    background: "rgba(255, 255, 255, 0.94)",
    borderColor: "rgba(203, 213, 225, 0.9)",
    boxShadow: "0 18px 48px -28px rgba(15, 23, 42, 0.26)",
    backdropFilter: "none",
  });
  assert.deepEqual(getOfficeDetailCardStyle("light"), {
    background: "rgba(255, 255, 255, 0.985)",
    borderColor: "rgba(203, 213, 225, 0.92)",
    boxShadow: "0 32px 90px -38px rgba(15, 23, 42, 0.34)",
    backdropFilter: "none",
  });
  assert.deepEqual(getOfficeStatCardStyle("light"), {
    background: "rgba(255, 255, 255, 0.94)",
    borderColor: "rgba(226, 232, 240, 0.95)",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.98)",
  });
});

test("office overlay inline styles do not override dark theme", () => {
  assert.equal(getOfficeSidebarToggleStyle("dark"), undefined);
  assert.equal(getOfficeSidebarSurfaceStyle("dark"), undefined);
  assert.equal(getOfficeSearchInputStyle("dark"), undefined);
  assert.equal(getOfficeLegendSurfaceStyle("dark"), undefined);
  assert.equal(getOfficeDetailCardStyle("dark"), undefined);
  assert.equal(getOfficeStatCardStyle("dark"), undefined);
});

test("office overlay inline styles stay disabled until theme resolves to light", () => {
  assert.equal(getOfficeSidebarToggleStyle(undefined), undefined);
  assert.equal(getOfficeSidebarSurfaceStyle(undefined), undefined);
  assert.equal(getOfficeSearchInputStyle(undefined), undefined);
  assert.equal(getOfficeLegendSurfaceStyle(undefined), undefined);
  assert.equal(getOfficeDetailCardStyle(undefined), undefined);
  assert.equal(getOfficeStatCardStyle(undefined), undefined);
});
