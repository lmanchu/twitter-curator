#!/usr/bin/env node

/**
 * LinkedIn Curator - BrowserOS Version
 *
 * 由 Claude Code 執行，使用 BrowserOS MCP 工具
 *
 * LinkedIn 與 Twitter 的差異：
 * - 較正式、專業的語調
 * - 可以較長（最多 3000 字元）
 * - 主題聚焦：AI 應用、隱私技術、企業解決方案
 * - 可使用繁體中文或英文
 */

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { generateOriginalTweet, selectRandomTopic } = require('./content-generator');
const factChecker = require('../Iris/scripts/social-media/linkedin-fact-checker');
const crossValidator = require('./linkedin-fact-checker-cross-validate');

// LinkedIn 專屬配置
const LINKEDIN_CONFIG = {
  MAX_LENGTH: 3000,
  POSTS_PER_DAY: 4,
  COMMENTS_PER_DAY: 4,
  TOPICS: [
    'AI/LLM for Personal Productivity',
    'Privacy-First Technology',
    'On-Premise AI Solutions',
    'IrisGo.AI Platform',
    'Building Personal AI Assistants',
    'Edge Computing & Privacy',
    'AI for Knowledge Workers'
  ],
  LANGUAGE: 'mixed'  // Can use both English and Traditional Chinese
};

// 日誌函數
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [LINKEDIN] [${level}] ${message}`;
  console.log(logMessage);

  try {
    const logPath = path.join(__dirname, 'linkedin-curator.log');
    fs.appendFileSync(logPath, logMessage + '\n');
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

// 載入 Persona（專業版本）
function loadPersona() {
  try {
    if (fs.existsSync(config.PERSONA_FILE)) {
      const persona = fs.readFileSync(config.PERSONA_FILE, 'utf-8');

      // Add LinkedIn-specific context
      return persona + `\n\n---
PLATFORM CONTEXT: LinkedIn
- Tone: Professional, insightful, thoughtful
- Length: Can be longer (up to 3000 characters)
- Topics: Focus on AI applications, privacy technology, productivity solutions
- Language: Can use Traditional Chinese or English based on topic
- Style: Share professional insights, technical depth welcome
`;
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
  const statsPath = path.join(__dirname, 'linkedin-daily-stats.json');
  const stats = loadJSON(statsPath);

  const todayStats = stats.find(s => s.date === today) || {
    date: today,
    posts: 0,
    comments: 0
  };

  return {
    canPost: todayStats.posts < LINKEDIN_CONFIG.POSTS_PER_DAY,
    canComment: todayStats.comments < LINKEDIN_CONFIG.COMMENTS_PER_DAY,
    stats: todayStats
  };
}

// 更新每日統計
function updateDailyStats(type) {
  const today = new Date().toISOString().split('T')[0];
  const statsPath = path.join(__dirname, 'linkedin-daily-stats.json');
  let stats = loadJSON(statsPath);

  let todayStats = stats.find(s => s.date === today);
  if (!todayStats) {
    todayStats = { date: today, posts: 0, comments: 0 };
    stats.push(todayStats);
  }

  if (type === 'post') {
    todayStats.posts++;
  } else if (type === 'comment') {
    todayStats.comments++;
  }

  // Keep only last 30 days
  stats = stats.filter(s => {
    const date = new Date(s.date);
    const daysDiff = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff <= 30;
  });

  saveJSON(statsPath, stats);
}

// 生成 LinkedIn 內容（使用交叉驗證系統）
async function generateLinkedInPost(persona, topic) {
  try {
    // 檢查是否啟用交叉驗證（預設啟用）
    const useCrossValidation = process.env.LINKEDIN_CROSS_VALIDATE !== 'false';

    if (useCrossValidation) {
      log('Using cross-validation system (Gemini + Ollama)...');

      // Build context from persona and topic
      const context = {
        platform: 'LinkedIn',
        topic: topic,
        tone: 'Professional, insightful, thoughtful',
        maxLength: LINKEDIN_CONFIG.MAX_LENGTH,
        language: 'mixed'
      };

      // Use cross-validation system
      const result = await crossValidator.generateWithCrossValidation(topic, context);

      if (!result || !result.success || !result.finalPost) {
        log('Cross-validation failed to generate content', 'ERROR');
        return null;
      }

      // Log cross-validation results
      log(`Cross-validation complete`);
      log(`  - Gemini Score: ${result.validation.geminiScore}/100`);
      log(`  - Ollama Score: ${result.validation.ollamaScore}/100`);
      log(`  - Final Score: ${result.validation.finalScore}/100`);
      log(`  - Consensus: ${result.validation.consensus ? 'YES' : 'NO'}`);
      log(`  - Requires review: ${result.validation.requiresHumanReview ? 'YES' : 'NO'}`);

      // If requires review, save for manual approval
      if (result.validation.requiresHumanReview) {
        const reviewPath = path.join(__dirname, 'linkedin-review-needed.json');
        const reviews = loadJSON(reviewPath);
        reviews.push({
          timestamp: new Date().toISOString(),
          topic: topic,
          finalPost: result.finalPost,
          validation: result.validation,
          geminiScore: result.validation.geminiScore,
          ollamaScore: result.validation.ollamaScore,
          discrepancies: result.validation.discrepancies
        });
        saveJSON(reviewPath, reviews);
        log('⚠️  Content saved for review (validation concerns)', 'WARN');
      }

      let content = result.finalPost;

      // Validate length
      if (content.length > LINKEDIN_CONFIG.MAX_LENGTH) {
        content = content.substring(0, LINKEDIN_CONFIG.MAX_LENGTH - 3) + '...';
        log('Content truncated to max length', 'WARN');
      }

      return content;

    } else {
      // Fallback to single fact-checker (Gemini only)
      log('Using single fact-checking system (Gemini only)...');

      const context = {
        platform: 'LinkedIn',
        topic: topic,
        tone: 'Professional, insightful, thoughtful',
        maxLength: LINKEDIN_CONFIG.MAX_LENGTH,
        language: 'mixed'
      };

      const result = await factChecker.generateLinkedInPost(topic, context);

      if (!result || !result.finalPost) {
        log('Fact-checker failed to generate content', 'ERROR');
        return null;
      }

      log(`Fact-check status: ${result.status}`);
      if (result.factCheck) {
        log(`Fact-check score: ${result.factCheck.overallScore}/100`);
        log(`Requires review: ${result.requiresReview ? 'YES' : 'NO'}`);
      }

      if (result.requiresReview) {
        const reviewPath = path.join(__dirname, 'linkedin-review-needed.json');
        const reviews = loadJSON(reviewPath);
        reviews.push({
          timestamp: new Date().toISOString(),
          topic: topic,
          draft: result.draft || null,
          factCheck: result.factCheck || null,
          finalPost: result.finalPost,
          status: result.status
        });
        saveJSON(reviewPath, reviews);
        log('⚠️  Content saved for review (low fact-check score)', 'WARN');
      }

      let content = result.finalPost;

      if (content.length > LINKEDIN_CONFIG.MAX_LENGTH) {
        content = content.substring(0, LINKEDIN_CONFIG.MAX_LENGTH - 3) + '...';
        log('Content truncated to max length', 'WARN');
      }

      return content;
    }
  } catch (error) {
    log(`Content generation error: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
    return null;
  }
}

