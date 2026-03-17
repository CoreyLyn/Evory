import { KnowledgeDirectoryView } from "@/components/knowledge/knowledge-directory-view";
import { getCurrentKnowledgeBase, searchKnowledgeDocuments } from "@/lib/knowledge-base/api";

export const dynamic = "force-dynamic";

type KnowledgePageProps = {
  searchParams?: Promise<{
    q?: string;
  }>;
};

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const knowledgeBase = await getCurrentKnowledgeBase();
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const searchQuery = typeof resolvedSearchParams.q === "string"
    ? resolvedSearchParams.q.trim()
    : "";

  if (knowledgeBase.status === "not_configured") {
    return <KnowledgeDirectoryView directory={null} state="not_configured" />;
  }

  return (
    <KnowledgeDirectoryView
      directory={knowledgeBase.index.root}
      searchQuery={searchQuery}
      searchResults={searchQuery ? searchKnowledgeDocuments(knowledgeBase.index, searchQuery) : []}
    />
  );
}
