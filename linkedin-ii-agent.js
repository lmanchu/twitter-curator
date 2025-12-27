#!/usr/bin/env node

const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { loadPersona, generateLinkedInPost, selectRandomTopic } = require('./linkedin-content-generator');

// Configuration
const PERSONA_FILE = '/Users/lman/Dropbox/PKM-Vault/0-Inbox/Lman-Deep-Persona-Profile.md';
const GEMINI_API_KEY = 'AIzaSyB-I9pj22bPopvBy1VwKVo7fbsr4OU2cLk'; // User's PRO API
const II_AGENT_WS = 'ws://localhost:8000/ws';
const POSTED_FILE = path.join(__dirname, 'posted-linkedin.json');
const DAILY_STATS_FILE = path.join(__dirname, 'daily-linkedin-stats.json');
const LOG_FILE = path.join(__dirname, 'linkedin-ii-agent.log');

const DAILY_LIMITS = {
  max_posts: 2  // LinkedIn is better with fewer, higher-quality posts
};

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFile(LOG_FILE, logMessage + '\n').catch(err => console.error('Log write error:', err));
}

async function loadPostedPosts() {
  try {
    const data = await fs.readFile(POSTED_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

async function savePostedPost(post) {
  const posted = await loadPostedPosts();
  posted.push({
    content: post,
    timestamp: new Date().toISOString(),
    platform: 'linkedin'
  });
  await fs.writeFile(POSTED_FILE, JSON.stringify(posted, null, 2));
  log('Saved to posted-linkedin.json');
}

async function updateDailyStats() {
  const today = new Date().toISOString().split('T')[0];

  let stats = {};
  try {
    const data = await fs.readFile(DAILY_STATS_FILE, 'utf-8');
    stats = JSON.parse(data);
  } catch (error) {
    stats = {};
  }

  if (!stats[today]) {
    stats[today] = { posts: 0 };
  }

  stats[today].posts += 1;

  await fs.writeFile(DAILY_STATS_FILE, JSON.stringify(stats, null, 2));
  log(`Daily stats updated: ${stats[today].posts} posts today`);

  return stats[today];
}

async function checkDailyLimits() {
  const today = new Date().toISOString().split('T')[0];

  try {
    const data = await fs.readFile(DAILY_STATS_FILE, 'utf-8');
    const stats = JSON.parse(data);

    if (stats[today] && stats[today].posts >= DAILY_LIMITS.max_posts) {
      log(`Daily limit reached: ${stats[today].posts}/${DAILY_LIMITS.max_posts} posts`);
      return false;
    }
  } catch (error) {
    // File doesn't exist, proceed
  }

  return true;
}

async function postToLinkedInWithIIAgent(postText) {
  return new Promise((resolve, reject) => {
    log('Connecting to ii-agent...');
    const ws = new WebSocket(II_AGENT_WS);
    let timeout;

    ws.on('open', () => {
      log('Connected to ii-agent WebSocket');

      // Initialize agent with Gemini 2.5 Pro
      const initMessage = {
        type: 'init_agent',
        content: {
          model_name: 'gemini/gemini-2.5-pro',
          thinking_tokens: false,
          tool_args: {}
        }
      };

      ws.send(JSON.stringify(initMessage));
      log('Sent agent initialization');

      // Set timeout for the entire operation (5 minutes)
      timeout = setTimeout(() => {
        log('Operation timeout - closing connection');
        ws.close();
        reject(new Error('Operation timeout'));
      }, 300000);
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      log(`Received: ${message.type}`);

      if (message.type === 'agent_initialized') {
        log('Agent initialized, sending LinkedIn post task');

        // Task: Post to LinkedIn using browser automation
        const taskMessage = {
          type: 'query',
          content: {
            text: `Please help me post on LinkedIn using browser automation.

Steps:
1. Navigate to https://www.linkedin.com/feed/
2. Find the "Start a post" button or compose area
3. Click on it to open the post composer
4. Type the following post content:
"""
${postText}
"""
5. Find and click the "Post" button
6. Confirm the post was successfully published

Please execute these steps and confirm when done.`,
            resume: false,
            files: []
          }
        };

        ws.send(JSON.stringify(taskMessage));
        log('Sent LinkedIn post task');
      }

      if (message.type === 'stream_complete' || message.type === 'agent_response') {
        log('Post completed successfully');
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      }

      if (message.type === 'error') {
        log(`Error from agent: ${JSON.stringify(message)}`);
        clearTimeout(timeout);
        ws.close();
        reject(new Error(message.content || 'Unknown error'));
      }
    });

    ws.on('error', (error) => {
      log(`WebSocket error: ${error.message}`);
      clearTimeout(timeout);
      reject(error);
    });

    ws.on('close', () => {
      log('WebSocket connection closed');
      clearTimeout(timeout);
    });
  });
}

async function main() {
  try {
    log('=== LinkedIn Automation Started ===');

    // Check daily limits
    const canPost = await checkDailyLimits();
    if (!canPost) {
      log('Daily posting limit reached. Exiting.');
      process.exit(0);
    }

    // Load persona
    log('Loading persona...');
    const persona = await loadPersona(PERSONA_FILE);
    if (!persona) {
      throw new Error('Failed to load persona');
    }
    log('Persona loaded successfully');

    // Generate post
    const topic = selectRandomTopic();
    log(`Selected topic: ${topic}`);

    log('Generating LinkedIn post with Gemini PRO...');
    const postContent = await generateLinkedInPost(persona, topic, GEMINI_API_KEY);
    log(`Generated post (${postContent.length} chars):\n${postContent}`);

    // Post to LinkedIn via ii-agent
    log('Posting to LinkedIn via ii-agent...');
    await postToLinkedInWithIIAgent(postContent);
    log('Successfully posted to LinkedIn!');

    // Save records
    await savePostedPost(postContent);
    const stats = await updateDailyStats();

    log(`=== Success! Posted ${stats.posts}/${DAILY_LIMITS.max_posts} posts today ===`);
    process.exit(0);

  } catch (error) {
    log(`ERROR: ${error.message}`);
    log(error.stack);
    process.exit(1);
  }
}

main();
