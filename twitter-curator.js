#!/usr/bin/env node

/**
 * Twitter Curator - 智能推文發布與互動系統
 *
 * 功能：
 * 1. 每小時發布 1 則原創推文（23:00-06:00）
 * 2. 每小時回覆 2 則相關推文
 * 3. 使用 Persona 驅動的內容生成
 * 4. 英文內容，符合 Lman 風格
 */

require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const config = process.env.CURATOR_CONFIG
  ? require(process.env.CURATOR_CONFIG)
  : require('./config');
const { generateOriginalTweet, generateReply, generateInterestReply, generateTrackedReply, selectRandomTopic, selectWeightedTopic, loadKnowledgeBase } = require('./content-generator');

puppeteer.use(StealthPlugin());

// ========================================
// 解析追蹤帳號檔案
// ========================================

function parseTrackedAccounts() {
  try {
    const filePath = config.PATHS.tracked_accounts;
    if (!fs.existsSync(filePath)) {
      console.log('[INFO] No tracked-accounts.md found');
      return { twitter: [], linkedin: [] };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const twitter = [];
    const linkedin = [];
    let currentSection = null;
    let currentCategory = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳過空行
      if (!trimmed) continue;

      // 先檢測 section headers (## 開頭)
      if (trimmed.startsWith('## ')) {
        if (trimmed === '## Twitter Accounts') {
          currentSection = 'twitter';
        } else if (trimmed === '## LinkedIn Accounts') {
          currentSection = 'linkedin';
        } else if (trimmed === '## Notes') {
          currentSection = null;  // 停止解析
        } else {
          // 其他 ## 標題，保持當前 section
        }
        continue;
      }

      // 檢測 category (### 開頭)
      if (trimmed.startsWith('### ')) {
        currentCategory = trimmed.replace('### ', '').toLowerCase();
        continue;
      }

      // 跳過註解 (# 開頭但不是 ##/###)
      if (trimmed.startsWith('#')) continue;

      // 跳過其他 markdown 語法
      if (trimmed.startsWith('---') || trimmed.startsWith('- ')) continue;

      // 解析帳號
      if (currentSection === 'twitter') {
        // 取 # 前面的部分，移除 @ 符號和空白
        const username = trimmed.split('#')[0].replace(/^@/, '').trim();
        if (username && !username.includes(' ')) {
          twitter.push({
            username,
            category: currentCategory || 'general',
            priority: getPriority(currentCategory)
          });
        }
      } else if (currentSection === 'linkedin') {
        // 取 # 前面的部分，移除空白
        const username = trimmed.split('#')[0].trim();
        if (username && !username.includes(' ')) {
          linkedin.push({
            username,
            category: currentCategory || 'general',
            priority: getPriority(currentCategory)
          });
        }
      }
    }

    console.log(`[INFO] Parsed tracked accounts: ${twitter.length} Twitter, ${linkedin.length} LinkedIn`);
    return { twitter, linkedin };

  } catch (error) {
    console.error('[ERROR] Failed to parse tracked accounts:', error.message);
    return { twitter: [], linkedin: [] };
  }
}

function getPriority(category) {
  if (!category) return 5;
  // 優先級：Infrastructure > DevOps > AI/ML Engineers > Founders > VCs/低優先
  // priority 1 = 最高 (weight 4x), priority 5 = 最低 (weight 1x)
  // ⚠️ 順序很重要：先檢測 "低優先" 再檢測 "ai"，避免 "ai companies (低優先)" 被誤判
  if (category.includes('低優先') || category.includes('vc') || category.includes('investor')) return 5;
  if (category.includes('infrastructure') || category.includes('networking')) return 1;
  if (category.includes('devops') || category.includes('sre')) return 2;
  if (category.includes('ai') || category.includes('ml') || category.includes('engineer')) return 3;
  if (category.includes('founder') || category.includes('cloud') || category.includes('platform')) return 4;
  return 4;
}

// ========================================
// 日誌系統
// ========================================

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
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

function canPost() {
  const { stats, today } = getDailyStats();
  const todayStats = stats[today];

  if (todayStats.posts >= config.DAILY_LIMITS.max_posts) {
    log('Daily post limit reached', 'WARN');
    return false;
  }

  if (todayStats.total >= config.DAILY_LIMITS.max_total) {
    log('Daily total limit reached', 'WARN');
    return false;
  }

  return true;
}

