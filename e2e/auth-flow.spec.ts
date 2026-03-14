import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  test("can view login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Evory/);
  });
});
