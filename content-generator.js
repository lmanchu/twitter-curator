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
 * 使用 Ollama 生成原創推文
 */
async function generateOriginalTweet(persona, topic, apiKey) {
  const personaSummary = extractPersonaSummary(persona);

  const prompt = `Write a tweet as Lman (CoFounder at IrisGo.AI, early-stage startup builder).

Topic: ${topic}

Requirements:
- Max 280 characters
- English only
- No hashtags
- Conversational, human tone
- Share insight from builder perspective

Output ONLY the tweet text, nothing else:`;

  try {
    const response = await callGeminiAPI(prompt, apiKey);
    return cleanContent(response);
  } catch (error) {
    console.error('Error generating tweet:', error.message);
    return null;
  }
}

/**
 * 使用 Ollama 生成推文回覆
 */
async function generateReply(tweetText, tweetAuthor, persona, apiKey) {
  const prompt = `Reply to this tweet as Lman (startup builder, AI/tech expert):

@${tweetAuthor}: "${tweetText}"

Requirements:
- Max 280 characters
- English only
- No hashtags
- Conversational, add value
- Technical but friendly

Output ONLY the reply text:`;

  try {
    const response = await callGeminiAPI(prompt, apiKey);
    return cleanContent(response);
  } catch (error) {
    console.error('Error generating reply:', error.message);
    return null;
  }
}

/**
 * 調用本地 Ollama API (gpt-oss:20b)
 */
async function callGeminiAPI(prompt, apiKey) {
  const url = 'http://localhost:11434/api/generate';

  const payload = {
    model: 'gpt-oss:20b',
    prompt: prompt,
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 200,
      top_p: 0.9,
    }
  };

  const command = `curl -s -X POST '${url}' \
    -H 'Content-Type: application/json' \
    -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}'`;

  const response = execSync(command, { encoding: 'utf-8' });
  const data = JSON.parse(response);

  // gpt-oss model puts content in 'thinking' field
  if (data.thinking) {
    return data.thinking;
  } else if (data.response) {
    return data.response;
  }

  throw new Error('Invalid Ollama API response');
}

/**
 * 清理生成的內容 (從 Ollama thinking 中提取實際推文)
 */
function cleanContent(content) {
  // Try to extract quoted content from Ollama's thinking
  const quoteMatch = content.match(/"([^"]{20,280})"/);
  if (quoteMatch && quoteMatch[1]) {
    return quoteMatch[1]
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 280);
  }

  // Fallback: clean the raw content
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