async function main() {
  log('=== LinkedIn Curator (BrowserOS) Started ===');

  try {
    // 1. 檢查每日限制
    const limits = checkDailyLimits();
    log(`Daily stats: ${limits.stats.posts} posts, ${limits.stats.comments} comments`);

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

    // 3. 生成 LinkedIn 內容
    log('Generating LinkedIn post with Gemini...');
    const topic = selectRandomTopic(LINKEDIN_CONFIG.TOPICS);
    log(`Selected topic: ${topic}`);

    const postContent = await generateLinkedInPost(persona, topic);

    if (!postContent) {
      log('Failed to generate LinkedIn post', 'ERROR');
      return;
    }

    log(`Generated post (${postContent.length} chars)`);
    log(`Preview: "${postContent.substring(0, 100)}..."`);

    // 4. 輸出執行指令
    console.log('\n' + '='.repeat(70));
    console.log('📋 CLAUDE EXECUTION REQUIRED - LinkedIn Post');
    console.log('='.repeat(70));
    console.log('\nGenerated content:\n');
    console.log('---');
    console.log(postContent);
    console.log('---');
    console.log('\n請使用 BrowserOS MCP 執行以下操作：\n');
    console.log('1. List tabs to find LinkedIn:');
    console.log('   mcp__browseros__browser_list_tabs\n');
    console.log('2. Switch to LinkedIn tab (use tab ID from step 1)');
    console.log('3. Click "Start a post" button (find node ID)');
    console.log('4. Type the post content (use node ID from step 3)');
    console.log('5. Click "Post" button');
    console.log('\n' + '='.repeat(70));

    // 5. 如果是保存記錄模式
    if (process.argv.includes('--save-record')) {
      const postsPath = path.join(__dirname, 'linkedin-posted.json');
      const posts = loadJSON(postsPath);
      posts.push({
        text: postContent,
        timestamp: new Date().toISOString(),
        url: null,
        topic: topic
      });
      saveJSON(postsPath, posts);
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
