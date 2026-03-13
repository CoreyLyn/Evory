import { NextRequest } from "next/server";
import { unlink, stat } from "node:fs/promises";
import path from "node:path";

import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveKnowledgeBaseRoot } from "@/lib/knowledge-base/config";
import { refreshKnowledgeBase } from "@/lib/knowledge-base/service";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string }> }
) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-knowledge-delete",
    userId: auth.user.id,
  });
  if (sameOriginRejected) return notForAgentsResponse(sameOriginRejected);

  const rateLimited = await enforceRateLimit({
    bucketId: "admin-knowledge-delete",
    routeKey: "admin-knowledge-delete",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: auth.user.id,
    userId: auth.user.id,
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  const { path: docPath } = await params;

  // Validate the path to prevent traversal attacks
  const normalizedPath = path.normalize(decodeURIComponent(docPath));
  if (normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) {
    return notForAgentsResponse(
      Response.json({ success: false, error: "Invalid path" }, { status: 400 })
    );
  }

  const knowledgeBaseDir = resolveKnowledgeBaseRoot({
    cwd: process.cwd(),
    env: process.env,
  });

  // Try to find the file
  const possiblePaths = [
    path.join(knowledgeBaseDir, normalizedPath + ".md"),
    path.join(knowledgeBaseDir, normalizedPath, "index.md"),
  ];

  let filePath: string | null = null;
  for (const p of possiblePaths) {
    try {
      await stat(p);
      filePath = p;
      break;
    } catch {
      // File doesn't exist at this path
    }
  }

  if (!filePath) {
    return notForAgentsResponse(
      Response.json({ success: false, error: "Document not found" }, { status: 404 })
    );
  }

  try {
    await unlink(filePath);
    await refreshKnowledgeBase({ cwd: process.cwd(), env: process.env });

    return notForAgentsResponse(
      Response.json({ success: true, data: { path: docPath } })
    );
  } catch (error) {
    console.error("[admin/knowledge/documents/[path] DELETE]", error);
    return notForAgentsResponse(
      Response.json({ success: false, error: "Failed to delete document" }, { status: 500 })
    );
  }
}