#!/usr/bin/env node

/**
 * Twitter Curator - BrowserOS Version
 * 使用 BrowserOS MCP 替代 Puppeteer
 *
 * 功能：
 * 1. 自動發布推文（基於 Persona）
 * 2. 自動回覆相關推文
 * 3. 內容策展和互動
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { generateTweetWithGemini, generateReplyWithGemini } = require('./content-generator');

// BrowserOS MCP Client
// 注意：這需要 BrowserOS Chrome Extension 運行中
const BROWSEROS_API = {
  // 這些函數會被 MCP 在運行時提供
  // 我們在這裡定義接口
  switchTab: async (tabId) => {
    // Placeholder - 實際由 MCP 提供
    throw new Error('BrowserOS MCP not available');
  },
  getInteractiveElements: async (tabId) => {
    throw new Error('BrowserOS MCP not available');
  },
  typeText: async (tabId, nodeId, text) => {
    throw new Error('BrowserOS MCP not available');
  },
  clickElement: async (tabId, nodeId) => {
    throw new Error('BrowserOS MCP not available');
  },
  getPageContent: async (tabId) => {
    throw new Error('BrowserOS MCP not available');
  }
};

// 配置
const TWITTER_TAB_PATTERN = /x\.com|twitter\.com/;

// 日誌函數
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

// 隨機延遲
function randomDelay(min = config.DELAYS.min, max = config.DELAYS.max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// 載入 Persona
function loadPersona() {
  try {
    if (fs.existsSync(config.PERSONA_FILE)) {
      const personaContent = fs.readFileSync(config.PERSONA_FILE, 'utf-8');
      log(`Persona loaded: ${personaContent.length} characters`);
      return personaContent;
    } else {
      log('Persona file not found', 'WARN');
      return null;
    }
  } catch (error) {
    log(`Error loading persona: ${error.message}`, 'ERROR');
    return null;
  }
}

// 載入/保存 JSON
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
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  } catch (error) {
    log(`Error saving ${filepath}: ${error.message}`, 'ERROR');
  }
}

// 檢查是否在活動時段
function isActiveHour() {
  const hour = new Date().getHours();
  const { start, end } = config.ACTIVE_HOURS;

  if (start > end) {
    // 跨午夜（例如 23:00-07:00）
    return hour >= start || hour < end;
  } else {
    return hour >= start && hour < end;
  }
}

// 檢查每日限制
function checkDailyLimits() {
  const today = new Date().toISOString().split('T')[0];
  const stats = loadJSON(config.PATHS.daily_stats);

  const todayStats = stats.find(s => s.date === today) || { date: today, posts: 0, replies: 0 };

  return {
    canPost: todayStats.posts < config.DAILY_LIMITS.max_posts,
    canReply: todayStats.replies < config.DAILY_LIMITS.max_replies,
    stats: todayStats
  };
}

// 更新每日統計
function updateDailyStats(type) {
  const today = new Date().toISOString().split('T')[0];
  let stats = loadJSON(config.PATHS.daily_stats);

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

  // 只保留最近 30 天
  stats = stats.filter(s => {
    const date = new Date(s.date);
    const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 30;
  });

  saveJSON(config.PATHS.daily_stats, stats);
}

/**
 * 找到 Twitter tab
 * 這個版本需要用戶確保 BrowserOS 中有 Twitter tab 開啟
 */
async function findTwitterTab() {
  // 在實際使用時，這應該透過 MCP 獲取
  // 暫時返回固定 tab ID（用戶需要保持 Twitter tab 開啟）
  log('Looking for Twitter tab in BrowserOS...');

  // TODO: 實際應該調用 browser_list_tabs 並找到 Twitter
  // 現在先假設 tabId 已知
  const assumedTabId = process.env.TWITTER_TAB_ID;

  if (!assumedTabId) {
    throw new Error('TWITTER_TAB_ID not set. Please set the Twitter tab ID in .env');
  }

  log(`Using Twitter tab ID: ${assumedTabId}`);
  return parseInt(assumedTabId);
}

/**
 * 發布推文（使用 BrowserOS）
 */
