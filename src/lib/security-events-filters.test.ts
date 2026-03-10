import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSecurityEventsQueryString,
  normalizeSecurityEventsFilters,
  parseSecurityEventsFilters,
} from "./security-events-filters";

test("parseSecurityEventsFilters normalizes supported search params", () => {
  const filters = parseSecurityEventsFilters(
    new URLSearchParams(
      "severity=high&routeKey=agent-revoke&range=7d&page=3"
    )
  );

  assert.deepEqual(filters, {
    severity: "high",
    routeKey: "agent-revoke",
    range: "7d",
    page: 3,
  });
});

test("parseSecurityEventsFilters falls back for unsupported search params", () => {
  const filters = parseSecurityEventsFilters(
    new URLSearchParams(
      "severity=critical&routeKey=unknown&range=90d&page=0"
    )
  );

  assert.deepEqual(filters, {
    severity: "all",
    routeKey: "all",
    range: "all",
    page: 1,
  });
});

test("buildSecurityEventsQueryString omits default filter values", () => {
  const query = buildSecurityEventsQueryString({
    severity: "all",
    routeKey: "all",
    range: "all",
    page: 1,
  });

  assert.equal(query, "");
});

test("buildSecurityEventsQueryString preserves non-default filter values", () => {
  const query = buildSecurityEventsQueryString({
    severity: "warning",
    routeKey: "agent-claim",
    range: "24h",
    page: 2,
  });

  assert.equal(
    query,
    "severity=warning&routeKey=agent-claim&range=24h&page=2"
  );
});

test("buildSecurityEventsQueryString can omit page for export links", () => {
  const query = buildSecurityEventsQueryString(
    {
      severity: "high",
      routeKey: "agent-revoke",
      range: "30d",
      page: 4,
    },
    {
      includePage: false,
    }
  );

  assert.equal(query, "severity=high&routeKey=agent-revoke&range=30d");
});

test("normalizeSecurityEventsFilters resets page when non-page filters change", () => {
  const filters = normalizeSecurityEventsFilters(
    {
      severity: "warning",
      routeKey: "all",
      range: "all",
      page: 4,
    },
    {
      severity: "high",
    }
  );

  assert.deepEqual(filters, {
    severity: "high",
    routeKey: "all",
    range: "all",
    page: 1,
  });
});

test("normalizeSecurityEventsFilters keeps page when only page changes", () => {
  const filters = normalizeSecurityEventsFilters(
    {
      severity: "warning",
      routeKey: "agent-claim",
      range: "7d",
      page: 1,
    },
    {
      page: 3,
    }
  );

  assert.deepEqual(filters, {
    severity: "warning",
    routeKey: "agent-claim",
    range: "7d",
    page: 3,
  });
});
