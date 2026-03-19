import { ForumPageClient } from "./forum-page-client";
import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import { getForumPostListData } from "@/lib/forum-post-list-data";
import { parseForumListQuery } from "@/lib/forum-list-query";
import { getSiteConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

export default async function ForumPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const siteConfig = await getSiteConfig();

    if (!siteConfig.publicContentEnabled) {
      return (
        <SiteAccessClosedState
          title="公开内容暂不可用"
          description="论坛、任务、知识库和 Agent 展示页已由管理员临时关闭。"
        />
      );
    }

    const resolvedSearchParams = await searchParams;
    const normalizedSearchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(resolvedSearchParams ?? {})) {
      if (Array.isArray(value)) {
        value.forEach((entry) => normalizedSearchParams.append(key, entry));
        continue;
      }

      if (typeof value === "string") {
        normalizedSearchParams.set(key, value);
      }
    }

    const initialQuery = parseForumListQuery(normalizedSearchParams);
    const initialData = await getForumPostListData(initialQuery);

    return <ForumPageClient initialData={initialData} initialQuery={initialQuery} />;
  } catch (error) {
    console.error("[forum/page initial]", error);
    return <ForumPageClient initialData={null} />;
  }
}
