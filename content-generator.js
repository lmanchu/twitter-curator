#!/usr/bin/env node

/**
 * Content Generator for Twitter Curator
 * 使用 Gemini AI 生成符合 Persona 的推文和回覆
 */

require('dotenv').config();

const { execSync } = require('child_process');
const fs = require('fs');

/**
 * 從 Persona 提取關鍵信息
 */
function extractPersonaSummary(personaContent) {
  const lines = personaContent.split('\n');
  const keySection = [];

  let capturing = false;
  for (const line of lines) {
    if (line.includes('核心定位') ||
        line.includes('職業角色') ||
        line.includes('## 🧠 思維模式') ||
        line.includes('## 💡 核心價值觀') ||
        line.includes('## 🎯 當前焦點')) {
      capturing = true;
    }
    if ((line.includes('## 📊 工作模式') ||
         line.includes('## 🛠️ 常用工具') ||
         line.includes('## 📈 DayFlow Intelligence')) && keySection.length > 0) {
      break;
    }
    if (capturing) {
      keySection.push(line);
    }
  }

  return keySection.join('\n').substring(0, 2000);
}

/**
 * 使用 Gemini 生成原創推文
 */
async function generateOriginalTweet(persona, topic, apiKey) {
  const personaSummary = extractPersonaSummary(persona);

  const prompt = `You are Lman, creating an original tweet. Context about Lman:

${personaSummary}

Topic area: ${topic}

Create an authentic, insightful tweet (max 280 chars) that:
1. Shares a unique insight or perspective from Lman's experience
2. May use historical analogies or builder's perspective
3. Is conversational and human (not AI-sounding)
4. NO hashtags, minimal emojis
5. MUST be in English
6. Could ask a thought-provoking question or share a learning
7. Reflects practical idealism and long-term thinking

Tweet (just the text):`;

  try {
    const response = await callGeminiAPI(prompt, apiKey);
    return cleanContent(response);
  } catch (error) {
    console.error('Error generating tweet:', error.message);
    return null;
  }
}

/**
 * 使用 Gemini 生成推文回覆
 */
async function generateReply(tweetText, tweetAuthor, persona, apiKey) {
  const personaSummary = extractPersonaSummary(persona);

  const prompt = `You are Lman, responding to a tweet. Context about Lman:

${personaSummary}

Tweet from @${tweetAuthor}:
"${tweetText}"

Generate an authentic, concise response (1-2 sentences, max 280 chars) that:
1. Matches Lman's expertise and voice (technical but friendly, practical yet idealistic)
2. Adds value (insight, question, or builds on the idea)
3. MUST be in English only
4. NO hashtags, minimal emojis, sounds human not AI
5. Is conversational, not formal
6. May use historical analogies or builder perspective when relevant

Response (just the text):`;

  try {
    const response = await callGeminiAPI(prompt, apiKey);
    return cleanContent(response);
  } catch (error) {
    console.error('Error generating reply:', error.message);
    return null;
  }
}

/**
 * 調用 Gemini API
 */
async function callGeminiAPI(prompt, apiKey) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  const payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 300,
      topP: 0.9,
    }
  };

  const command = `curl -s -X POST '${url}?key=${apiKey}' \
    -H 'Content-Type: application/json' \
    -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}'`;

  const response = execSync(command, { encoding: 'utf-8' });
  const data = JSON.parse(response);

  if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }

  throw new Error('Invalid Gemini API response');
}

/**
 * 清理生成的內容
 */
function cleanContent(content) {
  return content
    .replace(/^["']|["']$/g, '')     // 移除引號
    .replace(/\n+/g, ' ')            // 換行轉空格
    .replace(/\s+/g, ' ')            // 合併空格
    .trim()
    .substring(0, 280);               // Twitter 限制
}

/**
 * 隨機選擇主題
 */
function selectRandomTopic(topics) {
  return topics[Math.floor(Math.random() * topics.length)];
}

module.exports = {
  generateOriginalTweet,
  generateReply,
  selectRandomTopic,
  extractPersonaSummary
};

// CLI 測試
if (require.main === module) {
  const config = require('./config');
  const persona = fs.readFileSync(config.PERSONA_FILE, 'utf-8');
  const topic = selectRandomTopic(config.TOPICS);

  console.log('🧪 Testing content generation...\n');
  console.log(`Selected topic: ${topic}\n`);

  generateOriginalTweet(persona, topic, config.GEMINI_API_KEY).then(tweet => {
    console.log('✅ Generated tweet:');
    console.log(`"${tweet}"\n`);
    console.log(`Length: ${tweet.length} characters`);
  }).catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}
