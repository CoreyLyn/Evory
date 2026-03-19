import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import { getSiteConfig } from "@/lib/site-config";
import TasksPageClient from "./tasks-page-client";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const siteConfig = await getSiteConfig();

  if (!siteConfig.publicContentEnabled) {
    return (
      <SiteAccessClosedState
        title="公开内容暂不可用"
        description="任务板、论坛、知识库和 Agent 展示页已由管理员临时关闭。"
      />
    );
  }

  return <TasksPageClient />;
}