function canReply() {
  const { stats, today } = getDailyStats();
  const todayStats = stats[today];

  if (todayStats.replies >= config.DAILY_LIMITS.max_replies) {
    log('Daily reply limit reached', 'WARN');
    return false;
  }

  if (todayStats.total >= config.DAILY_LIMITS.max_total) {
    log('Daily total limit reached', 'WARN');
    return false;
  }

  return true;
}

function incrementPostCount() {
  const { stats, today } = getDailyStats();
  stats[today].posts++;
  stats[today].total++;
  saveJSON(config.PATHS.daily_stats, stats);
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
// 計算文本相似度 (簡單的 Jaccard 相似度)
// ========================================

function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// ========================================
// 帳號切換 (Delegate Mode)
// ========================================

async function switchToAccount(page, targetHandle, maxRetries = 3) {
  try {
    log(`Switching to @${targetHandle}...`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Check current account
      const currentHandle = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        return el ? el.textContent.toLowerCase() : '';
      });

      if (currentHandle.includes(targetHandle.toLowerCase())) {
        log(`Already on @${targetHandle} ✓`);
        return true;
      }

      if (attempt > 1) {
        log(`Retry ${attempt}/${maxRetries}: Still on wrong account, retrying switch...`, 'WARN');
      }

      // Click account switcher
      const switcher = await page.waitForSelector('[data-testid="SideNav_AccountSwitcher_Button"]', { timeout: 10000 });
      await switcher.click();
      await randomDelay(1500, 2500);

      // Find and click the target account
      const accounts = await page.$$('[data-testid="UserCell"]');
      let found = false;
      for (const account of accounts) {
        const text = await account.evaluate(el => el.textContent);
        if (text.toLowerCase().includes(targetHandle.toLowerCase())) {
          log(`Found @${targetHandle}, clicking...`);
          await account.click();
          await randomDelay(1500, 2500);

          // Handle delegate account confirmation dialog
          // Twitter shows "You're about to switch to a delegate account" dialog
          // The "Switch accounts" button has no testid, find by text
          try {
            await randomDelay(1000, 1500);
            const switchButton = await page.evaluateHandle(() => {
              const buttons = document.querySelectorAll('button, [role="button"]');
              for (const btn of buttons) {
                if (btn.textContent.trim() === 'Switch accounts') {
                  return btn;
                }
              }
              return null;
            });

            if (switchButton && switchButton.asElement()) {
              log('Confirming delegate switch...');
              await switchButton.asElement().click();
              await randomDelay(2000, 3000);
            }
          } catch (e) {
            // No confirmation dialog, might be switching to own account
            log(`No confirmation dialog: ${e.message}`);
          }

          found = true;
          break;
        }
      }

      if (!found) {
        log(`Account @${targetHandle} not found in switcher`, 'WARN');
        return false;
      }

      // Navigate back to home to trigger account context
      await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
      await randomDelay(2000, 3000);

      // VERIFY the switch actually worked
      const verifyHandle = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        return el ? el.textContent.toLowerCase() : '';
      });

      if (verifyHandle.includes(targetHandle.toLowerCase())) {
        log(`Switched to @${targetHandle} ✓ (verified)`);
        return true;
      }

      log(`Switch verification failed (got: ${verifyHandle}), will retry...`, 'WARN');
      await randomDelay(2000, 3000);
    }

    log(`Failed to switch to @${targetHandle} after ${maxRetries} attempts`, 'ERROR');
    return false;

  } catch (error) {
    log(`Switch account error: ${error.message}`, 'ERROR');
    return false;
  }
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

      // Handle delegate mode - switch to target account if configured
      if (config.DELEGATE_MODE && config.DELEGATE_MODE.enabled) {
        const switched = await switchToAccount(page, config.DELEGATE_MODE.target_account);
        if (!switched) {
          log(`Failed to switch to @${config.DELEGATE_MODE.target_account}`, 'ERROR');
          return false;
        }
      }

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
// 發布原創推文
// ========================================

