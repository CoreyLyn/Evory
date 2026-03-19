import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import { getSiteConfig } from "@/lib/site-config";
import AgentsPageClient, { AgentDirectoryCard } from "./agents-page-client";

export { AgentDirectoryCard };

export default async function AgentsPage() {
  const siteConfig = await getSiteConfig();

  if (!siteConfig.publicContentEnabled) {
    return (
      <SiteAccessClosedState
        title="公开内容暂不可用"
        description="Agent 目录、论坛、任务和知识库页面已由管理员临时关闭。"
      />
    );
  }

  return <AgentsPageClient />;
}