async function postTweet(tabId, tweetText) {
  try {
    log('Posting tweet via BrowserOS...');

    if (config.DRY_RUN) {
      log(`[DRY RUN] Would post: "${tweetText}"`, 'INFO');
      return true;
    }

    // 1. 切換到 Twitter tab
    await BROWSEROS_API.switchTab(tabId);
    await randomDelay(1000, 2000);

    // 2. 獲取互動元素
    const elements = await BROWSEROS_API.getInteractiveElements(tabId);

    // 3. 找到發文輸入框（通常是 "Post text" 或類似的）
    const tweetInputNode = elements.inputs?.find(el =>
      el.text?.includes('Post') || el.placeholder?.includes('What')
    );

    if (!tweetInputNode) {
      throw new Error('Tweet input box not found');
    }

    // 4. 點擊輸入框
    await BROWSEROS_API.clickElement(tabId, tweetInputNode.nodeId);
    await randomDelay(500, 1000);

    // 5. 輸入推文
    await BROWSEROS_API.typeText(tabId, tweetInputNode.nodeId, tweetText);
    await randomDelay(1000, 2000);

    // 6. 找到並點擊 "Post" 按鈕
    const postButton = elements.clickable?.find(el =>
      el.text === 'Post' && el.type === 'button'
    );

    if (!postButton) {
      throw new Error('Post button not found');
    }

    await BROWSEROS_API.clickElement(tabId, postButton.nodeId);
    await randomDelay(2000, 4000);

    log(`✅ Tweet posted: "${tweetText.substring(0, 50)}..."`);

    // 7. 保存記錄
    const postedTweets = loadJSON(config.PATHS.posted_tweets);
    postedTweets.push({
      text: tweetText,
      timestamp: new Date().toISOString(),
      url: null  // BrowserOS 版本暫時無法獲取 URL
    });
    saveJSON(config.PATHS.posted_tweets, postedTweets);

    // 8. 更新統計
    updateDailyStats('post');

    return true;

  } catch (error) {
    log(`Error posting tweet: ${error.message}`, 'ERROR');
    return false;
  }
}

/**
 * 獲取值得回覆的推文
 */
async function getFeedTweets(tabId) {
  try {
    log('Reading Twitter feed...');

    // 1. 確保在 Home timeline
    await BROWSEROS_API.switchTab(tabId);
    await randomDelay(1000, 2000);

    // 2. 獲取頁面內容
    const content = await BROWSEROS_API.getPageContent(tabId);

    // 3. 解析推文（這部分需要根據實際 BrowserOS 返回格式調整）
    // 暫時先返回空陣列，實際實作時需要解析頁面內容
    log('Feed parsing not yet implemented', 'WARN');
    return [];

  } catch (error) {
    log(`Error reading feed: ${error.message}`, 'ERROR');
    return [];
  }
}

/**
 * 回覆推文
 */
async function replyToTweet(tabId, tweet, replyText) {
  try {
    log(`Replying to @${tweet.author}...`);

    if (config.DRY_RUN) {
      log(`[DRY RUN] Would reply: "${replyText}"`, 'INFO');
      return true;
    }

    // 實際回覆邏輯
    // TODO: 實作透過 BrowserOS 回覆推文
    log('Reply functionality not yet implemented', 'WARN');

    return false;

  } catch (error) {
    log(`Error replying: ${error.message}`, 'ERROR');
    return false;
  }
}

/**
 * 主函數
 */
async function main() {
  log('=== Twitter Curator (BrowserOS) Started ===');
  log(`Mode: ${config.DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

  try {
    // 1. 檢查活動時段
    if (!isActiveHour()) {
      log('Not in active hours, skipping...');
      return;
    }

    // 2. 檢查每日限制
    const limits = checkDailyLimits();
    log(`Daily stats: ${limits.stats.posts} posts, ${limits.stats.replies} replies`);

    if (!limits.canPost && !limits.canReply) {
      log('Daily limits reached, skipping...');
      return;
    }

    // 3. 載入 Persona
    const persona = loadPersona();
    if (!persona) {
      log('Cannot run without persona', 'ERROR');
      return;
    }

    // 4. 找到 Twitter tab
    const tabId = await findTwitterTab();

    // 5. 發文
    if (limits.canPost && config.POSTS_PER_HOUR > 0) {
      log('Generating tweet...');
      const tweetText = await generateTweetWithGemini(persona);

      if (tweetText) {
        await postTweet(tabId, tweetText);
        await randomDelay();
      }
    }

    // 6. 回文
    if (limits.canReply && config.REPLIES_PER_HOUR > 0) {
      log('Looking for tweets to reply to...');
      const tweets = await getFeedTweets(tabId);

      // TODO: 篩選和回覆邏輯
      log('Reply flow not yet fully implemented', 'WARN');
    }

    log('=== Twitter Curator Completed ===');

  } catch (error) {
    log(`Main error: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
    process.exit(1);
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
