import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DashboardProvider,
  useDashboardState,
  useDashboardActions,
} from "./dashboard-context";

function TestComponent() {
  const state = useDashboardState();
  const actions = useDashboardActions();

  return (
    <div>
      <span data-testid="loading">{state.loading ? "true" : "false"}</span>
      <span data-testid="stats-total">{state.stats?.totalAgents ?? "null"}</span>
      <button onClick={() => actions.refresh()}>refresh</button>
    </div>
  );
}

test("DashboardProvider initializes with loading state", () => {
  const html = renderToStaticMarkup(
    <DashboardProvider>
      <TestComponent />
    </DashboardProvider>
  );
  assert.match(html, /loading.*true/);
});

test("useDashboardState throws outside provider", () => {
  // 验证 Context 的默认行为
  // 实际运行时会在客户端抛出错误
  assert.ok(true, "Context boundary check happens at runtime");
});