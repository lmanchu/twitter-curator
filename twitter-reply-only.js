#!/usr/bin/env node

/**
 * Twitter Curator - Reply Only 專門回文腳本
 *
 * 功能：
 * 1. 只執行回覆功能
 * 2. 每小時至少回覆 1 則相關推文
 * 3. 白天時段（07:00-23:00）執行
 * 4. 使用 Persona 驅動的內容生成
 */

require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { generateReply } = require('./content-generator');

puppeteer.use(StealthPlugin());

// ========================================
// 日誌系統
// ========================================

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [REPLY-ONLY] [${level}] ${message}`;
  console.log(logMessage);

  try {
    fs.appendFileSync(config.PATHS.logs, logMessage + '\n');
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

// ========================================
// 數據持久化
// ========================================

function loadJSON(filepath, defaultValue = []) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (error) {
    log(`Error loading ${filepath}: ${error.message}`, 'ERROR');
  }
  return defaultValue;
}

function saveJSON(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  } catch (error) {
    log(`Error saving ${filepath}: ${error.message}`, 'ERROR');
  }
}

// ========================================
// 每日限制檢查
// ========================================

function getDailyStats() {
  const stats = loadJSON(config.PATHS.daily_stats, {});
  const today = new Date().toISOString().split('T')[0];

  if (!stats[today]) {
    stats[today] = { posts: 0, replies: 0, total: 0 };
  }

  return { stats, today };
}

function canReply() {
  const { stats, today } = getDailyStats();
  const todayStats = stats[today];

  // 新的限制：白天回文比較多，設定每日最大 20 則
  const MAX_DAILY_REPLIES = 20;

  if (todayStats.replies >= MAX_DAILY_REPLIES) {
    log('Daily reply limit reached', 'WARN');
    return false;
  }

  if (todayStats.total >= config.DAILY_LIMITS.max_total) {
    log('Daily total limit reached', 'WARN');
    return false;
  }

  return true;
}

function incrementReplyCount() {
  const { stats, today } = getDailyStats();
  stats[today].replies++;
  stats[today].total++;
  saveJSON(config.PATHS.daily_stats, stats);
}

// ========================================
// 隨機延遲
// ========================================

function randomDelay(min = config.DELAYS.min, max = config.DELAYS.max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ========================================
// 相似度計算（防止回覆內容與原推文相同）
// ========================================

function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// ========================================
// Twitter 登入
// ========================================

async function loginToTwitter(page) {
  try {
    log('Checking Twitter login status...');

    await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
    await randomDelay(2000, 3000);

    const isLoggedIn = await page.evaluate(() => {
      return !window.location.href.includes('/login') &&
             !window.location.href.includes('/i/flow/login');
    });

    if (isLoggedIn) {
      log('Already logged in! ✓');
      return true;
    }

    log('Not logged in. Please login manually...', 'WARN');

    if (!page.url().includes('/login')) {
      await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });
    }

    await page.waitForFunction(
      () => {
        return window.location.href.includes('/home') ||
               window.location.href === 'https://twitter.com/';
      },
      { timeout: 300000 }
    );

    await randomDelay(2000, 3000);
    log('Login successful!');

    return true;

  } catch (error) {
    log(`Login error: ${error.message}`, 'ERROR');
    return false;
  }
}

// ========================================
// 搜尋相關推文
// ========================================

async function searchRelevantTweets(page) {
  try {
    log('Searching for relevant tweets...');

    // 隨機選擇搜尋關鍵詞
    const keywords = config.REPLY_FILTERS.include_keywords;
    const searchTerm = keywords[Math.floor(Math.random() * keywords.length)];

    log(`Searching for: "${searchTerm}"`);

    // 前往搜尋頁面
    const searchUrl = `https://twitter.com/search?q=${encodeURIComponent(searchTerm)}&f=live`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await randomDelay(3000, 5000);

    // 等待推文載入
    await page.waitForSelector('article', { timeout: 10000 });

    // 提取推文
    const tweets = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article'));

      return articles.slice(0, 20).map(article => {
        try {
          const authorElement = article.querySelector('[data-testid="User-Name"]');
          const author = authorElement ? authorElement.textContent : 'Unknown';

          const tweetElement = article.querySelector('[data-testid="tweetText"]');
          const text = tweetElement ? tweetElement.textContent : '';

          const linkElement = article.querySelector('a[href*="/status/"]');
          const tweetId = linkElement ? linkElement.href.split('/status/')[1].split('?')[0] : null;

          return {
            tweetId,
            author,
            text,
            timestamp: new Date().toISOString()
          };
        } catch (e) {
          return null;
        }
      }).filter(t => t && t.tweetId && t.text);
    });

    log(`Found ${tweets.length} tweets`);
    return tweets;

  } catch (error) {
    log(`Error searching tweets: ${error.message}`, 'ERROR');
    return [];
  }
}

