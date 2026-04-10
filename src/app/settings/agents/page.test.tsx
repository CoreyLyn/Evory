import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/i18n";
import {
  DELETE_AGENT_CONFIRMATION_MESSAGE,
  AgentRegistryCard,
  AgentSettingsTabs,
  ClaimAgentCard,
  ManagedAgentTroubleshootingCard,
  LatestIssuedCredentialCard,
  ManagedAgentActions,
  ManagedAgentOwnerVisibilityControl,
  type UserApiBaseUrls,
  UserForumPostManagementList,
  UserProvidedApiKeyCard,
  resolveUserProvidedApiKeySummary,
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
    "https://example.com"
  );

  assert.equal(
    command,
    "BASE_URL=https://example.com npm run agent:credential:doctor -- --agent-id agt_rotate"
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

  assert.match(html, /API Key/);
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
        onUpdateName={async () => undefined}
      />
    </LocaleProvider>
  );

  assert.match(html, /Agent Registry/);
  assert.match(html, /owner@example.com/);
  assert.match(html, /退出登录/);
});

test("registry action cards surface their primary actions", () => {
  const registryHtml = renderToStaticMarkup(
    <LocaleProvider>
      <AgentRegistryCard
        user={{
          id: "usr_1",
          email: "owner@example.com",
          name: "Owner",
        }}
        loggingOut={false}
        onLogout={() => undefined}
        onUpdateName={async () => undefined}
      />
    </LocaleProvider>
  );
  const claimHtml = renderToStaticMarkup(
    <ClaimAgentCard
      claimApiKey=""
      busy={false}
      onApiKeyChange={() => undefined}
      onSubmit={() => undefined}
    />
  );

  assert.match(registryHtml, /退出登录/);
  assert.match(claimHtml, /认领 Agent/);
  assert.match(claimHtml, /<textarea/);
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
  assert.match(html, /role="switch"/);
  assert.doesNotMatch(html, /type="checkbox"/);
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
      siteUrl="https://example.com"
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
  assert.match(html, /~\/\.config\/evory\/agents\/default\.json/);
  assert.match(
    html,
    /BASE_URL=https:\/\/example\.com npm run agent:credential:doctor -- --agent-id agt_rotate/
  );
  assert.match(html, /aria-label="Copy to clipboard"/);
});

test("ManagedAgentActions renders delete only for revoked agents", () => {
  const revokedHtml = renderToStaticMarkup(
    <ManagedAgentActions
      agentId="agt_revoked"
      claimStatus="REVOKED"
      busy={false}
      onConnect={() => undefined}
      onRotate={() => undefined}
      onRevoke={() => undefined}
      onDelete={() => undefined}
    />
  );
  const activeHtml = renderToStaticMarkup(
      <ManagedAgentActions
        agentId="agt_active"
        claimStatus="ACTIVE"
        busy={false}
        onConnect={() => undefined}
        onRotate={() => undefined}
        onRevoke={() => undefined}
        onDelete={() => undefined}
      />
  );

  assert.match(revokedHtml, /删除 Agent/);
  assert.doesNotMatch(revokedHtml, /停用 Agent/);
  assert.doesNotMatch(revokedHtml, /连接并检查互动/);
  assert.match(activeHtml, /停用 Agent/);
  assert.doesNotMatch(activeHtml, /删除 Agent/);
  assert.match(activeHtml, /连接并检查互动/);
});

test("resolveUserProvidedApiKeySummary returns the summary payload directly", async () => {
  const summary = {
    status: "NONE",
    application: null,
    providedApiKey: null,
  } as const;

  const result = await resolveUserProvidedApiKeySummary(async () => summary);

  assert.deepEqual(result, summary);
});

test("UserProvidedApiKeyCard renders the account-level request state", () => {
  const html = renderToStaticMarkup(
    <UserProvidedApiKeyCard
      summary={{ status: "NONE", application: null, providedApiKey: null }}
      baseUrls={{ openAiBaseUrl: null, anthropicBaseUrl: null }}
      busy={false}
      onRequest={() => undefined}
    />
  );

  assert.match(html, />API Key</);
  assert.match(html, /立即领取 API Key/);
  assert.doesNotMatch(html, /账号级别的 API Key 申请入口/);
});

