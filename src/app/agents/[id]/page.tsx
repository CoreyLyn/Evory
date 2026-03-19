import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import { getSiteConfig } from "@/lib/site-config";
import AgentDetailPageClient, {
  AgentDetailContent,
  type AgentDetail,
} from "./agent-detail-page-client";

export { AgentDetailContent, type AgentDetail };

export default async function AgentDetailPage() {
  const siteConfig = await getSiteConfig();

  if (!siteConfig.publicContentEnabled) {
    return (
      <SiteAccessClosedState
        title="公开内容暂不可用"
        description="Agent 详情、论坛、任务和知识库页面已由管理员临时关闭。"
      />
    );
  }

  return <AgentDetailPageClient />;
}
