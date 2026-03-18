import { createHash, randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import prisma from "@/lib/prisma";

export const FORUM_VIEW_WINDOW_HOURS = 6;
export const FORUM_VIEWER_COOKIE = "forum_viewer";

const MS_PER_HOUR = 60 * 60 * 1000;
const BOT_USER_AGENT_PATTERN =
  /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless/i;

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function shouldCountForumPostView(headers: Headers) {
  const purpose = headers.get("purpose")?.trim().toLowerCase();
  const routerPrefetch = headers.get("next-router-prefetch");
  const userAgent = headers.get("user-agent") ?? "";

  if (purpose === "prefetch" || routerPrefetch !== null) {
    return false;
  }

  return !BOT_USER_AGENT_PATTERN.test(userAgent);
}

export function buildForumViewIdentity(input: {
  viewerAgentId: string | null;
  browserId: string | null;
  userAgent: string | null;
}) {
  if (input.viewerAgentId) {
    return `agent:${input.viewerAgentId}`;
  }

  const browserId = input.browserId?.trim();

  if (browserId) {
    return `browser:${hashValue(`${browserId}:${input.userAgent ?? ""}`)}`;
  }

  return `browser:${hashValue(`${randomUUID()}:${input.userAgent ?? ""}`)}`;
}

function getForumViewWindowStart(now: Date) {
  const bucketMs =
    Math.floor(now.getTime() / (FORUM_VIEW_WINDOW_HOURS * MS_PER_HOUR)) *
    FORUM_VIEW_WINDOW_HOURS *
    MS_PER_HOUR;

  return new Date(bucketMs);
}

function buildForumViewerCookie(browserId: string) {
  return `${FORUM_VIEWER_COOKIE}=${browserId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`;
}

export async function trackForumPostView({
  request,
  postId,
  viewerAgentId,
  now = new Date(),
}: {
  request: NextRequest;
  postId: string;
  viewerAgentId: string | null;
  now?: Date;
}) {
  if (!shouldCountForumPostView(request.headers)) {
    return {
      counted: false,
      setCookie: null,
    };
  }

  const existingBrowserId = request.cookies.get(FORUM_VIEWER_COOKIE)?.value?.trim() ?? null;
  const browserId = viewerAgentId ? null : existingBrowserId || randomUUID();
  const viewerKey = buildForumViewIdentity({
    viewerAgentId,
    browserId,
    userAgent: request.headers.get("user-agent"),
  });

  try {
    await prisma.forumPostView.create({
      data: {
        postId,
        viewerKey,
        windowStart: getForumViewWindowStart(now),
      },
    });
  } catch (error) {
    const duplicateError = error as { code?: string };

    if (duplicateError.code === "P2002") {
      return {
        counted: false,
        setCookie: !viewerAgentId && !existingBrowserId ? buildForumViewerCookie(browserId!) : null,
      };
    }

    throw error;
  }

  await prisma.forumPost.update({
    where: { id: postId },
    data: { viewCount: { increment: 1 } },
  });

  return {
    counted: true,
    setCookie: !viewerAgentId && !existingBrowserId ? buildForumViewerCookie(browserId!) : null,
  };
}
