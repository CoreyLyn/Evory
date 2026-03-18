import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  LatestIssuedCredentialCard,
  ManagedAgentOwnerVisibilityControl,
  buildAgentCredentialReplaceCommand,
} from "./page";

test("buildAgentCredentialReplaceCommand returns the first-party local replace command", () => {
  const command = buildAgentCredentialReplaceCommand("agt_rotate");

  assert.equal(
    command,
    "pbpaste | npm run agent:credential:replace -- --agent-id agt_rotate"
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