test("UserProvidedApiKeyCard renders the sold-out state", () => {
  const html = renderToStaticMarkup(
    <UserProvidedApiKeyCard
      summary={{
        status: "FAILED",
        application: {
          id: "application-2",
          status: "FAILED",
          requestedAt: "2026-04-09T00:00:00.000Z",
          fulfilledAt: "2026-04-09T00:00:00.000Z",
          failureReason: "已发放完，请联系系统管理员。",
        },
        providedApiKey: null,
      }}
      baseUrls={{ openAiBaseUrl: null, anthropicBaseUrl: null }}
      busy={false}
      onRequest={() => undefined}
    />
  );

  assert.match(html, /已发放完，请联系系统管理员/);
  assert.match(html, /立即领取 API Key/);
});

test("UserProvidedApiKeyCard renders masked key and copy action once fulfilled", () => {
  const html = renderToStaticMarkup(
    <UserProvidedApiKeyCard
      summary={{
        status: "FULFILLED",
        application: {
          id: "application-1",
          status: "FULFILLED",
          requestedAt: "2026-04-09T00:00:00.000Z",
          fulfilledAt: "2026-04-09T01:00:00.000Z",
          failureReason: null,
        },
        providedApiKey: {
          id: "key-1",
          maskedKey: "sk-************1234",
          copyValue: "sk-live-secret-1234",
        },
      }}
      baseUrls={{ openAiBaseUrl: null, anthropicBaseUrl: null }}
      busy={false}
      onRequest={() => undefined}
    />
  );

  assert.match(html, /已开通/);
  assert.match(html, /sk-\*{12}1234/);
  assert.doesNotMatch(html, /sk-live-secret-1234/);
  assert.match(html, /Copy to clipboard/);
  assert.doesNotMatch(html, /立即领取 API Key/);
});

test("UserProvidedApiKeyCard renders both base urls when the key is fulfilled", () => {
  const baseUrls: UserApiBaseUrls = {
    openAiBaseUrl: "https://coding.example.com/v1",
    anthropicBaseUrl: "https://coding.example.com/apps/anthropic",
  };
  const html = renderToStaticMarkup(
    <UserProvidedApiKeyCard
      summary={{
        status: "FULFILLED",
        application: {
          id: "application-1",
          status: "FULFILLED",
          requestedAt: "2026-04-09T00:00:00.000Z",
          fulfilledAt: "2026-04-09T01:00:00.000Z",
          failureReason: null,
        },
        providedApiKey: {
          id: "key-1",
          maskedKey: "sk-************1234",
          copyValue: "sk-live-secret-1234",
        },
      }}
      baseUrls={baseUrls}
      busy={false}
      onRequest={() => undefined}
    />
  );

  assert.match(html, />Base URL</);
  assert.match(html, /兼容 OpenAI 接口协议工具/);
  assert.match(html, /https:\/\/coding\.example\.com\/v1/);
  assert.match(html, /兼容 Anthropic 接口协议工具/);
  assert.match(html, /https:\/\/coding\.example\.com\/apps\/anthropic/);
});

test("UserProvidedApiKeyCard hides the base url section before fulfillment", () => {
  const html = renderToStaticMarkup(
    <UserProvidedApiKeyCard
      summary={{
        status: "PENDING",
        application: {
          id: "application-1",
          status: "PENDING",
          requestedAt: "2026-04-09T00:00:00.000Z",
          fulfilledAt: null,
          failureReason: null,
        },
        providedApiKey: null,
      }}
      baseUrls={{
        openAiBaseUrl: "https://coding.example.com/v1",
        anthropicBaseUrl: "https://coding.example.com/apps/anthropic",
      }}
      busy={false}
      onRequest={() => undefined}
    />
  );

  assert.doesNotMatch(html, />Base URL</);
  assert.doesNotMatch(html, /兼容 OpenAI 接口协议工具/);
  assert.doesNotMatch(html, /兼容 Anthropic 接口协议工具/);
});

test("DELETE_AGENT_CONFIRMATION_MESSAGE uses irreversible wording", () => {
  assert.match(DELETE_AGENT_CONFIRMATION_MESSAGE, /不可恢复/);
  assert.match(DELETE_AGENT_CONFIRMATION_MESSAGE, /已删除 Agent/);
});
