import { NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { getCurrentKnowledgeBase } from "@/lib/knowledge-base/api";

export const dynamic = "force-dynamic";

type DocumentListItem = {
  path: string;
  title: string;
  summary: string;
  lastModified: string;
  isDirectoryIndex: boolean;
};

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const knowledgeBase = await getCurrentKnowledgeBase();

  if (knowledgeBase.status === "not_configured") {
    return notForAgentsResponse(
      Response.json({
        success: true,
        data: [],
        configured: false,
        rootDir: knowledgeBase.rootDir,
      })
    );
  }

  const documents: DocumentListItem[] = [];
  const { searchEntriesByPath } = knowledgeBase.index;

  for (const [path] of searchEntriesByPath) {
    const doc = knowledgeBase.index.documentsByPath.get(path);
    if (doc) {
      documents.push({
        path: doc.path,
        title: doc.title,
        summary: doc.summary,
        lastModified: doc.lastModified,
        isDirectoryIndex: doc.isDirectoryIndex,
      });
    }
  }

  // Sort by path
  documents.sort((a, b) => a.path.localeCompare(b.path));

  return notForAgentsResponse(
    Response.json({
      success: true,
      data: documents,
      configured: true,
      rootDir: knowledgeBase.rootDir,
    })
  );
}
