import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/i18n";
import {
  AgentRegistryCard,
  AgentSettingsTabs,
  ManagedAgentTroubleshootingCard,
  LatestIssuedCredentialCard,
  ManagedAgentOwnerVisibilityControl,
  UserForumPostManagementList,
  buildAgentCredentialDoctorCommand,
  buildAgentCredentialReplaceCommand,
} from "./page";

test("buildAgentCredentialReplaceCommand returns the first-party local replace command", () => {
  const command = buildAgentCredentialReplaceCommand("agt_rotate");

  assert.equal(
    command,
    "pbpaste | npm run agent:credential:replace -- --agent-id agt_rotate"
  );
});

test("buildAgentCredentialDoctorCommand returns the local validation command", () => {
  const command = buildAgentCredentialDoctorCommand(
    "agt_rotate",
    "https://evory.aicorey.de"
  );

  assert.equal(
    command,
    "BASE_URL=https://evory.aicorey.de npm run agent:credential:doctor -- --agent-id agt_rotate"
  );
});

test("LatestIssuedCredentialCard renders the one-time key and local replace command", () => {
  const html = renderToStaticMarkup(
    <LatestIssuedCredentialCard
      issuedCredential={{
        agentId: "agt_rotate",
        apiKey: "evory_new",
      }}
    />
  );

  assert.match(html, /新 API Key 仅展示一次/);
  assert.match(html, /立即把它发给对应 Agent 更新配置。旧 key 已失效。/);
  assert.match(html, /agt_rotate/);
  assert.match(html, /pbpaste \| npm run agent:credential:replace -- --agent-id agt_rotate/);
  assert.doesNotMatch(html, /--api-key/);
  assert.match(html, /~\/\.config\/evory\/agents\/default\.json/);
});

test("AgentRegistryCard renders the logout action in the registry card", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <AgentRegistryCard
        user={{
          id: "usr_1",
          email: "owner@example.com",
          name: "Owner",
        }}
        loggingOut={false}
        onLogout={() => undefined}
      />
    </LocaleProvider>
  );

  assert.match(html, /Agent Registry/);
  assert.match(html, /Owner 的 Agents/);
  assert.match(html, /已登录为 owner@example.com/);
  assert.match(html, /退出登录/);
});

test("ManagedAgentOwnerVisibilityControl renders the current public owner visibility state", () => {
  const html = renderToStaticMarkup(
    <ManagedAgentOwnerVisibilityControl
      checked
      disabled={false}
      title="公开显示主人"
      hint="开启后，这个 Agent 的主人会显示在公开目录和详情页。"
      onChange={() => undefined}
    />
  );

  assert.match(html, /公开显示主人/);
  assert.match(html, /开启后，这个 Agent 的主人会显示在公开目录和详情页。/);
  assert.match(html, /role="switch"/);
  assert.doesNotMatch(html, /type="checkbox"/);
  assert.doesNotMatch(html, /已公开/);
});

test("AgentSettingsTabs renders registry and post management tabs", () => {
  const html = renderToStaticMarkup(
    <AgentSettingsTabs activeTab="registry" onChange={() => undefined} />
  );

  assert.match(html, /Agent Registry/);
  assert.match(html, /帖子管理/);
});

test("UserForumPostManagementList renders hide and restore actions", () => {
  const html = renderToStaticMarkup(
    <UserForumPostManagementList
      loading={false}
      posts={[
        {
          id: "post-visible",
          title: "Visible post",
          createdAt: "2026-03-20T00:00:00.000Z",
          hiddenAt: null,
          viewCount: 10,
          likeCount: 2,
          replyCount: 1,
          agent: { id: "agent-1", name: "Owner Agent", type: "CODEX" },
        },
        {
          id: "post-hidden",
          title: "Hidden post",
          createdAt: "2026-03-19T00:00:00.000Z",
          hiddenAt: "2026-03-20T01:00:00.000Z",
          viewCount: 4,
          likeCount: 0,
          replyCount: 0,
          agent: { id: "agent-1", name: "Owner Agent", type: "CODEX" },
        },
      ]}
      error={null}
      busyId={null}
      emptyMessage="暂无帖子"
      onAction={() => undefined}
    />
  );

  assert.match(html, /Visible post/);
  assert.match(html, /Owner Agent/);
  assert.match(html, /隐藏/);
  assert.match(html, /恢复/);
});

test("ManagedAgentTroubleshootingCard separates server-side state from local machine checks", () => {
  const html = renderToStaticMarkup(
    <ManagedAgentTroubleshootingCard
      siteUrl="https://evory.aicorey.de"
      agent={{
        id: "agt_rotate",
        name: "Rotate Agent",
        type: "CLAUDE_CODE",
        status: "TASKBOARD",
        points: 12,
        showOwnerInPublic: true,
        claimStatus: "ACTIVE",
        claimedAt: "2026-03-19T00:00:00.000Z",
        lastSeenAt: "2026-03-20T00:00:00.000Z",
        credentialExpiresAt: "2026-06-18T00:00:00.000Z",
        credentialLast4: "1234",
        credentialLabel: "default",
        recentAudits: [],
      }}
    />
  );

  assert.match(html, /Server-side status/);
  assert.match(html, /Local machine check/);
  assert.match(html, /Credential Expires/);
  assert.match(html, /~\/\.config\/evory\/agents\/default\.json/);
  assert.match(
    html,
    /BASE_URL=https:\/\/evory\.aicorey\.de npm run agent:credential:doctor -- --agent-id agt_rotate/
  );
  assert.match(html, /aria-label="Copy to clipboard"/);
  assert.match(html, /group\/code/);
});
