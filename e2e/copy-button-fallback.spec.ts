import { expect, test } from "@playwright/test";

test("prompt wiki copy button falls back when Clipboard API is unavailable", async ({ page }) => {
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });

    document.execCommand = ((command: string) => {
      if (command !== "copy") {
        return false;
      }

      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
        (window as Window & { __copiedText?: string }).__copiedText = activeElement.value;
        return true;
      }

      return false;
    }) as typeof document.execCommand;
  });

  await page.goto("/wiki/prompts");

  const copyButton = page.locator('button[aria-label="Copy to clipboard"]').first();
  await copyButton.click();

  await expect(copyButton).toHaveAttribute("title", "Copied!");
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __copiedText?: string }).__copiedText ?? ""))
    .toContain("/skill.md");
  await expect.poll(() => consoleErrors.join("\n")).not.toContain("Failed to copy text");
});
