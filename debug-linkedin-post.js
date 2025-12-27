#!/usr/bin/env node

/**
 * Debug LinkedIn Post Button - 找到正確的發文按鈕 selector
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');

puppeteer.use(StealthPlugin());

async function debugPostButton() {
  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: path.join(__dirname, 'chrome-user-data'),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  console.log('🔗 Going to LinkedIn feed...');
  await page.goto('https://www.linkedin.com/feed/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await new Promise(r => setTimeout(r, 5000));

  console.log('\n🔍 Searching for "Start a post" button...\n');

  // 測試多個可能的 selectors
  const selectors = [
    'button[class*="share-box-feed-entry__trigger"]',
    'button[class*="share-box"]',
    'button.share-box-feed-entry__trigger',
    '[data-test-share-box-trigger]',
    'button[aria-label*="Start a post"]',
    '.share-box-feed-entry__trigger',
    'button.artdeco-button--secondary',
    '.feed-shared-update-v2__update-content-wrapper button',
    '[class*="share-creation-state__click-target"]',
    'div.share-box-feed-entry__trigger'
  ];

  for (const selector of selectors) {
    try {
      const elements = await page.$$(selector);
      console.log(`${elements.length > 0 ? '✓' : '✗'} "${selector}" → Found ${elements.length} elements`);

      if (elements.length > 0 && elements.length < 10) {
        const info = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) {
            return {
              tagName: el.tagName,
              classes: Array.from(el.classList).join(' '),
              text: el.textContent.trim().substring(0, 50),
              ariaLabel: el.getAttribute('aria-label'),
              isVisible: el.offsetParent !== null
            };
          }
          return null;
        }, selector);

        if (info) {
          console.log(`  Tag: <${info.tagName}>`);
          console.log(`  Classes: "${info.classes}"`);
          console.log(`  Text: "${info.text}"`);
          console.log(`  Aria-label: "${info.ariaLabel}"`);
          console.log(`  Visible: ${info.isVisible}`);
        }
      }
    } catch (e) {
      console.log(`✗ "${selector}" → Error: ${e.message}`);
    }
  }

  // 嘗試通過文字內容找到按鈕
  console.log('\n🔍 Searching by text content...\n');

  const buttonsByText = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"], [class*="share"]'));
    const matches = [];

    for (const btn of buttons) {
      const text = btn.textContent.toLowerCase();
      if (text.includes('start') || text.includes('post') || text.includes('share')) {
        matches.push({
          tagName: btn.tagName,
          classes: Array.from(btn.classList).slice(0, 5).join(' '),
          text: btn.textContent.trim().substring(0, 80),
          isVisible: btn.offsetParent !== null
        });
      }
    }

    return matches.slice(0, 5);
  });

  buttonsByText.forEach((btn, i) => {
    console.log(`[${i}] <${btn.tagName} class="${btn.classes}">`);
    console.log(`    Text: "${btn.text}"`);
    console.log(`    Visible: ${btn.isVisible}`);
    console.log();
  });

  console.log('\n⏸️  Browser paused. Check the page manually.');
  console.log('💡 Try clicking "Start a post" and inspect the element in DevTools.');
  console.log('\nPress Ctrl+C to exit.\n');

  // 保持瀏覽器開啟
  await new Promise(() => {});
}

debugPostButton().catch(console.error);
