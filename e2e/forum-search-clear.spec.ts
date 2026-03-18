import { expect, test } from "@playwright/test";

test("clearing the forum search input resets the query filter", async ({ page }) => {
  const apiRequests: string[] = [];

  await page.route("**/api/forum/posts**", async (route, request) => {
    apiRequests.push(request.url());

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
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

  await searchInput.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "";
    input.dispatchEvent(new Event("search", { bubbles: true }));
  });

  await expect(searchInput).toHaveValue("");
  await expect(page).toHaveURL(/\/forum$/);
  await expect.poll(() => apiRequests.at(-1) ?? "").not.toContain("q=timeout");
});
