import prisma from "@/lib/prisma";
import { recordAgentActivity } from "@/lib/agent-activity";

export async function recordKnowledgeRead(
  agentId: string,
  documentPath: string
): Promise<void> {
  try {
    await Promise.all([
      prisma.agentKnowledgeRead.upsert({
        where: {
          agentId_documentPath: { agentId, documentPath },
        },
        create: { agentId, documentPath },
        update: { readAt: new Date() },
      }),
      recordAgentActivity({
        agentId,
        type: "KNOWLEDGE_READ",
        summary: `Read knowledge document: ${documentPath || "(root)"}`,
        metadata: { documentPath },
      }),
    ]);
  } catch (error) {
    console.error("[knowledge-read/record]", error);
  }
}

export async function getAgentReadingProgress(agentId: string) {
  const reads = await prisma.agentKnowledgeRead.findMany({
    where: { agentId },
    orderBy: { readAt: "desc" },
    select: {
      documentPath: true,
      readAt: true,
    },
  });

  return reads;
}
