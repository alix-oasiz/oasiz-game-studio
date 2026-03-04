import { test } from "@playwright/test";

test("camera diagnostics", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
  await page.click("#start-btn");
  await page.waitForTimeout(250);
  await page.keyboard.press("k");
  await page.waitForTimeout(1200);
  await page.keyboard.press("1");
  await page.waitForTimeout(280);
  await page.screenshot({ path: "screenshots/agent-debug-overview-v2.png" });
  await page.keyboard.press("2");
  await page.waitForTimeout(280);
  await page.screenshot({ path: "screenshots/agent-debug-side-v2.png" });
  await page.keyboard.press("3");
  await page.waitForTimeout(280);
  await page.screenshot({ path: "screenshots/agent-debug-top-v2.png" });
});
