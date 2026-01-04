#!/usr/bin/env node

/**
 * Content Generator for Twitter Curator
 * 使用 Gemini AI 生成符合 Persona 的推文和回覆
 */

require('dotenv').config();

const { execSync } = require('child_process');
const fs = require('fs');
const localTracker = require('../bin/local-model-token-tracker.js');

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
- Write in BOTH English AND Traditional Chinese (雙語): English first, then Chinese translation on new line
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
 * 檢測不當內容 (NSFW/Spam)
 */
function isInappropriateContent(text) {
  const nsfwKeywords = [
    'sex', 'porn', 'xxx', 'nude', 'naked', 'pussy', 'dick', 'cock',
    'tesão', 'gostoso', 'delícia', 'rabeta', 'negão', 'esfrega',
    'onlyfans', 'nsfw', 'adult content'
  ];

  const spamKeywords = [
    'free money', 'click here', 'dm me', 'buy now', 'limited offer',
    'crypto giveaway', 'send me'
  ];

  const lowerText = text.toLowerCase();

  for (const keyword of [...nsfwKeywords, ...spamKeywords]) {
    if (lowerText.includes(keyword)) {
      console.log(`[FILTER] Inappropriate content detected: "${keyword}"`);
      return true;
    }
  }
  return false;
}

/**
 * 選擇加權 engagement hook 模式
 * @param {Object} weights - hook 模式權重 { question: 30, hot_take: 25, ... }
 * @returns {string} 選中的模式名稱
 */
function selectEngagementHook(weights) {
  const entries = Object.entries(weights);
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);

  let random = Math.random() * totalWeight;
  for (const [pattern, weight] of entries) {
    random -= weight;
    if (random <= 0) {
      return pattern;
    }
  }
  return entries[0][0]; // fallback
}

/**
 * 獲取 engagement hook 的 prompt 指導
 */
function getHookGuidance(hookPattern) {
  const guidance = {
    question: `End with a thought-provoking question that invites dialogue. Example: "Have you tried X?" or "What's been your experience with Y?"`,
    hot_take: `Share a contrarian or bold perspective that challenges common assumptions. Spark discussion with a strong (but respectful) opinion.`,
    personal_experience: `Share a brief, relevant anecdote from your startup journey at IrisGo or past experience. Make it personal and authentic.`,
    build_on: `Extend their point with additional insight. Start with "Adding to this..." or "This also connects to..." to build on the conversation.`
  };
  return guidance[hookPattern] || guidance.question;
}

/**
 * 使用 Ollama 生成推文回覆
 * 整合 Heavy Ranker 優化的 Engagement Hook 策略
 */
async function generateReply(tweetText, tweetAuthor, persona, apiKey, engagementHooks = null) {
  // 先檢查原推文是否為不當內容
  if (isInappropriateContent(tweetText)) {
    console.log(`[SKIP] Skipping reply to inappropriate content from @${tweetAuthor}`);
    return null;
  }

  // 選擇 engagement hook 模式
  let hookPattern = 'question';
  let hookGuidance = '';

  if (engagementHooks && engagementHooks.weights) {
    hookPattern = selectEngagementHook(engagementHooks.weights);
    hookGuidance = getHookGuidance(hookPattern);
    console.log(`[INFO] Using engagement hook: ${hookPattern}`);
  }

  // 避免的模式
  const avoidPatterns = engagementHooks?.avoid_patterns || [];
  const avoidGuidance = avoidPatterns.length > 0
    ? `\nAvoid these low-value patterns:\n- ${avoidPatterns.map(p => p.replace(/_/g, ' ')).join('\n- ')}`
    : '';

  const prompt = `You are Lman, a tech entrepreneur and AI expert. Write a reply to this tweet.

Tweet from @${tweetAuthor}: "${tweetText}"

Engagement Strategy (${hookPattern.replace(/_/g, ' ')}):
${hookGuidance}

Instructions:
- Write a helpful, insightful reply
- Max 280 characters
- Write in BOTH English AND Traditional Chinese (雙語): English first, then Chinese translation on new line
- Be conversational and add value
- Technical but friendly
- Make it invite further engagement (replies, likes)
- DO NOT paraphrase or repeat the original tweet content
- Provide a NEW perspective, question, or personal insight
- Your reply must be SUBSTANTIALLY DIFFERENT from the original tweet
${avoidGuidance}

Reply:`;

  try {
    const response = await callGeminiAPI(prompt, apiKey);
    const cleaned = cleanContent(response);

    // ✅ 如果 cleanContent 失敗，直接用 OpenAI 重試
    if (!cleaned || cleaned.length < 10) {
      console.log('[WARN] cleanContent failed, retrying with OpenAI directly...');
      const openaiReply = await callOpenAIDirect(prompt);
      if (openaiReply) {
        return openaiReply;
      }
    }

    return cleaned;
  } catch (error) {
    console.error('Error generating reply:', error.message);
    // ✅ 最後嘗試 OpenAI
    try {
      console.log('[WARN] Ollama failed, trying OpenAI as last resort...');
      const openaiReply = await callOpenAIDirect(prompt);
      return openaiReply;
    } catch (e) {
      console.error('OpenAI fallback also failed:', e.message);
      return null;
    }
  }
}