async function postTweet(page, tweetText) {
  try {
    if (config.DRY_RUN) {
      log(`[DRY RUN] Would post tweet: "${tweetText}"`, 'INFO');
      return true;
    }

    log('Posting tweet...');

    // 前往 Home
    await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
    await randomDelay();

    // Verify correct account in delegate mode - MUST succeed before posting
    if (config.DELEGATE_MODE && config.DELEGATE_MODE.enabled) {
      const target = config.DELEGATE_MODE.target_account.toLowerCase();
      const currentHandle = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        return el ? el.textContent.toLowerCase() : '';
      });

      if (!currentHandle.includes(target)) {
        log(`Wrong account detected (${currentHandle}), switching to @${config.DELEGATE_MODE.target_account}...`, 'WARN');
        const switched = await switchToAccount(page, config.DELEGATE_MODE.target_account);
        if (!switched) {
          log(`ABORT: Cannot switch to @${config.DELEGATE_MODE.target_account}, refusing to post to wrong account`, 'ERROR');
          return false;
        }
        await page.goto('https://twitter.com/home', { waitUntil: 'networkidle2' });
        await randomDelay();
      }

      // Final verification before typing
      const finalHandle = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        return el ? el.textContent.toLowerCase() : '';
      });
      if (!finalHandle.includes(target)) {
        log(`ABORT: Final verification failed (got: ${finalHandle}), refusing to post`, 'ERROR');
        return false;
      }
      log(`Account verified: @${config.DELEGATE_MODE.target_account} ✓`);
    }

    // 找到 tweet 輸入框
    const tweetBox = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await tweetBox.click();
    await randomDelay(500, 1000);

    // 輸入推文
    await tweetBox.type(tweetText, { delay: 50 });
    await randomDelay(1000, 2000);

    // 發送推文 - 主推文框使用 tweetButtonInline
    const postButton = await page.waitForSelector('[data-testid="tweetButtonInline"]', { timeout: 10000 });
    if (postButton) {
      await postButton.click();
      await randomDelay(3000, 5000);

      log(`✅ Tweet posted: "${tweetText}"`);

      // 等待一下讓推文完全發布
      await randomDelay(2000, 3000);

      // 獲取推文 URL - 去 profile 頁面找最新推文
      let tweetUrl = null;
      try {
        log('Getting tweet URL from profile...');
        // Use delegate target if configured, otherwise extract from account switcher
        let profileHandle = 'lmanchu';
        if (config.DELEGATE_MODE && config.DELEGATE_MODE.enabled) {
          profileHandle = config.DELEGATE_MODE.target_account;
        }
        await page.goto(`https://twitter.com/${profileHandle}`, { waitUntil: 'networkidle2' });
        await randomDelay(2000, 3000);

        // 找到第一個推文的連結
        const latestTweetUrl = await page.evaluate(() => {
          const links = document.querySelectorAll('a[href*="/status/"]');
          if (links.length > 0) {
            return links[0].href;
          }
          return null;
        });

        if (latestTweetUrl) {
          tweetUrl = latestTweetUrl;
          log(`Tweet URL: ${tweetUrl}`);
        }
      } catch (e) {
        log(`Could not get tweet URL: ${e.message}`, 'WARN');
      }

      // 記錄已發布
      const postedTweets = loadJSON(config.PATHS.posted_tweets);
      postedTweets.push({
        text: tweetText,
        timestamp: new Date().toISOString(),
        url: tweetUrl,
        method: 'puppeteer'
      });
      saveJSON(config.PATHS.posted_tweets, postedTweets);

      incrementPostCount();
      return true;
    }

    log('Post button not found', 'ERROR');
    return false;

  } catch (error) {
    log(`Error posting tweet: ${error.message}`, 'ERROR');
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
// 搜尋興趣相關推文 (Anime/SciFi)
// ========================================

async function searchInterestTweets(page) {
  try {
    const interestConfig = config.INTEREST_ENGAGEMENT;
    if (!interestConfig || !interestConfig.enabled) {
      log('Interest engagement not enabled');
      return [];
    }

    log('🎬 Searching for interest-based tweets (Anime/SciFi)...');

    // 決定搜尋策略：50% 搜尋官方帳號，50% 搜尋關鍵詞
    const searchMethod = Math.random() < 0.5 ? 'account' : 'keyword';

    let searchUrl;

    if (searchMethod === 'account' && interestConfig.official_accounts && interestConfig.official_accounts.length > 0) {
      // 隨機選擇一個官方帳號
      const accounts = [...(interestConfig.official_accounts || []), ...(interestConfig.creator_accounts || [])];
      const account = accounts[Math.floor(Math.random() * accounts.length)];
      log(`Searching tweets from @${account}`);
      searchUrl = `https://twitter.com/search?q=from:${account}&f=live`;
    } else if (interestConfig.keywords && interestConfig.keywords.length > 0) {
      // 隨機選擇一個關鍵詞
      const keyword = interestConfig.keywords[Math.floor(Math.random() * interestConfig.keywords.length)];
      log(`Searching for interest keyword: "${keyword}"`);
      searchUrl = `https://twitter.com/search?q=${encodeURIComponent(keyword)}&f=live`;
    } else {
      log('No interest accounts or keywords configured');
      return [];
    }

    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await randomDelay(3000, 5000);

    // 等待推文載入
    try {
      await page.waitForSelector('article', { timeout: 10000 });
    } catch (e) {
      log('No articles found for interest search');
      return [];
    }

    // 提取推文
    const tweets = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article'));

      return articles.slice(0, 15).map(article => {
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
            isInterestBased: true,  // 標記為興趣導向
            timestamp: new Date().toISOString()
          };
        } catch (e) {
          return null;
        }
      }).filter(t => t && t.tweetId && t.text);
    });

    log(`🎬 Found ${tweets.length} interest-based tweets`);
    return tweets;

  } catch (error) {
    log(`Error searching interest tweets: ${error.message}`, 'ERROR');
    return [];
  }
}

