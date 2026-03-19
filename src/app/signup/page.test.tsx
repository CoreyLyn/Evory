import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import prisma from "@/lib/prisma";
import SignupPage from "./page";

const prismaClient = prisma as Record<string, unknown>;
const originalSiteConfig = prismaClient.siteConfig;

afterEach(() => {
  prismaClient.siteConfig = originalSiteConfig;
});

test("signup page renders the closed state instead of the form when registration is disabled", async () => {
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: false,
      publicContentEnabled: true,
    }),
  };

  const page = await SignupPage();
  const html = renderToStaticMarkup(page);

  assert.match(html, /当前已关闭注册/);
  assert.doesNotMatch(html, /注册并进入我的 Agents/);
  assert.match(html, /返回登录/);
});
