#!/usr/bin/env node

/**
 * Twitter Curator - Claude Execution Version
 *
 * 這個版本設計為由 Claude Code 直接執行，使用 BrowserOS MCP 工具
 *
 * 執行方式：
 * 1. 由 Claude Code 在對話中執行：Bash(node twitter-curator-claude.js)
 * 2. 或通過 Happy CLI 觸發 Claude 執行
 *
 * ⚠️ 需要環境：
 * - BrowserOS Chrome Extension 運行中
 * - Twitter tab 已開啟並登入
 * - Gemini API key 已設置
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { generateOriginalTweet, selectRandomTopic } = require('./content-generator');

// Twitter Tab ID（從環境變數讀取）
const TWITTER_TAB_ID = parseInt(process.env.TWITTER_TAB_ID || '519391672');

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

// 載入 Persona
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

  stats = stats.filter(s => {
    const date = new Date(s.date);
    const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 30;
  });

  saveJSON(config.PATHS.daily_stats, stats);
}

/**
 * 執行說明
 *
 * ⚠️ 這個函數需要由 Claude 手動執行，因為需要使用 BrowserOS MCP 工具
 *
 * 步驟：
 * 1. Claude 讀取這個腳本
 * 2. 生成推文文字
 * 3. Claude 使用 BrowserOS MCP 執行以下操作：
 *    - mcp__browseros__browser_switch_tab(TWITTER_TAB_ID)
 *    - mcp__browseros__browser_type_text(TWITTER_TAB_ID, 35, tweetText)
 *    - mcp__browseros__browser_click_element(TWITTER_TAB_ID, 52) // Post button
 * 4. 保存記錄
 */

async function main() {
  log('=== Twitter Curator (Claude) Started ===');

  try {
    // 1. 檢查每日限制
    const limits = checkDailyLimits();
    log(`Daily stats: ${limits.stats.posts} posts, ${limits.stats.replies} replies`);

    if (!limits.canPost) {
      log('Daily post limit reached, skipping...');
      return;
    }

    // 2. 載入 Persona
    const persona = loadPersona();
    if (!persona) {
      log('Cannot run without persona', 'ERROR');
      return;
    }

    // 3. 生成推文
    log('Generating tweet with Gemini...');
    const topic = selectRandomTopic(config.TOPICS);
    log(`Selected topic: ${topic}`);

    const tweetText = await generateOriginalTweet(persona, topic, config.GEMINI_API_KEY);

    if (!tweetText) {
      log('Failed to generate tweet', 'ERROR');
      return;
    }

    log(`Generated: "${tweetText.substring(0, 50)}..."`);

    // 4. 輸出執行指令（供 Claude 手動執行）
    console.log('\n' + '='.repeat(60));
    console.log('📋 CLAUDE EXECUTION REQUIRED');
    console.log('='.repeat(60));
    console.log('\nPlease execute the following BrowserOS MCP operations:\n');
    console.log(`1. Switch to Twitter tab:`);
    console.log(`   mcp__browseros__browser_switch_tab(${TWITTER_TAB_ID})\n`);
    console.log(`2. Type tweet:`);
    console.log(`   mcp__browseros__browser_type_text(${TWITTER_TAB_ID}, 35, "${tweetText}")\n`);

    if (!config.DRY_RUN) {
      console.log(`3. Click Post button:`);
      console.log(`   mcp__browseros__browser_click_element(${TWITTER_TAB_ID}, 52)\n`);
    } else {
      console.log(`3. [DRY RUN] Skip posting\n`);
    }

    console.log('='.repeat(60));
    console.log('\n✅ After executing above, run: node twitter-curator-claude.js --save-record\n');

    // 5. 如果是保存記錄模式
    if (process.argv.includes('--save-record')) {
      const postedTweets = loadJSON(config.PATHS.posted_tweets);
      postedTweets.push({
        text: tweetText,
        timestamp: new Date().toISOString(),
        url: null
      });
      saveJSON(config.PATHS.posted_tweets, postedTweets);
      updateDailyStats('post');
      log('✅ Record saved');
    }

  } catch (error) {
    log(`Error: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
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