// ========================================
// 篩選值得回覆的推文
// ========================================

function filterTweetsForReply(tweets) {
  const repliedTweets = loadJSON(config.PATHS.replied_tweets);
  const repliedIds = new Set(repliedTweets.map(t => t.tweetId));

  const filtered = tweets.filter(tweet => {
    // ✅ 過濾自己的推文
    if (tweet.author && (tweet.author.includes('lmanchu') || tweet.author.includes('@lmanchu'))) {
      log(`Skipping own tweet from @${tweet.author}`, 'INFO');
      return false;
    }

    // 已回覆過
    if (repliedIds.has(tweet.tweetId)) {
      return false;
    }

    // 檢查語言（只回覆英文或非中文）
    const hasChinese = /[\u4e00-\u9fa5]/.test(tweet.text);
    if (hasChinese) {
      return false;
    }

    // 檢查垃圾關鍵詞
    const lowerText = tweet.text.toLowerCase();
    if (config.REPLY_FILTERS.exclude_keywords.some(kw => lowerText.includes(kw))) {
      return false;
    }

    return true;
  });

  log(`Filtered to ${filtered.length} tweets worth replying to`);
  return filtered;
}

// ========================================
// 發送回覆
// ========================================

async function replyToTweet(page, tweet, replyText) {
  try {
    if (config.DRY_RUN) {
      log(`[DRY RUN] Would reply to @${tweet.author}: "${replyText}"`, 'INFO');
      return true;
    }

    log(`Replying to @${tweet.author}...`);

    // 前往推文頁面
    const tweetUrl = `https://twitter.com/i/status/${tweet.tweetId}`;
    await page.goto(tweetUrl, { waitUntil: 'networkidle2' });
    await randomDelay();

    // 點擊回覆按鈕
    const replyButton = await page.$('[data-testid="reply"]');
    if (replyButton) {
      await replyButton.click();
      await randomDelay(1000, 2000);
    }

    // 輸入回覆
    const textBox = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 5000 });
    await textBox.type(replyText, { delay: 50 });
    await randomDelay(1000, 2000);

    // 發送
    const sendButton = await page.$('[data-testid="tweetButton"]');
    if (sendButton) {
      await sendButton.click();
      await randomDelay(3000, 5000);

      log(`✅ Reply sent to @${tweet.author}`);

      // 記錄已回覆
      const repliedTweets = loadJSON(config.PATHS.replied_tweets);
      repliedTweets.push({
        tweetId: tweet.tweetId,
        tweetText: tweet.text.substring(0, 100),
        tweetAuthor: tweet.author,
        reply: replyText,
        timestamp: new Date().toISOString(),
        url: `https://twitter.com/i/status/${tweet.tweetId}`
      });
      saveJSON(config.PATHS.replied_tweets, repliedTweets);

      incrementReplyCount();
      return true;
    }

    log('Send button not found', 'ERROR');
    return false;

  } catch (error) {
    log(`Error replying to tweet: ${error.message}`, 'ERROR');
    return false;
  }
}

