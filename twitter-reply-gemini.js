#!/usr/bin/env node

/**
 * Twitter Reply Automation with Gemini
 * 使用 Gemini 2.5 Flash 自動生成 Twitter 回覆
 *
 * 特點:
 * - 快速回應 (Flash model)
 * - Persona-driven replies
 * - 避免垃圾/spam 回覆
 */

const fs = require('fs');
const path = require('path');
const geminiClient = require('../Iris/scripts/lib/gemini-client');
const config = require('./config');

// 配置
const REPLY_CONFIG = {
  MAX_REPLIES_PER_HOUR: 5,
  MIN_ENGAGEMENT_THRESHOLD: 10, // 最少 likes/retweets 才回
  AVOID_KEYWORDS: ['crypto', 'nft', 'win', 'giveaway', 'follow back'],
  FOCUS_KEYWORDS: ['ai', 'llm', 'privacy', 'productivity', 'on-premise', 'irisgo', 'white collar']
};

/**
 * 載入 Persona
 */
function loadPersona() {
  try {
    if (fs.existsSync(config.PERSONA_FILE)) {
      return fs.readFileSync(config.PERSONA_FILE, 'utf-8');
    }
  } catch (error) {
    console.error(`Error loading persona: ${error.message}`);
  }
  return null;
}

/**
 * 判斷是否應該回覆這則推文
 */
function shouldReplyTo(mention) {
  const text = (mention.text || '').toLowerCase();

  // 避免垃圾內容
  if (REPLY_CONFIG.AVOID_KEYWORDS.some(kw => text.includes(kw))) {
    return { should: false, reason: 'Contains spam keywords' };
  }

  // 檢查互動量
  const engagement = (mention.likes || 0) + (mention.retweets || 0);
  if (engagement < REPLY_CONFIG.MIN_ENGAGEMENT_THRESHOLD) {
    return { should: false, reason: 'Low engagement' };
  }

  // 優先回覆相關主題
  const isRelevant = REPLY_CONFIG.FOCUS_KEYWORDS.some(kw => text.includes(kw));
  if (isRelevant) {
    return { should: true, reason: 'Relevant topic' };
  }

  return { should: true, reason: 'General mention' };
}

/**
 * 使用 Gemini 生成回覆
 */
async function generateReply(mention, persona) {
  const prompt = `You are Lman, responding to a Twitter mention. Generate a thoughtful, concise reply.

MENTION:
@${mention.username}: ${mention.text}

YOUR PERSONA:
${persona}

GUIDELINES:
1. Keep it under 280 characters
2. Be professional but approachable
3. Add value (insight, question, or encouragement)
4. Don't be promotional unless directly asked
5. Match the tone of the original tweet
6. Use Traditional Chinese OR English based on the mention language

Generate ONLY the reply text, no explanations.`;

  try {
    const response = await geminiClient.generateContent(prompt, {
      model: 'gemini-2.5-flash',
      temperature: 0.8, // 較高溫度讓回覆更自然
      maxOutputTokens: 100
    });

    // 確保不超過 280 字元
    let reply = response.trim();
    if (reply.length > 280) {
      reply = reply.substring(0, 277) + '...';
    }

    return reply;
  } catch (error) {
    console.error(`Reply generation error: ${error.message}`);
    throw error;
  }
}

/**
 * 載入/保存回覆記錄
 */
function loadReplies() {
  const repliesPath = path.join(__dirname, 'twitter-replies.json');
  try {
    if (fs.existsSync(repliesPath)) {
      return JSON.parse(fs.readFileSync(repliesPath, 'utf-8'));
    }
  } catch (error) {
    console.error(`Error loading replies: ${error.message}`);
  }
  return [];
}

function saveReply(mention, reply) {
  const repliesPath = path.join(__dirname, 'twitter-replies.json');
  const replies = loadReplies();

  replies.push({
    mentionId: mention.id,
    mentionText: mention.text,
    username: mention.username,
    reply: reply,
    timestamp: new Date().toISOString(),
    model: 'gemini-2.5-flash'
  });

  fs.writeFileSync(repliesPath, JSON.stringify(replies, null, 2));
}

/**
 * 檢查每小時限制
 */
function checkHourlyLimit() {
  const replies = loadReplies();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentReplies = replies.filter(r =>
    new Date(r.timestamp) > oneHourAgo
  );

  return {
    canReply: recentReplies.length < REPLY_CONFIG.MAX_REPLIES_PER_HOUR,
    count: recentReplies.length,
    limit: REPLY_CONFIG.MAX_REPLIES_PER_HOUR
  };
}

/**
 * 主函數
 */
async function main() {
  console.log('=== Twitter Reply Automation (Gemini) ===\n');

  try {
    // 1. 檢查限制
    const limit = checkHourlyLimit();
    console.log(`Hourly replies: ${limit.count}/${limit.limit}`);

    if (!limit.canReply) {
      console.log('⏸️  Hourly limit reached, skipping...');
      return;
    }

    // 2. 載入 Persona
    const persona = loadPersona();
    if (!persona) {
      throw new Error('Cannot run without persona');
    }

    // 3. 獲取 mentions (這裡需要整合 Twitter API 或 BrowserOS)
    console.log('\n⚠️  Note: Twitter API integration needed');
    console.log('Current implementation generates replies for provided mentions\n');

    // 範例 mention (實際使用需從 Twitter API 獲取)
    const mockMention = {
      id: '123456',
      username: 'example_user',
      text: 'What do you think about on-premise AI solutions?',
      likes: 15,
      retweets: 3
    };

    // 4. 判斷是否回覆
    const decision = shouldReplyTo(mockMention);
    console.log(`Should reply: ${decision.should} (${decision.reason})`);

    if (!decision.should) {
      return;
    }

    // 5. 生成回覆
    console.log('\nGenerating reply with Gemini...');
    const reply = await generateReply(mockMention, persona);

    console.log('\n' + '='.repeat(70));
    console.log('Generated Reply:');
    console.log('='.repeat(70));
    console.log(reply);
    console.log('='.repeat(70));
    console.log(`\nLength: ${reply.length}/280 characters`);

    // 6. 保存記錄
    if (process.argv.includes('--save')) {
      saveReply(mockMention, reply);
      console.log('\n✅ Reply saved to twitter-replies.json');
    }

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

// CLI
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  generateReply,
  shouldReplyTo,
  checkHourlyLimit
};
