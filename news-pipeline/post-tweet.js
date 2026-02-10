#!/usr/bin/env node
/**
 * Standalone Tweet Poster
 *
 * Simple script to post a single tweet using existing cookies.
 * Used by the news publisher for automated posting.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

// Config
const USER_DATA_DIR = path.join(__dirname, '..', 'chrome-user-data');
const POSTED_LOG = path.join(__dirname, 'posted-log.json');
const DRY_RUN = process.env.DRY_RUN === 'true';

// Random delay helper
function delay(min, max = min) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if user data directory exists
function hasUserData() {
  return fs.existsSync(USER_DATA_DIR);
}

// Log posted tweet
function logPosted(tweet) {
  let log = [];
  if (fs.existsSync(POSTED_LOG)) {
    log = JSON.parse(fs.readFileSync(POSTED_LOG, 'utf8'));
  }
  log.push(tweet);
  fs.writeFileSync(POSTED_LOG, JSON.stringify(log, null, 2));
}

// Main posting function
async function postTweet(tweetText) {
  console.log('🐦 Standalone Tweet Poster');
  console.log('='.repeat(50));
  console.log(`Tweet: ${tweetText.substring(0, 100)}...`);
  console.log(`Length: ${tweetText.length} chars`);
  console.log(`DRY_RUN: ${DRY_RUN}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would post tweet');
    return { success: true, dryRun: true };
  }

  // Check user data directory
  if (!hasUserData()) {
    console.error('❌ No user data found. Please login first.');
    console.error(`   Expected: ${USER_DATA_DIR}`);
    return { success: false, error: 'No user data' };
  }

  console.log('\nLaunching browser with existing session...');

  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: USER_DATA_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to Twitter
    console.log('Navigating to Twitter...');
    await page.goto('https://twitter.com/home', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await delay(2000, 3000);

    // Check if logged in
    const isLoggedIn = await page.$('[data-testid="tweetTextarea_0"]');
    if (!isLoggedIn) {
      console.error('❌ Not logged in. Cookies may have expired.');
      await page.screenshot({ path: path.join(__dirname, 'login-needed.png') });
      return { success: false, error: 'Not logged in' };
    }

    console.log('✅ Logged in');

    // Find tweet box and click
    const tweetBox = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await tweetBox.click();
    await delay(500, 1000);

    // Type tweet
    console.log('Typing tweet...');
    await tweetBox.type(tweetText, { delay: 30 });
    await delay(1000, 2000);

    // Click post button
    console.log('Posting...');
    const postButton = await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 10000 });
    await postButton.click();

    await delay(3000, 5000);

    console.log('✅ Tweet posted successfully!');

    // Try to get tweet URL
    let tweetUrl = null;
    try {
      await page.goto('https://twitter.com/lmanchu', { waitUntil: 'networkidle2' });
      await delay(2000);

      tweetUrl = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/status/"]');
        return links.length > 0 ? links[0].href : null;
      });

      if (tweetUrl) {
        console.log(`Tweet URL: ${tweetUrl}`);
      }
    } catch (e) {
      // Ignore URL retrieval errors
    }

    // Log the post
    logPosted({
      text: tweetText,
      timestamp: new Date().toISOString(),
      url: tweetUrl,
      source: 'news-pipeline'
    });

    await browser.close();
    return { success: true, url: tweetUrl };

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    await browser.close();
    return { success: false, error: error.message };
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node post-tweet.js "Your tweet text here"');
    console.log('       node post-tweet.js --file path/to/tweet.txt');
    process.exit(1);
  }

  let tweetText;

  if (args[0] === '--file') {
    tweetText = fs.readFileSync(args[1], 'utf8').trim();
  } else {
    tweetText = args.join(' ');
  }

  postTweet(tweetText)
    .then(result => {
      if (result.success) {
        console.log('\n✅ Done!');
        process.exit(0);
      } else {
        console.error(`\n❌ Failed: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(err => {
      console.error(`Fatal error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { postTweet };
