import { chromium } from 'file:///C:/Users/Work/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto('http://localhost:5173');
await page.waitForTimeout(3000);
// Click the button and wait for the title overlay to disappear
const btn = await page.waitForSelector('text=Start Run', { timeout: 5000 });
await btn.click();
// Wait until the title screen is gone (button disappears)
await page.waitForSelector('text=Start Run', { state: 'hidden', timeout: 10000 }).catch(() => {});
await page.waitForTimeout(4000);
await page.screenshot({ path: 'C:/Programming/Contracts/oasiz-game-studio-marble-madness/screenshot-gameplay.png' });
await browser.close();
console.log('Done');