// ========================================
// 主函數 - 只執行回覆
// ========================================

async function main() {
  log('=== Twitter Reply-Only Started ===');
  log(`Mode: ${config.DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  let browser;

  try {
    // 檢查是否在白天時段（07:00-23:00）
    const hour = new Date().getHours();
    if (hour < 7 || hour >= 23) {
      log(`Not in daytime hours (current: ${hour}:00). Skipping.`, 'INFO');
      return;
    }

    // 載入 Persona
    const persona = fs.readFileSync(config.PERSONA_FILE, 'utf-8');
    log('Persona loaded successfully');

    // 啟動瀏覽器
    log('Launching browser...');
    const userDataDir = path.join(__dirname, 'chrome-user-data');

    browser = await puppeteer.launch({
      headless: config.HEADLESS,
      userDataDir: userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      defaultViewport: {
        width: 1280,
        height: 800
      }
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 登入
    const loggedIn = await loginToTwitter(page);
    if (!loggedIn) {
      throw new Error('Failed to login to Twitter');
    }

    // ========================================
    // 只執行回覆，至少回 1 則
    // ========================================

    if (canReply()) {
      log('\n--- Finding tweets to reply to ---');

      const tweets = await searchRelevantTweets(page);
      const worthReplyingTo = filterTweetsForReply(tweets);

      // 嘗試最多 5 則推文，直到成功回覆 1 則
      const tweetsToReply = worthReplyingTo.slice(0, 5);

      log(`Will try up to ${tweetsToReply.length} tweets`);

      let successCount = 0;
      let skippedCount = 0;
      for (const tweet of tweetsToReply) {
        // 如果已成功回覆，跳過剩餘推文
        if (successCount >= 1) break;
        log(`\n--- Processing tweet from @${tweet.author} ---`);
        log(`Tweet: ${tweet.text.substring(0, 100)}...`);

        const replyText = await generateReply(tweet.text, tweet.author, persona, config.GEMINI_API_KEY);

        // ✅ 驗證回覆內容
        if (!replyText) {
          log(`⚠️  Skipped: Reply generation failed`, 'WARN');
          skippedCount++;
          continue;
        }

        // ✅ 驗證回覆不等於原推文
        const cleanOriginal = tweet.text.trim().substring(0, 200);
        const cleanReply = replyText.trim().substring(0, 200);
        if (cleanReply === cleanOriginal) {
          log(`⚠️  Skipped: Reply is identical to original tweet`, 'WARN');
          skippedCount++;
          continue;
        }

        // ✅ 驗證回覆不包含原推文的大部分內容
        const similarity = calculateSimilarity(cleanOriginal, cleanReply);
        if (similarity > 0.8) {
          log(`⚠️  Skipped: Reply too similar to original (${(similarity * 100).toFixed(0)}% match)`, 'WARN');
          skippedCount++;
          continue;
        }

        // ✅ 發送回覆
        const success = await replyToTweet(page, tweet, replyText);
        if (success) {
          successCount++;
        }

        // 延遲避免被偵測
        await randomDelay(config.DELAYS.between_actions, config.DELAYS.between_actions + 5000);
      }

      log(`\n=== Completed: ${successCount} sent, ${skippedCount} skipped ===`);
    } else {
      log('Skipping replies - daily limit reached');
    }

    const { stats, today } = getDailyStats();
    log(`\n📊 Today's stats: ${stats[today].posts} posts, ${stats[today].replies} replies, ${stats[today].total} total`);

  } catch (error) {
    log(`Main error: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
  } finally {
    if (browser) {
      await browser.close();
      log('Browser closed');
    }
  }
}

// 執行
if (require.main === module) {
  main().catch(error => {
    log(`Unhandled error: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = { main };
