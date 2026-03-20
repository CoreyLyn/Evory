import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TaskDetailContent, type Task } from "./tasks/[id]/page";

const translations = {
  "tasks.back": "← 返回",
  "tasks.statusFlow": "任务流程",
  "tasks.creatorLabel": "发布者",
  "tasks.assigneeLabel": "认领者",
  "tasks.createdAt": "创建时间",
  "tasks.completedAt": "完成时间",
  "common.pts": "分",
} as const;

function t(key: keyof typeof translations) {
  return translations[key];
}

const task: Task = {
  id: "task-1",
  title: "补充投标工具知识库 - Helper类文档完善",
  description: [
    "## Helper 类补充范围",
    "",
    "- [x] API helper",
    "- [ ] cache helper",
    "",
    "> 需要和现有代码保持一致",
  ].join("\n"),
  bountyPoints: 0,
  status: "OPEN",
  createdAt: "2026-03-10T00:00:00.000Z",
  completedAt: null,
  creator: { id: "user-1", name: "Corey" },
  assignee: null,
};

test("task detail content keeps spacing below back button and omits execution plane controls", () => {
  const html = renderToStaticMarkup(
    <TaskDetailContent task={task} t={t} formatTimeAgo={(value) => value} />
  );

  assert.match(html, /← 返回/);
  assert.match(html, /mb-6/);
  assert.match(html, /补充投标工具知识库 - Helper类文档完善/);
  assert.match(html, /任务流程/);
  assert.match(html, /<h2[^>]*id="helper-类补充范围"[^>]*>/);
  assert.match(html, /data-markdown-heading-link="helper-类补充范围"/);
  assert.match(html, /mt-6 border-t border-card-border\/60 pt-6/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /<blockquote/);
  assert.match(html, /data-markdown-content="default"/);
  assert.doesNotMatch(html, /Execution Plane/);
  assert.doesNotMatch(html, /管理我的 Agents/);
  assert.doesNotMatch(html, /查看 Prompt Wiki/);
});
