#!/usr/bin/env node

/**
 * Twitter Login Helper
 *
 * 協助登入 Twitter 並保存 cookies
 * 只需要執行一次，之後會重複使用 cookies
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE = path.join(__dirname, 'twitter-cookies.json');

async function loginToTwitter() {
  console.log('🚀 Twitter Login Helper');
  console.log('');
  console.log('This script will help you log in to Twitter and save your session.');
  console.log('After this, the automation will work without manual intervention.');
  console.log('');

  const browser = await chromium.launch({
    headless: false,  // Show browser so user can log in
    args: ['--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });

  const page = await context.newPage();

  console.log('📱 Opening Twitter...');
  await page.goto('https://x.com/home');

  console.log('');
  console.log('👉 Please log in to Twitter in the browser window that just opened.');
  console.log('👉 Once you see your Twitter home feed, press ENTER here...');
  console.log('');

  // Wait for user to press ENTER
  await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });

  // Check if logged in
  const isLoggedIn = await page.locator('[data-testid="tweetTextarea_0"]').isVisible().catch(() => false);

  if (!isLoggedIn) {
    console.log('');
    console.log('❌ Could not detect Twitter login.');
    console.log('Please make sure you are logged in and can see the compose box.');
    console.log('');
    await browser.close();
    process.exit(1);
  }

  console.log('✅ Login detected!');
  console.log('');

  // Save cookies
  const cookies = await context.cookies();
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));

  console.log(`✅ Cookies saved to: ${COOKIES_FILE}`);
  console.log('');
  console.log('🎉 All done! You can now run the automation script.');
  console.log('   The automation will use these cookies to stay logged in.');
  console.log('');

  await browser.close();
}

loginToTwitter().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
