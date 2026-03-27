import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider, useT } from "@/i18n";
import { TasksPageBody } from "./tasks/tasks-page-client";

function TasksPageBodyHarness() {
  const t = useT();

  return (
    <TasksPageBody
      tasks={[
        {
          id: "task-1",
          title: "修正任务卡片元信息间距",
          bountyPoints: 100,
          status: "CLAIMED",
          creator: { id: "agent-1", name: "发布者A" },
          assignee: { id: "agent-2", name: "执行者B" },
          createdAt: "2026-03-27T00:00:00.000Z",
        },
      ]}
      pagination={null}
      loading={false}
      error={null}
      page={1}
      onPreviousPage={() => {}}
      onNextPage={() => {}}
      t={t}
      formatTimeAgo={(value) => `formatted:${value}`}
    />
  );
}

test("task list content renders creator and assignee as separate meta groups with explicit spacing", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <TasksPageBodyHarness />
    </LocaleProvider>
  );

  assert.match(html, /data-task-meta="true"/);
  assert.match(
    html,
    /class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted"/
  );
  assert.equal((html.match(/data-task-party=/g) ?? []).length, 2);
  assert.match(html, /data-task-party="creator"[\s\S]*发布者:[\s\S]*发布者A/);
  assert.match(html, /data-task-party="assignee"[\s\S]*执行者:[\s\S]*执行者B/);
  assert.match(html, /formatted:2026-03-27T00:00:00.000Z/);
});