/**
 * 直接調用 OpenAI API (用於 content extraction 失敗時)
 */
async function callOpenAIDirect(prompt) {
  const openaiKey = 'process.env.OPENAI_API_KEY';
  const openaiPayload = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 200
  };

  const openaiCommand = `curl -s -X POST 'https://api.openai.com/v1/chat/completions' \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer ${openaiKey}' \
    -d '${JSON.stringify(openaiPayload).replace(/'/g, "'\\''")}'`;

  const openaiResponse = execSync(openaiCommand, { encoding: 'utf-8', timeout: 30000 });
  const openaiData = JSON.parse(openaiResponse);

  if (openaiData.choices && openaiData.choices[0]?.message?.content) {
    console.log('[INFO] ✅ Using OpenAI gpt-4o-mini (content extraction fallback)');
    return openaiData.choices[0].message.content.trim();
  }
  return null;
}

/**
 * 使用 Ollama 生成興趣導向回覆 (Anime/SciFi)
 * 以粉絲身份回覆，展現真實的個人興趣
 */
async function generateInterestReply(tweetText, tweetAuthor, persona, apiKey, interestConfig) {
  // 先檢查原推文是否為不當內容
  if (isInappropriateContent(tweetText)) {
    console.log(`[SKIP] Skipping reply to inappropriate content from @${tweetAuthor}`);
    return null;
  }

  const replyStyle = interestConfig.reply_style || {};
  const avoidList = (replyStyle.avoid || []).join(', ');
  const includeList = (replyStyle.include || []).join(', ');

  const prompt = `You are Lman, a tech entrepreneur who is also a passionate anime/scifi fan. Write a reply to this entertainment tweet.

Tweet from @${tweetAuthor}: "${tweetText}"

Instructions:
- Write as an enthusiastic fan, NOT as a tech expert
- Max 280 characters
- Write in BOTH English AND Japanese (EN + 日本語): English first, then Japanese on new line
- Use natural anime fan expressions like すごい、最高、神回 etc.
- Express genuine appreciation or excitement
- Be friendly and relatable
- Share what you love about it (favorite scene, character, moment)
- OK to connect it briefly to tech/AI if natural, but focus on fan appreciation
- DO NOT repeat or paraphrase the original tweet
- Your reply must add NEW content (your opinion, question, or excitement)
- Avoid: ${avoidList || 'spoilers, negativity, controversy'}
- Include: ${includeList || 'appreciation, favorite moment'}

Reply:`;

  try {
    const response = await callGeminiAPI(prompt, apiKey);
    const cleaned = cleanContent(response);

    // ✅ 如果 cleanContent 失敗，直接用 OpenAI 重試
    if (!cleaned || cleaned.length < 10) {
      console.log('[WARN] cleanContent failed for interest reply, retrying with OpenAI...');
      const openaiReply = await callOpenAIDirect(prompt);
      if (openaiReply) {
        return openaiReply;
      }
    }

    return cleaned;
  } catch (error) {
    console.error('Error generating interest reply:', error.message);
    try {
      const openaiReply = await callOpenAIDirect(prompt);
      return openaiReply;
    } catch (e) {
      return null;
    }
  }
}

/**
 * 使用 Ollama 生成針對追蹤帳號的專業回覆
 * 用於回覆 VCs、意見領袖等你想讓他們注意到你的人
 */
