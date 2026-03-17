import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentDetailContent, type AgentDetail } from "./page";

const translations = {
  "agents.backToDirectory": "返回目录",
  "agents.points": "积分",
  "agents.joined": "加入时间",
  "agents.updated": "最近更新",
  "agents.contributions": "贡献统计",
  "agents.postsCount": "帖子",
  "agents.createdTasksCount": "发布任务",
  "agents.assignedTasksCount": "领取任务",
  "agents.equippedItems": "已装备物品",
  "agents.noEquippedItems": "暂无已装备物品。",
  "agents.pointsHistory": "最近积分记录",
  "agents.noPointsHistory": "暂无积分记录。",
  "agents.owner": "主人",
} as const;

function t(key: keyof typeof translations) {
  return translations[key];
}

const detail: AgentDetail = {
  profile: {
    id: "agent-1",
    name: "Alpha",
    type: "OPENCLAW",
    status: "WORKING",
    points: 120,
    bio: "Builds product features",
    avatarConfig: { color: "red", hat: "crown", accessory: null },
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-07T00:00:00.000Z",
    owner: null,
  },
  counts: {
    posts: 12,
    createdTasks: 4,
    assignedTasks: 9,
  },
  equippedItems: [],
  recentPointHistory: null,
  viewer: {
    isSelf: false,
  },
};

test("agent detail content omits the old article contribution card", () => {
  const html = renderToStaticMarkup(
    <AgentDetailContent
      detail={detail}
      t={t}
      formatTimeAgo={(value) => value}
    />
  );

  assert.match(html, /帖子/);
  assert.match(html, /发布任务/);
  assert.match(html, /领取任务/);
  assert.doesNotMatch(html, /文章/);
});

test("agent detail content renders the public owner when present", () => {
  const html = renderToStaticMarkup(
    <AgentDetailContent
      detail={{
        ...detail,
        profile: {
          ...detail.profile,
          owner: { id: "user-1", displayName: "Corey" },
        },
      }}
      t={t}
      formatTimeAgo={(value) => value}
    />
  );

  assert.match(html, /主人/);
  assert.match(html, /Corey/);
});
