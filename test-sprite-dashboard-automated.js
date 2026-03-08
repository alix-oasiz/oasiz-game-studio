/**
 * Automated test script for sprite-dashboard.html
 * Run with: node test-sprite-dashboard-automated.js
 */

const puppeteer = require('puppeteer');

(async () => {
  console.log('[Test] Launching browser...');
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });
  
  console.log('[Test] Navigating to http://localhost:8090/sprite-dashboard.html');
  await page.goto('http://localhost:8090/sprite-dashboard.html', { waitUntil: 'networkidle0' });
  
  // Step 1: Take initial snapshot
  console.log('\n=== STEP 1: Initial Snapshot ===');
  await page.waitForTimeout(1000);
  
  const spriteCount = await page.$eval('#sprite-count', el => el.textContent);
  console.log('Sprite count:', spriteCount);
  
  const gridCards = await page.$$('.card');
  console.log('Total cards rendered:', gridCards.length);
  
  // Check for loading/error states
  const loadingCards = await page.$$('.card-loading:not([style*="display: none"])');
  const errorCards = await page.$$('.card-error');
  console.log('Cards still loading:', loadingCards.length);
  console.log('Cards with errors:', errorCards.length);
  
  // Step 2: Wait for sprites to load
  console.log('\n=== STEP 2: Waiting for sprites to load (5 seconds) ===');
  await page.waitForTimeout(5000);
  
  const loadingCardsAfter = await page.$$('.card-loading:not([style*="display: none"])');
  const errorCardsAfter = await page.$$('.card-error');
  const workingCanvases = await page.$$('canvas[data-loaded="true"]');
  
  console.log('Cards still loading:', loadingCardsAfter.length);
  console.log('Cards with errors:', errorCardsAfter.length);
  console.log('Working canvases:', workingCanvases.length);
  
  // List failed sprites
  if (errorCardsAfter.length > 0) {
    console.log('\n=== Failed Sprites ===');
    for (const errorCard of errorCardsAfter) {
      const card = await errorCard.evaluateHandle(el => el.closest('.card'));
      const spriteId = await card.evaluate(el => el.dataset.spriteId);
      const name = await card.evaluate(el => el.querySelector('.card-name')?.textContent);
      console.log(`- ${spriteId} (${name})`);
    }
  }
  
  // Step 3: Test category filters
  console.log('\n=== STEP 3: Testing Category Filters ===');
  const filterButtons = await page.$$('.filter-btn');
  console.log('Total filter buttons:', filterButtons.length);
  
  // Click a few filters
  const filterTests = ['FX Pack 1', 'Characters', 'Projectiles 1'];
  for (const filterName of filterTests) {
    const button = await page.$(`button[data-cat="${filterName}"]`);
    if (button) {
      console.log(`\nClicking filter: ${filterName}`);
      await button.click();
      await page.waitForTimeout(500);
      
      const activeFilter = await page.$eval('.filter-btn.active', el => el.dataset.cat);
      const visibleCards = await page.$$('.card');
      console.log(`Active filter: ${activeFilter}, Visible cards: ${visibleCards.length}`);
    }
  }
  
  // Reset to All
  const allButton = await page.$('button[data-cat="All"]');
  await allButton.click();
  await page.waitForTimeout(500);
  
  // Step 4: Test basket functionality
  console.log('\n=== STEP 4: Testing Basket ===');
  
  // Find first working sprite
  const firstWorkingCard = await page.$('.card canvas[data-loaded="true"]');
  if (firstWorkingCard) {
    const card = await firstWorkingCard.evaluateHandle(el => el.closest('.card'));
    const spriteId = await card.evaluate(el => el.dataset.spriteId);
    const spriteName = await card.evaluate(el => el.querySelector('.card-name')?.textContent);
    
    console.log(`Adding sprite to basket: ${spriteName} (${spriteId})`);
    
    // Hover and click add button
    await card.hover();
    await page.waitForTimeout(200);
    const addBtn = await card.$('.add-btn');
    await addBtn.click();
    await page.waitForTimeout(500);
    
    // Check basket count
    const basketCount = await page.$eval('#basket-count', el => el.textContent);
    console.log('Basket count:', basketCount);
    
    // Check basket items
    const basketItems = await page.$$('.basket-item');
    console.log('Basket items:', basketItems.length);
    
    if (basketItems.length > 0) {
      const basketItemName = await page.$eval('.basket-item-name', el => el.textContent);
      const basketItemPath = await page.$eval('.basket-item-path', el => el.textContent);
      console.log('Basket item name:', basketItemName);
      console.log('Basket item path:', basketItemPath);
    }
  } else {
    console.log('No working sprites found to test basket');
  }
  
  // Step 5: Summary report
  console.log('\n=== FINAL REPORT ===');
  const finalSpriteCount = await page.$eval('#sprite-count', el => el.textContent);
  const finalWorkingCanvases = await page.$$('canvas[data-loaded="true"]');
  const finalErrorCards = await page.$$('.card-error');
  const finalBasketCount = await page.$eval('#basket-count', el => el.textContent);
  
  console.log('Total sprites:', finalSpriteCount);
  console.log('Working sprites:', finalWorkingCanvases.length);
  console.log('Failed sprites:', finalErrorCards.length);
  console.log('Basket items:', finalBasketCount);
  
  // UI Issues check
  console.log('\n=== UI Issues ===');
  const headerVisible = await page.$eval('header', el => el.offsetHeight > 0);
  const gridVisible = await page.$eval('#grid', el => el.offsetHeight > 0);
  const basketVisible = await page.$eval('#basket-panel', el => el.offsetHeight > 0);
  
  console.log('Header visible:', headerVisible);
  console.log('Grid visible:', gridVisible);
  console.log('Basket visible:', basketVisible);
  
  // Take screenshot
  await page.screenshot({ path: 'sprite-dashboard-test.png', fullPage: true });
  console.log('\nScreenshot saved to: sprite-dashboard-test.png');
  
  console.log('\n[Test] Complete! Closing browser in 3 seconds...');
  await page.waitForTimeout(3000);
  await browser.close();
})();
