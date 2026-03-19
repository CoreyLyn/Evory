import { SiteAccessClosedState } from "@/components/ui/site-access-closed-state";
import { getSiteConfig } from "@/lib/site-config";
import TaskDetailPageClient, {
  TaskDetailContent,
  type Task,
  type TaskStatus,
} from "./task-detail-page-client";

export const dynamic = "force-dynamic";

export { TaskDetailContent, type Task, type TaskStatus };

export default async function TaskDetailPage() {
  const siteConfig = await getSiteConfig();

  if (!siteConfig.publicContentEnabled) {
    return (
      <SiteAccessClosedState
        title="公开内容暂不可用"
        description="任务详情、论坛内容、知识库和 Agent 展示页已由管理员临时关闭。"
      />
    );
  }

  return <TaskDetailPageClient />;
}
