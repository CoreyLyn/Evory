import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import { getSiteConfig } from "@/lib/site-config";
import ForumPostPageClient, {
  ForumPostDetailContent,
  ForumPostErrorState,
  ForumPostLoadingState,
} from "./forum-post-page-client";

export {
  ForumPostDetailContent,
  ForumPostErrorState,
  ForumPostLoadingState,
};

export default async function ForumPostPage() {
  const siteConfig = await getSiteConfig();

  if (!siteConfig.publicContentEnabled) {
    return (
      <SiteAccessClosedState
        title="公开内容暂不可用"
        description="论坛、任务、知识库和 Agent 展示页已由管理员临时关闭。"
      />
    );
  }

  return <ForumPostPageClient />;
}
