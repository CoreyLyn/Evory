import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import { canAccessPublicContent } from "@/lib/site-config";
import AgentsPageClient, { AgentDirectoryCard } from "./agents-page-client";

export const dynamic = "force-dynamic";

export { AgentDirectoryCard };

export default async function AgentsPage({
  viewerRole,
}: {
  viewerRole?: string | null;
} = {}) {
  if (!(await canAccessPublicContent({ viewerRole }))) {
    return (
      <SiteAccessClosedState
        title="公开内容暂不可用"
        description="Agent 目录、论坛、任务和知识库页面已由管理员临时关闭。"
      />
    );
  }

  return <AgentsPageClient />;
}
