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

  // 從 Medium 寫作風格分析中提取的推文 hooks
  const hooks = [
    'Have you ever wondered...',
    'Everyone says X, but actually...',
    'From what I\'ve observed over the years...',
    'What we\'ll see next is...',
    'The real question is...',
    'Here\'s what most people miss...'
  ];
  const randomHook = hooks[Math.floor(Math.random() * hooks.length)];

  // 從 204 篇文章分析得出的寫作風格指導
  const styleGuide = `
Lman's Voice (based on 204 Medium articles, 2015-2025):
- Direct, no-nonsense communication
- Focus on practical insights over theory
- Critical thinking, challenge mainstream views
- Share first-hand experience from startup journey
- Connect technology with business value
- Pragmatic + idealistic mindset

Example phrases:
- "Blockchain solves trust problems, not technical problems"
- "Innovation's biggest enemy isn't failure, it's organizational inertia"
- "AI landing isn't about computing power, it's about scenario understanding"
`;

  const prompt = `Write a tweet as Lman (Tech Entrepreneur, Blockchain & AI Thought Leader, IrisGo.AI CoFounder).

${styleGuide}

Topic: ${topic}
Hook template: ${randomHook}

Requirements:
- Max 280 characters
- English only
- NO hashtags, minimal emojis
- Direct and authentic tone
- Business insight + technical depth
- Challenge common assumptions when relevant
- Share actionable perspective

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
 * 調用本地 Ollama API (gpt-oss:20b with fallback)
 */
async function callGeminiAPI(prompt, apiKey) {
  const url = 'http://localhost:11434/api/generate';

  // 模型列表：優先使用 gpt-oss:20b，失敗時 fallback 到 qwen3:32b
  const models = ['gpt-oss:20b', 'qwen3:32b'];

  for (const model of models) {
    try {
      const payload = {
        model: model,
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

      const response = execSync(command, { encoding: 'utf-8', timeout: 60000 });
      const data = JSON.parse(response);

      // gpt-oss model puts content in 'thinking' field
      if (data.thinking) {
        console.log(`[INFO] Using model: ${model}`);
        return data.thinking;
      } else if (data.response) {
        console.log(`[INFO] Using model: ${model}`);
        return data.response;
      }

      // 如果沒有有效響應，嘗試下一個模型
      throw new Error('No valid response from model');

    } catch (error) {
      console.log(`[WARN] Model ${model} failed: ${error.message}, trying next...`);
      // 繼續嘗試下一個模型
      continue;
    }
  }

  throw new Error('All Ollama models failed');
}

/**
 * 清理生成的內容 (從 Ollama thinking 中提取實際推文)
 */
function cleanContent(content) {
  console.log(`[DEBUG] Cleaning content, length: ${content.length}`);

  // 嘗試提取所有引號中的內容
  const allQuotes = content.match(/"([^"]+)"/g);

  if (allQuotes && allQuotes.length > 0) {
    // 過濾掉包含 prompt 關鍵字的引號
    const promptKeywords = ['Topic:', 'Requirements:', 'Output ONLY', 'Max 280', 'Style:', 'Write a tweet', 'CoFounder at'];

    const validQuotes = allQuotes
      .map(q => q.replace(/"/g, '').trim())
      .filter(q => {
        // 排除太短的（<20 字符）
        if (q.length < 20) return false;
        // 排除包含 prompt 關鍵字的
        if (promptKeywords.some(kw => q.includes(kw))) return false;
        return true;
      });

    if (validQuotes.length > 0) {
      // 選擇最長的有效內容
      const longest = validQuotes.reduce((a, b) => a.length > b.length ? a : b);
      const cleaned = longest
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 280);

      console.log(`[INFO] Extracted tweet: ${cleaned.substring(0, 100)}...`);
      return cleaned;
    }
  }

  // Fallback: 直接清理原始內容
  console.log('[WARN] No quoted content found, using fallback cleaning');
  const cleaned = content
    .replace(/^["']|["']$/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 280);

  // 如果 fallback 內容包含太多 prompt 關鍵字，返回 null
  const promptKeywords = ['Topic:', 'Requirements:', 'Output ONLY', 'Max 280'];
  const keywordCount = promptKeywords.filter(kw => cleaned.includes(kw)).length;

  if (keywordCount >= 2) {
    console.log('[ERROR] Could not extract clean tweet from model output');
    return null;
  }

  return cleaned;
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
