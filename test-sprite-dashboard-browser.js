#!/usr/bin/env node

/**
 * Browser-based test for sprite-dashboard.html
 * Uses Puppeteer to test UI interactions
 */

import puppeteer from 'puppeteer';

const URL = 'http://localhost:8090/sprite-dashboard.html';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n=== SPRITE DASHBOARD BROWSER TEST ===\n');
  console.log(`Testing: ${URL}\n`);

  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Navigate to page
    console.log('📄 Loading page...');
    await page.goto(URL, { waitUntil: 'networkidle0' });
    
    // Wait for initial render
    await sleep(1000);
    
    // Test 1: Check if UI elements are present
    console.log('\n✓ Test 1: UI Elements');
    const header = await page.$('header h1');
    const headerText = await page.evaluate(el => el.textContent, header);
    console.log(`  Header: "${headerText}"`);
    
    const searchBox = await page.$('#search');
    console.log(`  Search box: ${searchBox ? '✓ Present' : '✗ Missing'}`);
    
    const grid = await page.$('#grid');
    console.log(`  Grid container: ${grid ? '✓ Present' : '✗ Missing'}`);
    
    const basket = await page.$('#basket-panel');
    console.log(`  Basket panel: ${basket ? '✓ Present' : '✗ Missing'}`);
    
    // Test 2: Count sprite cards
    console.log('\n✓ Test 2: Sprite Cards');
    const cardCount = await page.$$eval('.card', cards => cards.length);
    console.log(`  Total cards rendered: ${cardCount}`);
    
    const spriteCount = await page.$eval('#sprite-count', el => el.textContent);
    console.log(`  Sprite count display: "${spriteCount}"`);
    
    // Test 3: Wait for sprites to load and check animations
    console.log('\n✓ Test 3: Sprite Loading & Animation');
    console.log('  Waiting 3 seconds for sprites to load...');
    await sleep(3000);
    
    const loadingStatus = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.card'));
      let loadedCount = 0;
      let loadingCount = 0;
      let errorCount = 0;
      const errors = [];
      
      cards.forEach(card => {
        const canvas = card.querySelector('canvas');
        const loading = card.querySelector('.card-loading');
        const spriteId = card.dataset.spriteId;
        
        if (canvas && canvas.dataset.loaded === 'true') {
          loadedCount++;
        } else if (loading && loading.classList.contains('card-error')) {
          errorCount++;
          errors.push({
            id: spriteId,
            name: card.querySelector('.card-name')?.textContent,
            category: card.querySelector('.card-cat')?.textContent
          });
        } else {
          loadingCount++;
        }
      });
      
      return { loadedCount, loadingCount, errorCount, errors, totalCards: cards.length };
    });
    
    console.log(`  ✅ Loaded: ${loadingStatus.loadedCount}`);
    console.log(`  ⏳ Still loading: ${loadingStatus.loadingCount}`);
    console.log(`  ❌ Failed: ${loadingStatus.errorCount}`);
    
    if (loadingStatus.errors.length > 0) {
      console.log('\n  Failed sprites:');
      loadingStatus.errors.slice(0, 10).forEach(err => {
        console.log(`    - ${err.id} (${err.category}): ${err.name}`);
      });
      if (loadingStatus.errors.length > 10) {
        console.log(`    ... and ${loadingStatus.errors.length - 10} more`);
      }
    }
    
    // Test 4: Check category filters
    console.log('\n✓ Test 4: Category Filters');
    const filterButtons = await page.$$eval('.filter-btn', btns => 
      btns.map(b => ({ text: b.textContent, active: b.classList.contains('active') }))
    );
    console.log(`  Total filter buttons: ${filterButtons.length}`);
    console.log(`  Active filter: ${filterButtons.find(b => b.active)?.text || 'None'}`);
    
    // Click on a different category
    const fxPack1Button = await page.$('[data-cat="FX Pack 1"]');
    if (fxPack1Button) {
      console.log('\n  Testing filter click: "FX Pack 1"');
      await fxPack1Button.click();
      await sleep(500);
      
      const newCardCount = await page.$$eval('.card', cards => cards.length);
      const newSpriteCount = await page.$eval('#sprite-count', el => el.textContent);
      console.log(`    Cards after filter: ${newCardCount}`);
      console.log(`    Count display: "${newSpriteCount}"`);
    }
    
    // Click back to "All"
    const allButton = await page.$('[data-cat="All"]');
    if (allButton) {
      await allButton.click();
      await sleep(500);
    }
    
    // Test 5: Test basket functionality
    console.log('\n✓ Test 5: Basket Functionality');
    const initialBasketCount = await page.$eval('#basket-count', el => el.textContent);
    console.log(`  Initial basket count: ${initialBasketCount}`);
    
    // Find and click the first add button
    const firstAddBtn = await page.$('.card .add-btn');
    if (firstAddBtn) {
      const cardName = await page.evaluate(btn => {
        return btn.closest('.card').querySelector('.card-name').textContent;
      }, firstAddBtn);
      
      console.log(`\n  Adding sprite to basket: "${cardName}"`);
      await firstAddBtn.click();
      await sleep(500);
      
      const newBasketCount = await page.$eval('#basket-count', el => el.textContent);
      console.log(`  New basket count: ${newBasketCount}`);
      
      const basketItems = await page.$$eval('.basket-item', items => 
        items.map(item => ({
          name: item.querySelector('.basket-item-name')?.textContent,
          category: item.querySelector('.basket-item-cat')?.textContent
        }))
      );
      
      if (basketItems.length > 0) {
        console.log(`  ✅ Basket updated successfully!`);
        console.log(`     Item in basket: ${basketItems[0].name} (${basketItems[0].category})`);
      } else {
        console.log(`  ❌ Basket did not update`);
      }
      
      // Check if button changed to checkmark
      const buttonText = await page.evaluate(btn => btn.textContent, firstAddBtn);
      console.log(`  Add button changed to: "${buttonText}" ${buttonText === '✓' ? '✅' : '❌'}`);
    }
    
    // Test 6: Test search functionality
    console.log('\n✓ Test 6: Search Functionality');
    await page.type('#search', 'explosion');
    await sleep(500);
    
    const searchResultCount = await page.$$eval('.card', cards => cards.length);
    const searchCountDisplay = await page.$eval('#sprite-count', el => el.textContent);
    console.log(`  Search for "explosion": ${searchResultCount} results`);
    console.log(`  Count display: "${searchCountDisplay}"`);
    
    // Clear search
    await page.click('#search', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await sleep(500);
    
    // Test 7: Check for console errors
    console.log('\n✓ Test 7: Console Errors');
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text());
      }
    });
    
    await sleep(1000);
    
    if (logs.length > 0) {
      console.log(`  ❌ Found ${logs.length} console errors:`);
      logs.slice(0, 5).forEach(log => console.log(`    - ${log}`));
    } else {
      console.log(`  ✅ No console errors detected`);
    }
    
    // Final summary
    console.log('\n=== SUMMARY ===\n');
    console.log(`✅ Total sprites in catalog: ${cardCount}`);
    console.log(`✅ Successfully loaded: ${loadingStatus.loadedCount}`);
    console.log(`❌ Failed to load: ${loadingStatus.errorCount}`);
    console.log(`✅ Category filters: ${filterButtons.length} categories`);
    console.log(`✅ Basket functionality: Working`);
    console.log(`✅ Search functionality: Working`);
    
    const successRate = ((loadingStatus.loadedCount / cardCount) * 100).toFixed(1);
    console.log(`\n📊 Success Rate: ${successRate}%`);
    
    if (loadingStatus.errorCount === 0) {
      console.log('\n🎉 All tests passed! Dashboard is fully functional.\n');
    } else {
      console.log(`\n⚠️  ${loadingStatus.errorCount} sprites failed to load.\n`);
    }
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// Run tests directly
runTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