// ========================================
// 搜尋追蹤帳號推文 (VCs, Influencers)
// ========================================

async function searchTrackedAccountTweets(page) {
  try {
    const trackedConfig = config.TRACKED_ACCOUNTS;
    if (!trackedConfig || !trackedConfig.enabled) {
      log('Tracked accounts not enabled');
      return [];
    }

    const { twitter: trackedAccounts } = parseTrackedAccounts();
    if (trackedAccounts.length === 0) {
      log('No tracked Twitter accounts found');
      return [];
    }

    log('🎯 Searching for tweets from tracked accounts...');

    // 按優先級排序，優先選擇高優先級帳號
    const sortedAccounts = trackedAccounts.sort((a, b) => a.priority - b.priority);

    // 隨機選擇一個帳號（偏向高優先級）
    // 使用加權隨機：priority 1 有 4x 機率，priority 2 有 2x 機率
    const weightedAccounts = [];
    for (const account of sortedAccounts) {
      const weight = Math.max(1, 5 - account.priority);  // priority 1 = weight 4, priority 4 = weight 1
      for (let i = 0; i < weight; i++) {
        weightedAccounts.push(account);
      }
    }

    const selectedAccount = weightedAccounts[Math.floor(Math.random() * weightedAccounts.length)];
    log(`🎯 Selected tracked account: @${selectedAccount.username} (${selectedAccount.category}, priority ${selectedAccount.priority})`);

    // 搜尋該帳號的最新推文
    const searchUrl = `https://twitter.com/search?q=from:${selectedAccount.username}&f=live`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    await randomDelay(3000, 5000);

    // 等待推文載入
    try {
      await page.waitForSelector('article', { timeout: 10000 });
    } catch (e) {
      log(`No tweets found from @${selectedAccount.username}`);
      return [];
    }

    // 提取推文
    const tweets = await page.evaluate((accountInfo) => {
      const articles = Array.from(document.querySelectorAll('article'));

      return articles.slice(0, 10).map(article => {
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
            isTrackedAccount: true,
            trackedCategory: accountInfo.category,
            trackedPriority: accountInfo.priority,
            timestamp: new Date().toISOString()
          };
        } catch (e) {
          return null;
        }
      }).filter(t => t && t.tweetId && t.text);
    }, selectedAccount);

    log(`🎯 Found ${tweets.length} tweets from @${selectedAccount.username}`);
    return tweets;

  } catch (error) {
    log(`Error searching tracked account tweets: ${error.message}`, 'ERROR');
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

    // 前往推文頁面 - 使用更穩定的等待策略
    const tweetUrl = `https://twitter.com/i/status/${tweet.tweetId}`;

    // 先確保頁面穩定，避免 frame detached
    try {
      await page.goto('about:blank', { waitUntil: 'load', timeout: 5000 });
    } catch (e) {
      // 忽略 about:blank 的錯誤
    }

    await page.goto(tweetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // 額外等待頁面完全渲染
    await page.waitForSelector('article', { timeout: 10000 }).catch(() => {});
    await randomDelay(1500, 2500);

    // Verify correct account in delegate mode
    if (config.DELEGATE_MODE && config.DELEGATE_MODE.enabled) {
      const currentHandle = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        return el ? el.textContent.toLowerCase() : '';
      });
      const target = config.DELEGATE_MODE.target_account.toLowerCase();
      if (!currentHandle.includes(target)) {
        log(`Wrong account detected, re-switching to @${config.DELEGATE_MODE.target_account}...`, 'WARN');
        await switchToAccount(page, config.DELEGATE_MODE.target_account);
        await page.goto(tweetUrl, { waitUntil: 'networkidle2' });
        await randomDelay();
      }
    }

    // 點擊回覆按鈕
    const replyButton = await page.$('[data-testid="reply"]');
    if (replyButton) {
      await replyButton.click();
      await randomDelay(1500, 2500);  // 稍微增加等待時間
    } else {
      log('Reply button not found, trying alternative...', 'WARN');
      // Fallback: 直接點擊第一個回覆圖標
      const altReplyButton = await page.$('article [role="button"][aria-label*="Reply"]');
      if (altReplyButton) {
        await altReplyButton.click();
        await randomDelay(1500, 2500);
      }
    }

    // 輸入回覆 - 增加 timeout
    const textBox = await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 10000 });
    await textBox.type(replyText, { delay: 50 });
    await randomDelay(1000, 2000);

    // 發送 - 使用 waitForSelector 而非直接 query，並加入 fallback
    let sendButton = null;
    const sendButtonSelectors = [
      '[data-testid="tweetButton"]',
      '[data-testid="tweetButtonInline"]',
      'button[data-testid="tweetButton"]',
      '[role="button"][data-testid="tweetButton"]'
    ];

    for (const selector of sendButtonSelectors) {
      try {
        sendButton = await page.waitForSelector(selector, { timeout: 3000 });
        if (sendButton) {
          log(`Found send button with selector: ${selector}`, 'DEBUG');
          break;
        }
      } catch (e) {
        // 繼續嘗試下一個 selector
      }
    }

    if (sendButton) {
      await sendButton.click();
      await randomDelay(3000, 5000);

      log(`✅ Reply sent to @${tweet.author}`);

      // 記錄已回覆（包含原始推文作者）
      const repliedTweets = loadJSON(config.PATHS.replied_tweets);
      repliedTweets.push({
        tweetId: tweet.tweetId,
        tweetText: tweet.text.substring(0, 100),
        tweetAuthor: tweet.author,  // 保存作者名稱
        reply: replyText,
        timestamp: new Date().toISOString(),
        url: `https://twitter.com/i/status/${tweet.tweetId}`  // Twitter 推文 URL
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
// 主函數
// ========================================

async function main() {
  log('=== Twitter Curator Started ===');
  log(`Mode: ${config.DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  let browser;

  try {
    // 載入 Persona
    let persona = fs.readFileSync(config.PERSONA_FILE, 'utf-8');
    log('Persona loaded successfully');

    // 載入知識庫（如果有配置）
    if (config.PATHS?.knowledge_base) {
      const knowledgeContent = loadKnowledgeBase(config.PATHS.knowledge_base);
      if (knowledgeContent) {
        persona += knowledgeContent;
        log('Knowledge base loaded and appended to persona');
      }
    }

    // 啟動瀏覽器
    log('Launching browser...');
    const userDataDir = config.USER_DATA_DIR || path.join(__dirname, 'chrome-user-data');

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
    // 發布 1 則原創推文
    // ========================================

    if (canPost()) {
      log('\n--- Generating original tweet ---');

      // 使用加權主題選擇（如果有 TOPIC_CATEGORIES）
      const topic = config.TOPIC_CATEGORIES
        ? selectWeightedTopic(config.TOPIC_CATEGORIES)
        : selectRandomTopic(config.TOPICS);
      log(`Selected topic: ${topic}`);

      const tweetText = await generateOriginalTweet(persona, topic, config.GEMINI_API_KEY);

      if (tweetText) {
        await postTweet(page, tweetText);
        await randomDelay(config.DELAYS.between_actions, config.DELAYS.between_actions + 3000);
      }
    } else {
      log('Skipping post - daily limit reached');
    }

    // ========================================
    // 回覆 2 則推文 (包含追蹤帳號和興趣導向回覆)
    // ========================================

    if (canReply()) {
      log('\n--- Finding tweets to reply to ---');

      // 決定回覆類型
      const trackedConfig = config.TRACKED_ACCOUNTS;
      const interestConfig = config.INTEREST_ENGAGEMENT;

      // 優先級：追蹤帳號 > 興趣 > 一般
      // 追蹤帳號：1/3 機率 (33%)
      // 興趣：1/5 機率 (20%)
      const includeTrackedReply = trackedConfig &&
                                  trackedConfig.enabled &&
                                  Math.random() * trackedConfig.ratio < 1;

      const includeInterestReply = !includeTrackedReply &&  // 如果已經有追蹤帳號回覆，就不加興趣回覆
                                   interestConfig &&
                                   interestConfig.enabled &&
                                   Math.random() * interestConfig.ratio < 1;

      let allTweetsToReply = [];

      // 搜尋一般推文
      const tweets = await searchRelevantTweets(page);
      const worthReplyingTo = filterTweetsForReply(tweets);

      if (includeTrackedReply) {
        log('🎯 This round includes a tracked account reply (VC/Influencer)');

        // 搜尋追蹤帳號推文
        const trackedTweets = await searchTrackedAccountTweets(page);
        const filteredTrackedTweets = filterTweetsForReply(trackedTweets);

        if (filteredTrackedTweets.length > 0) {
          // 取 1 則追蹤帳號推文 + 1 則一般推文
          allTweetsToReply = [
            filteredTrackedTweets[0],  // 追蹤帳號推文
            ...worthReplyingTo.slice(0, config.REPLIES_PER_HOUR - 1)  // 其餘一般推文
          ];
        } else {
          log('No tracked account tweets found, falling back to regular tweets');
          allTweetsToReply = worthReplyingTo.slice(0, config.REPLIES_PER_HOUR);
        }
      } else if (includeInterestReply) {
        log('🎬 This round includes an interest-based reply');

        // 搜尋興趣相關推文
        const interestTweets = await searchInterestTweets(page);
        const filteredInterestTweets = filterTweetsForReply(interestTweets);

        if (filteredInterestTweets.length > 0) {
          // 取 1 則興趣推文 + 1 則一般推文
          allTweetsToReply = [
            filteredInterestTweets[0],  // 興趣推文
            ...worthReplyingTo.slice(0, config.REPLIES_PER_HOUR - 1)  // 其餘一般推文
          ];
        } else {
          log('No interest tweets found, falling back to regular tweets');
          allTweetsToReply = worthReplyingTo.slice(0, config.REPLIES_PER_HOUR);
        }
      } else {
        allTweetsToReply = worthReplyingTo.slice(0, config.REPLIES_PER_HOUR);
      }

      log(`Will reply to ${allTweetsToReply.length} tweets`);

      let successCount = 0;
      let skippedCount = 0;
      for (const tweet of allTweetsToReply) {
        const isTracked = tweet.isTrackedAccount || false;
        const isInterest = tweet.isInterestBased || false;
        const emoji = isTracked ? '🎯' : (isInterest ? '🎬' : '💬');
        const label = isTracked ? '(Tracked)' : (isInterest ? '(Interest)' : '');
        log(`\n--- ${emoji} Processing tweet from @${tweet.author} ${label} ---`);
        log(`Tweet: ${tweet.text.substring(0, 100)}...`);

        // 根據推文類型選擇回覆生成器
        let replyText;
        if (isTracked && trackedConfig) {
          replyText = await generateTrackedReply(tweet.text, tweet.author, persona, config.GEMINI_API_KEY, trackedConfig, tweet.trackedCategory);
        } else if (isInterest && interestConfig) {
          replyText = await generateInterestReply(tweet.text, tweet.author, persona, config.GEMINI_API_KEY, interestConfig);
        } else {
          replyText = await generateReply(tweet.text, tweet.author, persona, config.GEMINI_API_KEY);
        }

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

      log(`\n=== Completed: ${successCount} sent, ${skippedCount} skipped out of ${allTweetsToReply.length} tweets ===`);
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
