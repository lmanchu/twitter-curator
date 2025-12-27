#!/usr/bin/env node

/**
 * LinkedIn Post Now - 立即發布指定內容
 * Usage: node linkedin-post-now.js
 */

require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// 要發布的內容
const POST_CONTENT = `The $3 Trillion Company's AI Paradox

Apple just lost 4 senior executives in one week, including their AI chief.

The Information reports Silicon Valley is already buzzing about Tim Cook's succession — not because Apple is struggling (it's one of the top 3 most valuable companies), but because of what one analyst called "not moving fast enough on AI relative to Zuckerberg or Sundar."

Here's the uncomfortable truth for every CEO:

Having the most resources doesn't guarantee the fastest execution.

Apple has more cash than any tech company in history. Yet three years after ChatGPT, they're still playing catch-up. Why?

Turf wars. Technical debt. Decision paralysis.

The lesson isn't about Apple specifically. It's about what happens when:
→ You optimize for protecting what you have vs. building what's next
→ Your best talent leaves for smaller, faster-moving teams (OpenAI just poached Apple's key hardware engineers)
→ Your succession pipeline isn't stress-tested for paradigm shifts

The next Apple CEO won't just inherit a $3T company.

They'll inherit the question every enterprise leader faces: How do you stay hungry when you're already on top?`;

const DRY_RUN = process.env.DRY_RUN === 'true';
const HEADLESS = process.env.HEADLESS !== 'false';

async function main() {
  console.log('🚀 LinkedIn Post Now');
  console.log(`📝 Content length: ${POST_CONTENT.length} chars`);
  console.log(`🔧 DRY_RUN: ${DRY_RUN}, HEADLESS: ${HEADLESS}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would post:\n');
    console.log(POST_CONTENT);
    console.log('\n✅ Dry run complete');
    return;
  }

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    userDataDir: path.join(__dirname, 'chrome-user-data-linkedin'),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('📱 Navigating to LinkedIn...');
    await page.goto('https://www.linkedin.com/feed/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // 檢查是否已登入
    const isLoggedIn = await page.$('button[aria-label="Start a post"]') !== null ||
                       await page.$('button.share-box-feed-entry__trigger') !== null;

    if (!isLoggedIn) {
      console.log('❌ Not logged in. Please login manually first.');
      console.log('💡 Run with HEADLESS=false to see the browser');
      await browser.close();
      return;
    }

    console.log('✅ Logged in, creating post...');

    // 點擊 "Start a post" 按鈕
    const startPostBtn = await page.$('button[aria-label="Start a post"]') ||
                         await page.$('button.share-box-feed-entry__trigger');

    if (startPostBtn) {
      await startPostBtn.click();
      await new Promise(r => setTimeout(r, 2000));
    }

    // 等待編輯器出現
    await page.waitForSelector('div.ql-editor[data-placeholder]', { timeout: 10000 });

    // 輸入內容
    console.log('✍️  Typing content...');
    const editor = await page.$('div.ql-editor');
    await editor.click();
    await page.keyboard.type(POST_CONTENT, { delay: 10 });

    await new Promise(r => setTimeout(r, 1000));

    // 點擊 Post 按鈕
    console.log('📤 Clicking Post button...');
    const postBtn = await page.$('button.share-actions__primary-action');

    if (postBtn) {
      await postBtn.click();
      await new Promise(r => setTimeout(r, 3000));
      console.log('✅ Post published successfully!');
    } else {
      console.log('❌ Could not find Post button');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

main();
