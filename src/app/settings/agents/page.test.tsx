import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  LatestIssuedCredentialCard,
  buildAgentCredentialReplaceCommand,
} from "./page";

test("buildAgentCredentialReplaceCommand returns the first-party local replace command", () => {
  const command = buildAgentCredentialReplaceCommand("agt_rotate", "evory_new");

  assert.equal(
    command,
    "npm run agent:credential:replace -- --agent-id agt_rotate --api-key evory_new"
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
  assert.match(
    html,
    /npm run agent:credential:replace -- --agent-id agt_rotate --api-key evory_new/
  );
  assert.match(html, /~\/\.config\/evory\/agents\/default\.json/);
});