async function generateTrackedReply(tweetText, tweetAuthor, persona, apiKey, trackedConfig, category) {
  // 先檢查原推文是否為不當內容
  if (isInappropriateContent(tweetText)) {
    console.log(`[SKIP] Skipping reply to inappropriate content from @${tweetAuthor}`);
    return null;
  }

  const replyStyle = trackedConfig.reply_style || {};
  const avoidList = (replyStyle.avoid || []).join(', ');
  const includeList = (replyStyle.include || []).join(', ');

  // 根據類別調整策略
  let categoryGuidance = '';
  if (category && category.includes('vc') || category && category.includes('investor')) {
    categoryGuidance = `
- This is a VC/investor - show business acumen and market insight
- Demonstrate you understand their perspective on startups
- Be concise and impactful, VCs are busy`;
  } else if (category && category.includes('leader')) {
    categoryGuidance = `
- This is a tech/AI leader - show technical depth
- Add a unique perspective they might not have considered
- Reference specific technical points`;
  } else if (category && category.includes('founder')) {
    categoryGuidance = `
- This is a fellow founder - be relatable
- Share relevant experience or empathy
- Build genuine connection`;
  }

  const prompt = `You are Lman, CoFounder of IrisGo.AI (on-device AI assistant). Write a strategic reply to this influential person's tweet.

Tweet from @${tweetAuthor}: "${tweetText}"

Goal: Get noticed by this person through a thoughtful, valuable reply.
${categoryGuidance}

Instructions:
- Max 280 characters
- Write in BOTH English AND Traditional Chinese (雙語): English first, then Chinese translation on new line
- Add genuine value - share a unique insight or perspective
- Be professional but not sycophantic
- Show expertise without being arrogant
- Ask a thought-provoking question OR share a contrarian insight
- DO NOT repeat or paraphrase the original tweet
- Your reply must be SUBSTANTIALLY DIFFERENT - add your own angle
- Avoid: ${avoidList || 'flattery, self-promotion, generic praise'}
- Include: ${includeList || 'unique perspective, relevant experience'}

Reply:`;

  try {
    const response = await callGeminiAPI(prompt, apiKey);
    const cleaned = cleanContent(response);

    // ✅ 如果 cleanContent 失敗，直接用 OpenAI 重試
    if (!cleaned || cleaned.length < 10) {
      console.log('[WARN] cleanContent failed for tracked reply, retrying with OpenAI...');
      const openaiReply = await callOpenAIDirect(prompt);
      if (openaiReply) {
        return openaiReply;
      }
    }

    return cleaned;
  } catch (error) {
    console.error('Error generating tracked reply:', error.message);
    try {
      const openaiReply = await callOpenAIDirect(prompt);
      return openaiReply;
    } catch (e) {
      return null;
    }
  }
}

/**
 * 調用本地 Ollama API (gpt-oss:20b with fallback to OpenAI)
 */
async function callGeminiAPI(prompt, apiKey) {
  const url = 'http://localhost:11434/api/generate';

  // 模型列表：優先使用 gpt-oss:20b，失敗時 fallback 到 qwen3-coder:30b
  const models = ['gpt-oss:20b', 'qwen3-coder:30b'];

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

      // ✅ 記錄 Token 使用（從 Ollama API 回應）
      try {
        localTracker.recordFromOllamaResponse('twitter-curator', data, model);
      } catch (err) {
        console.warn('⚠️  Failed to record local tokens:', err.message);
      }

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

  // ✅ Final fallback: OpenAI API
  console.log('[WARN] All Ollama models failed, falling back to OpenAI...');
  try {
    const openaiKey = 'process.env.OPENAI_API_KEY';
    const openaiPayload = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 200
    };

    const openaiCommand = `curl -s -X POST 'https://api.openai.com/v1/chat/completions' \
      -H 'Content-Type: application/json' \
      -H 'Authorization: Bearer ${openaiKey}' \
      -d '${JSON.stringify(openaiPayload).replace(/'/g, "'\\''")}'`;

    const openaiResponse = execSync(openaiCommand, { encoding: 'utf-8', timeout: 30000 });
    const openaiData = JSON.parse(openaiResponse);

    if (openaiData.choices && openaiData.choices[0]?.message?.content) {
      console.log('[INFO] Using model: OpenAI gpt-4o-mini (fallback)');
      return openaiData.choices[0].message.content;
    }

    throw new Error('No valid response from OpenAI');
  } catch (openaiError) {
    console.log(`[ERROR] OpenAI fallback failed: ${openaiError.message}`);
    throw new Error('All AI models failed (Ollama + OpenAI)');
  }
}

/**
 * 清理生成的內容 (從 Ollama thinking 中提取實際推文)
 */
