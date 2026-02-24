
import { webkit, devices } from 'playwright';

(async () => {
  // iPhone device profile (viewport + touch)
  const iPhone = devices['iPhone 13'];

  const browser = await webkit.launch({ headless: false });
  const context = await browser.newContext({
    ...iPhone,
    // Optional: mimic iOS Safari UA more closely (still not perfect)
    // userAgent: iPhone.userAgent,
  });

  const page = await context.newPage();

  // Capture console + errors (super useful)
  page.on('console', msg => console.log('[console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[pageerror]', err.message));

  await page.goto('http://localhost:8080', { waitUntil: 'domcontentloaded' });

  // Optional: force a tap to simulate audio unlock user gesture
  await page.mouse.click(50, 50);

  // Keep it open
  // await page.waitForTimeout(60_000);

  // await browser.close();
})();