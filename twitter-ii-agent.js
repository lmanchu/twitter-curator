#!/usr/bin/env node

/**
 * Twitter Curator - II-Agent Full Automation
 *
 * 使用 ii-agent 的瀏覽器自動化功能
 * ii-agent 已經在運行中，可以自動操作真實瀏覽器
 */

const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const config = require('./config');
const { generateOriginalTweet, selectRandomTopic } = require('./content-generator');

// II-Agent WebSocket endpoint
const II_AGENT_WS = 'ws://localhost:8000/ws';

// Paths
const POSTED_TWEETS = path.join(__dirname, 'posted-tweets.json');
const DAILY_STATS = path.join(__dirname, 'daily-stats.json');
const LOG_FILE = path.join(__dirname, 'twitter-ii-agent.log');

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

  if (type === 'post') todayStats.posts++;
  else if (type === 'reply') todayStats.replies++;

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

// Post tweet using ii-agent
async function postTweetWithIIAgent(tweetText) {
  return new Promise((resolve, reject) => {
    log('Connecting to ii-agent WebSocket...');

    const ws = new WebSocket(II_AGENT_WS);
    let taskComplete = false;
    const timeout = setTimeout(() => {
      if (!taskComplete) {
        log('Timeout waiting for ii-agent', 'ERROR');
        ws.close();
        reject(new Error('Timeout'));
      }
    }, 180000); // 3 minutes timeout

    ws.on('open', () => {
      log('✅ Connected to ii-agent');

      // Initialize agent
      const initMessage = {
        type: 'init_agent',
        content: {
          model_name: 'gemini/gemini-2.5-pro',
          thinking_tokens: false,
          tool_args: {}
        }
      };

      log('Sending init_agent message...');
      ws.send(JSON.stringify(initMessage));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        log(`Received: ${message.type}`);

        if (message.type === 'agent_initialized') {
          log('✅ Agent initialized, sending task...');

          // Send the task to post tweet
          const taskMessage = {
            type: 'query',
            content: {
              text: `Please help me post a tweet on Twitter using browser automation.

Steps:
1. Navigate to https://x.com/home (should already be open and logged in)
2. Find the tweet compose box (look for the "What's happening?" placeholder or data-testid="tweetTextarea_0")
3. Click on it to focus
4. Type the following text into the compose box:
"${tweetText.replace(/"/g, '\\"')}"

5. Find the "Post" button (usually blue, on the right side of the compose area, might have data-testid="tweetButtonInline" or similar)
6. Click the Post button to publish the tweet
7. Wait a moment to confirm the tweet was posted
8. Report back with confirmation

Important: This is a real Twitter account that's already logged in. Please use browser automation tools to complete this task.`,
              resume: false,
              files: []
            }
          };

          ws.send(JSON.stringify(taskMessage));
        }

        // Check for completion
        if (message.type === 'stream_complete' || message.type === 'agent_response') {
          taskComplete = true;
          clearTimeout(timeout);
          log('✅ Task completed!');
          ws.close();
          resolve(true);
        }

        // Check for errors
        if (message.type === 'error') {
          clearTimeout(timeout);
          log(`Error from ii-agent: ${JSON.stringify(message.content)}`, 'ERROR');
          ws.close();
          reject(new Error(message.content.message || 'Unknown error'));
        }

        // Log progress
        if (message.type === 'system' || message.type === 'thinking') {
          const content = message.content?.message || message.content?.text || '';
          if (content) {
            log(`ii-agent: ${content.substring(0, 200)}...`);
          }
        }

      } catch (error) {
        log(`Error parsing message: ${error.message}`, 'ERROR');
      }
    });

    ws.on('error', (error) => {
      clearTimeout(timeout);
      log(`WebSocket error: ${error.message}`, 'ERROR');
      reject(error);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      if (!taskComplete) {
        log('WebSocket closed before completion', 'WARN');
      }
    });
  });
}

async function main() {
  log('=== Twitter Curator (II-Agent) Started ===');

  try {
    // 1. Check daily limits
    const limits = checkDailyLimits();
    log(`Daily stats: ${limits.stats.posts} posts`);

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

    if (config.DRY_RUN) {
      log('[DRY RUN] Would post tweet now', 'WARN');
      return;
    }

    // 4. Post tweet using ii-agent
    log('Posting tweet via ii-agent...');
    const success = await postTweetWithIIAgent(tweetText);

    if (success) {
      // 5. Record the post
      const tweets = loadJSON(POSTED_TWEETS);
      tweets.push({
        text: tweetText,
        timestamp: new Date().toISOString(),
        url: null,
        method: 'ii-agent'
      });
      saveJSON(POSTED_TWEETS, tweets);
      updateDailyStats('post');

      log('✅ Tweet posted and recorded successfully!');
    }

  } catch (error) {
    log(`Error: ${error.message}`, 'ERROR');
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