function cleanContent(content) {
  console.log(`[DEBUG] Cleaning content, length: ${content.length}`);

  // ✅ Meta-instruction 關鍵字（需要過濾的）
  const metaInstructionKeywords = [
    // Prompt 洩漏
    'You are Lman',
    'Reply to this tweet',
    'Write a reply',
    'Write a tweet',
    'startup builder',
    'AI/tech expert',
    'tech entrepreneur',
    'CoFounder of IrisGo',
    // Interest Reply prompt 洩漏
    'enthusiastic fan',
    'passionate anime',
    'passionate scifi',
    'fan appreciation',
    'Write as an',
    'Express genuine appreciation',
    'Be friendly and relatable',
    'Share what you love',
    'favorite scene',
    'favorite moment',
    'favorite character',
    'connect it briefly to tech',
    'focus on fan',
    // 中文 prompt 洩漏
    '熱情粉絲',
    '粉絲的喜愛',
    '最喜歡的場景',
    '最喜歡的角色',
    '必須使用英語',
    '個字元',
    '激動之情',
    '我們需要',
    '重點還是放在',
    // Tracked Reply prompt 洩漏
    'Get noticed by',
    'strategic reply',
    'influential person',
    'thought-provoking question',
    'contrarian insight',
    'sycophantic',
    // 思考過程洩漏
    'We need to reply',
    'We need to respond',
    'We need to write',
    'We should reply',
    'Let me analyze',
    'Let me think',
    'This is explicit',
    'sexual content',
    'not allowed',
    'check policy',
    // 格式指令洩漏
    'Step 1:',
    'Step 2:',
    'Requirements:',
    'Format your response',
    'Output ONLY',
    'Instructions:',
    'Max 280',
    'characters max',
    'English only',
    'NO hashtags'
  ];

  // ✅ 優先：提取 "FINAL REPLY:" 或 "Reply:" 後的內容
  const replyMarkers = [
    /FINAL REPLY:\s*(.+?)(?:\n|$)/i,
    /^Reply:\s*(.+?)$/im,
    /\nReply:\s*(.+?)(?:\n|$)/i
  ];

  for (const pattern of replyMarkers) {
    const match = content.match(pattern);
    if (match) {
      const extracted = match[1].trim();
      if (extracted.length >= 20) {
        console.log(`[INFO] Extracted from reply marker: ${extracted.substring(0, 100)}...`);
        return cleanAndValidate(extracted, metaInstructionKeywords);
      }
    }
  }

  // ✅ 次選：提取引號中的內容
  const allQuotes = content.match(/"([^"]+)"/g);
  if (allQuotes && allQuotes.length > 0) {
    const promptKeywords = ['Topic:', 'Requirements:', 'Max 280', 'Style:', 'Write a tweet', 'CoFounder at'];

    const validQuotes = allQuotes
      .map(q => q.replace(/"/g, '').trim())
      .filter(q => {
        if (q.length < 20) return false;
        if (promptKeywords.some(kw => q.includes(kw))) return false;
        if (metaInstructionKeywords.some(kw => q.includes(kw))) return false;
        return true;
      });

    if (validQuotes.length > 0) {
      const longest = validQuotes.reduce((a, b) => a.length > b.length ? a : b);
      console.log(`[INFO] Extracted from quotes: ${longest.substring(0, 100)}...`);
      return cleanAndValidate(longest, metaInstructionKeywords);
    }
  }

  // ✅ Fallback: 清理原始內容
  console.log('[WARN] No FINAL REPLY marker or quotes found, using fallback');
  const cleaned = content
    .replace(/^["']|["']$/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanAndValidate(cleaned, metaInstructionKeywords);
}

/**
 * 清理並驗證最終內容
 */
function cleanAndValidate(text, metaInstructionKeywords) {
  const cleaned = text
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 280);

  // ✅ 驗證：如果包含 meta-instruction 關鍵字，返回 null
  for (const keyword of metaInstructionKeywords) {
    if (cleaned.includes(keyword)) {
      console.log(`[ERROR] Meta-instruction detected: "${keyword}" in content. Rejecting.`);
      return null;
    }
  }

  // ✅ 驗證：如果太短（可能提取失敗）
  if (cleaned.length < 10) {
    console.log('[ERROR] Extracted content too short. Rejecting.');
    return null;
  }

  console.log(`[SUCCESS] Valid content extracted: ${cleaned.substring(0, 100)}...`);
  return cleaned;
}

/**
 * 隨機選擇主題
 */
function selectRandomTopic(topics) {
  return topics[Math.floor(Math.random() * topics.length)];
}

/**
 * 加權選擇主題分類
 * @param {Object} categories - 主題分類物件，每個分類有 weight 和 topics
 * @returns {string} 選中的主題
 */
function selectWeightedTopic(categories) {
  // 計算總權重
  const entries = Object.entries(categories);
  const totalWeight = entries.reduce((sum, [, cat]) => sum + cat.weight, 0);

  // 隨機選擇
  let random = Math.random() * totalWeight;
  let selectedCategory = null;

  for (const [name, category] of entries) {
    random -= category.weight;
    if (random <= 0) {
      selectedCategory = { name, ...category };
      break;
    }
  }

  // Fallback
  if (!selectedCategory) {
    selectedCategory = { name: entries[0][0], ...entries[0][1] };
  }

  // 從選中的分類中隨機選擇主題
  const topic = selectedCategory.topics[Math.floor(Math.random() * selectedCategory.topics.length)];

  console.log(`[INFO] Selected category: ${selectedCategory.name} (weight: ${selectedCategory.weight}%)`);
  return topic;
}

module.exports = {
  generateOriginalTweet,
  generateReply,
  generateInterestReply,
  generateTrackedReply,
  selectRandomTopic,
  selectWeightedTopic,
  selectEngagementHook,
  getHookGuidance,
  extractPersonaSummary,
  isInappropriateContent
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
