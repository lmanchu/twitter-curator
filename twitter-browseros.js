#!/usr/bin/env node

/**
 * Twitter Curator - BrowserOS Full Automation
 *
 * 使用 BrowserOS MCP（真實瀏覽器）完全自動化
 * 不會被 Twitter 偵測為機器人
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { generateOriginalTweet, selectRandomTopic } = require('./content-generator');

// Twitter Tab ID (在 BrowserOS 中)
const TWITTER_TAB_ID = 519391672;

// Paths
const POSTED_TWEETS = path.join(__dirname, 'posted-tweets.json');
const DAILY_STATS = path.join(__dirname, 'daily-stats.json');
const LOG_FILE = path.join(__dirname, 'twitter-browseros.log');

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

async function main() {
  log('=== Twitter Curator (BrowserOS) Started ===');

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

    log(`Generated tweet (${tweetText.length} chars): "${tweetText}"`);

    // 4. Output instructions for Claude to execute via BrowserOS MCP
    console.log('\n' + '='.repeat(70));
    console.log('📋 CLAUDE: 請使用 BrowserOS MCP 執行以下操作');
    console.log('='.repeat(70));
    console.log('\n生成的推文內容：');
    console.log('---');
    console.log(tweetText);
    console.log('---');
    console.log('\n請執行：');
    console.log('1. mcp__browseros__browser_switch_tab(519391672)');
    console.log('2. mcp__browseros__browser_execute_javascript - 使用 InputEvent 模擬真實輸入');
    console.log('3. mcp__browseros__browser_click_element - 點擊 Post 按鈕');
    console.log('\n' + '='.repeat(70));

    // Save tweet text to temp file for Claude to read
    const tempFile = path.join(__dirname, 'current-tweet.txt');
    fs.writeFileSync(tempFile, tweetText);
    log(`Tweet text saved to: ${tempFile}`);

    // 5. Save record (Claude will call this with --save-record after posting)
    if (process.argv.includes('--save-record')) {
      const tweets = loadJSON(POSTED_TWEETS);
      tweets.push({
        text: tweetText,
        timestamp: new Date().toISOString(),
        url: null,
        method: 'browseros'
      });
      saveJSON(POSTED_TWEETS, tweets);
      updateDailyStats('post');
      log('✅ Record saved');
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
