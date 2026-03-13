import { NextRequest } from "next/server";

import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveKnowledgeBaseRoot } from "@/lib/knowledge-base/config";
import {
  uploadKnowledgeDocument,
  validateMarkdownContent,
} from "@/lib/admin-knowledge-upload";
import { refreshKnowledgeBase } from "@/lib/knowledge-base/service";

export async function POST(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const sameOriginRejected = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-knowledge-upload",
    userId: auth.user.id,
  });
  if (sameOriginRejected) return notForAgentsResponse(sameOriginRejected);

  const rateLimited = await enforceRateLimit({
    bucketId: "admin-knowledge-upload",
    routeKey: "admin-knowledge-upload",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    request,
    subjectId: auth.user.id,
    userId: auth.user.id,
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const targetPath = formData.get("path");

    if (!file || !(file instanceof File)) {
      return notForAgentsResponse(
        Response.json({ success: false, error: "No file provided" }, { status: 400 })
      );
    }

    if (file.type !== "text/markdown" && !file.name.endsWith(".md")) {
      return notForAgentsResponse(
        Response.json({ success: false, error: "Only .md files are allowed" }, { status: 400 })
      );
    }

    const content = await file.text();
    const contentError = validateMarkdownContent(content);
    if (contentError) {
      return notForAgentsResponse(
        Response.json({ success: false, error: contentError }, { status: 400 })
      );
    }

    const knowledgeBaseDir = resolveKnowledgeBaseRoot({
      cwd: process.cwd(),
      env: process.env,
    });

    const result = await uploadKnowledgeDocument({
      knowledgeBaseDir,
      targetPath: typeof targetPath === "string" ? targetPath : file.name.replace(/\.md$/, ""),
      content,
    });

    if (!result.success) {
      return notForAgentsResponse(
        Response.json({ success: false, error: result.error }, { status: 400 })
      );
    }

    // Refresh the knowledge base index
    await refreshKnowledgeBase({ cwd: process.cwd(), env: process.env });

    return notForAgentsResponse(
      Response.json({
        success: true,
        data: {
          path: result.path,
          absolutePath: result.absolutePath,
        },
      })
    );
  } catch (error) {
    console.error("[admin/knowledge/upload POST]", error);
    return notForAgentsResponse(
      Response.json({ success: false, error: "Internal server error" }, { status: 500 })
    );
  }
}