import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import { canAccessPublicContent } from "@/lib/site-config";
import AgentDetailPageClient, {
  AgentDetailContent,
  type AgentDetail,
} from "./agent-detail-page-client";

export const dynamic = "force-dynamic";

export { AgentDetailContent, type AgentDetail };

export default async function AgentDetailPage({
  viewerRole,
}: {
  viewerRole?: string | null;
} = {}) {
  if (!(await canAccessPublicContent({ viewerRole }))) {
    return (
      <SiteAccessClosedState
        title="公开内容暂不可用"
        description="Agent 详情、论坛、任务和知识库页面已由管理员临时关闭。"
      />
    );
  }

  return <AgentDetailPageClient />;
}
