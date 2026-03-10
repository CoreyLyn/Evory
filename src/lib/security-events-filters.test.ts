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
      "type=CSRF_REJECTED&severity=high&routeKey=auth-logout&range=7d&page=3"
    )
  );

  assert.deepEqual(filters, {
    type: "CSRF_REJECTED",
    severity: "high",
    routeKey: "auth-logout",
    range: "7d",
    page: 3,
  });
});

test("parseSecurityEventsFilters falls back for unsupported search params", () => {
  const filters = parseSecurityEventsFilters(
    new URLSearchParams(
      "type=UNKNOWN&severity=critical&routeKey=unknown&range=90d&page=0"
    )
  );

  assert.deepEqual(filters, {
    type: "all",
    severity: "all",
    routeKey: "all",
    range: "all",
    page: 1,
  });
});

test("buildSecurityEventsQueryString omits default filter values", () => {
  const query = buildSecurityEventsQueryString({
    type: "all",
    severity: "all",
    routeKey: "all",
    range: "all",
    page: 1,
  });

  assert.equal(query, "");
});

test("buildSecurityEventsQueryString preserves non-default filter values", () => {
  const query = buildSecurityEventsQueryString({
    type: "AUTH_FAILURE",
    severity: "warning",
    routeKey: "auth-login",
    range: "24h",
    page: 2,
  });

  assert.equal(
    query,
    "type=AUTH_FAILURE&severity=warning&routeKey=auth-login&range=24h&page=2"
  );
});

test("buildSecurityEventsQueryString can omit page for export links", () => {
  const query = buildSecurityEventsQueryString(
    {
      type: "AGENT_ABUSE_LIMIT_HIT",
      severity: "high",
      routeKey: "task-claim-write",
      range: "30d",
      page: 4,
    },
    {
      includePage: false,
    }
  );

  assert.equal(
    query,
    "type=AGENT_ABUSE_LIMIT_HIT&severity=high&routeKey=task-claim-write&range=30d"
  );
});

test("normalizeSecurityEventsFilters resets page when non-page filters change", () => {
  const filters = normalizeSecurityEventsFilters(
    {
      type: "RATE_LIMIT_HIT",
      severity: "warning",
      routeKey: "all",
      range: "all",
      page: 4,
    },
    {
      type: "CSRF_REJECTED",
      severity: "high",
    }
  );

  assert.deepEqual(filters, {
    type: "CSRF_REJECTED",
    severity: "high",
    routeKey: "all",
    range: "all",
    page: 1,
  });
});

test("normalizeSecurityEventsFilters keeps page when only page changes", () => {
  const filters = normalizeSecurityEventsFilters(
    {
      type: "AUTH_FAILURE",
      severity: "warning",
      routeKey: "auth-login",
      range: "7d",
      page: 1,
    },
    {
      page: 3,
    }
  );

  assert.deepEqual(filters, {
    type: "AUTH_FAILURE",
    severity: "warning",
    routeKey: "auth-login",
    range: "7d",
    page: 3,
  });
});
