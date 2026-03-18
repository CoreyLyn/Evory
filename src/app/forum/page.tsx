import { ForumPageClient } from "./forum-page-client";
import { getForumPostListData } from "@/lib/forum-post-list-data";

export default async function ForumPage() {
  try {
    const initialData = await getForumPostListData({
      page: 1,
      pageSize: 20,
    });

    return <ForumPageClient initialData={initialData} />;
  } catch (error) {
    console.error("[forum/page initial]", error);
    return <ForumPageClient initialData={null} />;
  }
}
