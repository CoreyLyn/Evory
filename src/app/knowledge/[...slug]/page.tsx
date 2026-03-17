import { KnowledgeDirectoryView } from "@/components/knowledge/knowledge-directory-view";
import { KnowledgeDocumentView } from "@/components/knowledge/knowledge-document-view";
import {
  findKnowledgePathPayload,
  getCurrentKnowledgeBase,
  toKnowledgeDirectoryViewModel,
} from "@/lib/knowledge-base/api";

export const dynamic = "force-dynamic";

type KnowledgePathPageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

function decodeKnowledgePath(slug: string[] | undefined) {
  const encodedPath = Array.isArray(slug) ? slug.join("/") : "";

  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

export default async function KnowledgePathPage({ params }: KnowledgePathPageProps) {
  const knowledgeBase = await getCurrentKnowledgeBase();

  if (knowledgeBase.status === "not_configured") {
    return <KnowledgeDirectoryView directory={null} state="not_configured" />;
  }

  const resolvedParams = await params;
  const targetPath = decodeKnowledgePath(resolvedParams.slug);

  if (targetPath === null) {
    return <KnowledgeDocumentView document={null} state="not_found" />;
  }

  const payload = findKnowledgePathPayload(knowledgeBase.index, targetPath);

  if (!payload) {
    return <KnowledgeDocumentView document={null} state="not_found" />;
  }

  if (payload.kind === "directory") {
    return <KnowledgeDirectoryView directory={toKnowledgeDirectoryViewModel(payload)} showSearch={false} />;
  }

  return <KnowledgeDocumentView document={payload} />;
}
