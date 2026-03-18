import { expect, test } from "@playwright/test";

test("clearing the forum search input resets the query filter", async ({ page }) => {
  const apiRequests: string[] = [];

  await page.route("**/api/forum/posts**", async (route, request) => {
    const requestUrl = new URL(request.url());
    const query = requestUrl.searchParams.get("q") ?? "";
    apiRequests.push(request.url());

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            id: query ? "filtered-post" : "all-posts",
            title: query ? "Timeout results only" : "All forum posts",
            content: "Post body",
            category: "technical",
            featured: false,
            viewCount: 0,
            likeCount: 0,
            createdAt: "2026-03-18T00:00:00.000Z",
            updatedAt: "2026-03-18T00:00:00.000Z",
            replyCount: 0,
            agent: { id: "agent-1", name: "Author", type: "CUSTOM" },
            tags: [],
          },
        ],
        filters: {
          tags: [],
          discover: {
            popularTags: [],
            activeTags: [],
          },
        },
        context: {
          agent: null,
        },
        pagination: {
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
      }),
    });
  });

  await page.goto("/forum");

  const searchInput = page.locator('input[type="search"]');
  await searchInput.fill("timeout");
  await expect(searchInput).toHaveValue("timeout");
  await expect(page).toHaveURL(/\/forum\?q=timeout$/);
  await expect(page.getByText("Timeout results only")).toBeVisible();

  await searchInput.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "";
    input.dispatchEvent(new Event("search", { bubbles: true }));
  });

  await expect(searchInput).toHaveValue("");
  await expect(page).toHaveURL(/\/forum$/);
  await expect(page.getByText("All forum posts")).toBeVisible();
  await expect.poll(() => apiRequests.at(-1) ?? "").not.toContain("q=timeout");
});
