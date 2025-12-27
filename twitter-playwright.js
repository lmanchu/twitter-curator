#!/usr/bin/env node

/**
 * Twitter Curator - Playwright Full Automation
 *
 * 完全自動化的 Twitter 發文系統，使用 Playwright
 * 不需要手動操作，可以半夜自動執行
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { generateOriginalTweet, selectRandomTopic } = require('./content-generator');

// Paths
const COOKIES_FILE = path.join(__dirname, 'twitter-cookies.json');
const POSTED_TWEETS = path.join(__dirname, 'posted-tweets.json');
const DAILY_STATS = path.join(__dirname, 'daily-stats.json');
const LOG_FILE = path.join(__dirname, 'twitter-playwright.log');

// Log function
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

// Load/save JSON
function loadJSON(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (error) {
    log(`Error loading ${filepath}: ${error.message}`, 'ERROR');
  }
  return [];
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Check daily limits
function checkDailyLimits() {
  const today = new Date().toISOString().split('T')[0];
  const stats = loadJSON(DAILY_STATS);
  const todayStats = stats.find(s => s.date === today) || { date: today, posts: 0, replies: 0 };

  return {
    canPost: todayStats.posts < config.DAILY_LIMITS.max_posts,
    canReply: todayStats.replies < config.DAILY_LIMITS.max_replies,
    stats: todayStats
  };
}

// Update daily stats
function updateDailyStats(type) {
  const today = new Date().toISOString().split('T')[0];
  let stats = loadJSON(DAILY_STATS);

  let todayStats = stats.find(s => s.date === today);
  if (!todayStats) {
    todayStats = { date: today, posts: 0, replies: 0 };
    stats.push(todayStats);
  }

  if (type === 'post') {
    todayStats.posts++;
  } else if (type === 'reply') {
    todayStats.replies++;
  }

  // Keep only last 30 days
  stats = stats.filter(s => {
    const date = new Date(s.date);
    const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 30;
  });

  saveJSON(DAILY_STATS, stats);
}

// Load Persona
function loadPersona() {
  try {
    if (fs.existsSync(config.PERSONA_FILE)) {
      return fs.readFileSync(config.PERSONA_FILE, 'utf-8');
    }
  } catch (error) {
    log(`Error loading persona: ${error.message}`, 'ERROR');
  }
  return null;
}

async function postTweetWithPlaywright(tweetText) {
  log('Launching Playwright browser...');

  const browser = await chromium.launch({
    headless: true,  // Run in headless mode for automation
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  // Load cookies if they exist
  if (fs.existsSync(COOKIES_FILE)) {
    log('Loading saved cookies...');
    const cookies = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
    await context.addCookies(cookies);
  }

  const page = await context.newPage();

  try {
    log('Navigating to Twitter...');
    await page.goto('https://x.com/home', { waitUntil: 'networkidle', timeout: 60000 });

    // Wait a bit for page to fully load
    await page.waitForTimeout(3000);

    // Check if logged in
    const isLoggedIn = await page.locator('[data-testid="tweetTextarea_0"]').isVisible().catch(() => false);

    if (!isLoggedIn) {
      log('Not logged in to Twitter!', 'ERROR');
      log('Please log in manually first and save cookies', 'ERROR');

      // Save screenshot for debugging
      await page.screenshot({ path: path.join(__dirname, 'twitter-login-needed.png') });

      await browser.close();
      return false;
    }

    log('✅ Logged in to Twitter');

    // Find the tweet compose box
    log('Finding tweet compose box...');
    const tweetBox = page.locator('[data-testid="tweetTextarea_0"]');

    // Click to focus
    await tweetBox.click();
    await page.waitForTimeout(500);

    // Type the tweet text
    log(`Typing tweet (${tweetText.length} chars)...`);
    await tweetBox.fill(tweetText);
    await page.waitForTimeout(1000);

    // Take screenshot before posting
    if (!config.DRY_RUN) {
      await page.screenshot({ path: path.join(__dirname, 'tweet-before-post.png') });
    }

    if (config.DRY_RUN) {
      log('[DRY RUN] Would post tweet now', 'WARN');
      await page.screenshot({ path: path.join(__dirname, 'tweet-dry-run.png') });
    } else {
      // Find and click the Post button
      log('Clicking Post button...');
      const postButton = page.locator('[data-testid="tweetButtonInline"]');
      await postButton.click();

      // Wait for tweet to be posted
      await page.waitForTimeout(3000);

      log('✅ Tweet posted successfully!');
    }

    // Save cookies for next time
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    log('Saved cookies for next time');

    await browser.close();
    return true;

  } catch (error) {
    log(`Error posting tweet: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');

    // Save screenshot for debugging
    await page.screenshot({ path: path.join(__dirname, 'twitter-error.png') });

    await browser.close();
    return false;
  }
}

async function main() {
  log('=== Twitter Curator (Playwright) Started ===');

  try {
    // 1. Check daily limits
    const limits = checkDailyLimits();
    log(`Daily stats: ${limits.stats.posts} posts, ${limits.stats.replies} replies`);

    if (!limits.canPost) {
      log('Daily post limit reached, exiting');
      return;
    }

    // 2. Load Persona
    const persona = loadPersona();
    if (!persona) {
      log('Cannot run without persona', 'ERROR');
      return;
    }

    // 3. Generate tweet
    log('Generating tweet with Gemini...');
    const topic = selectRandomTopic(config.TOPICS);
    log(`Selected topic: ${topic}`);

    const tweetText = await generateOriginalTweet(persona, topic, config.GEMINI_API_KEY);

    if (!tweetText) {
      log('Failed to generate tweet', 'ERROR');
      return;
    }

    log(`Generated tweet: "${tweetText}"`);

    // 4. Post tweet with Playwright
    const success = await postTweetWithPlaywright(tweetText);

    if (success) {
      // 5. Record the post
      const tweets = loadJSON(POSTED_TWEETS);
      tweets.push({
        text: tweetText,
        timestamp: new Date().toISOString(),
        url: null,
        method: 'playwright'
      });
      saveJSON(POSTED_TWEETS, tweets);
      updateDailyStats('post');

      log('✅ Tweet posted and recorded successfully!');
    } else {
      log('❌ Failed to post tweet', 'ERROR');
      process.exit(1);
    }

  } catch (error) {
    log(`Unhandled error: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
    process.exit(1);
  }
}

// Run
if (require.main === module) {
  main().catch(error => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = { main };
