#!/usr/bin/env node

/**
 * Content Generator for LinkedIn Curator
 * 使用 Ollama 本地模型生成符合 Persona 的 LinkedIn 貼文和回覆
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
 * 生成 LinkedIn hashtags
 */
function generateHashtags(topic) {
  const topicHashtags = {
    'Enterprise AI': ['#EnterpriseAI', '#AIAdoption', '#AIStrategy'],
    'On-Premise AI': ['#OnPremiseAI', '#PrivacyFirst', '#DataSecurity'],
    'Startup': ['#Startup', '#Entrepreneurship', '#BuildInPublic'],
    'Product Management': ['#ProductManagement', '#ProductStrategy', '#PMLife'],
    'AI Product': ['#AIProduct', '#ProductDesign', '#AIInnovation'],
    'Default': ['#AI', '#Tech', '#Innovation']
  };

  for (const [key, hashtags] of Object.entries(topicHashtags)) {
    if (topic.toLowerCase().includes(key.toLowerCase())) {
      return hashtags;
    }
  }

  return topicHashtags['Default'];
}

/**
 * 身份池 - 避免每篇貼文都提 IrisGo
 * 根據主題類型選擇適當的身份
 */
const IDENTITY_POOLS = {
  // 產業觀察類 - 不提公司 (40%)
  industry: [
    'Lman, a tech entrepreneur and AI observer',
    'Lman, startup founder with 10+ years in tech',
    'Lman, AI/blockchain veteran and industry commentator'
  ],
  // 個人洞察類 - 輕描淡寫 (30%)
  personal: [
    'Lman, serial entrepreneur and lifelong learner',
    'Lman, tech founder sharing lessons from the trenches',
    'Lman, startup builder and productivity enthusiast'
  ],
  // 產品相關類 - 可提公司 (20%)
  product: [
    'Lman (building privacy-first AI at IrisGo.AI)',
    'Lman, Co-Founder at IrisGo.AI'
  ],
  // 技術深度類 - 專家身份 (10%)
  technical: [
    'Lman, on-premise AI advocate and builder',
    'Lman, former blockchain founder turned AI entrepreneur'
  ]
};

/**
 * 主題分類 - 決定使用哪種身份
 */
function categorizeTopicType(topic) {
  const topicLower = topic.toLowerCase();

  // 產品相關 - 可以提 IrisGo
  if (topicLower.includes('irisgo') ||
      topicLower.includes('on-premise ai') ||
      topicLower.includes('privacy-first') ||
      topicLower.includes('personal ai assistant')) {
    return 'product';
  }

  // 技術深度
  if (topicLower.includes('llm') ||
      topicLower.includes('edge ai') ||
      topicLower.includes('local-first')) {
    return 'technical';
  }

  // 個人成長類
  if (topicLower.includes('lesson') ||
      topicLower.includes('failure') ||
      topicLower.includes('mental health') ||
      topicLower.includes('productivity') ||
      topicLower.includes('reading')) {
    return 'personal';
  }

  // 默認：產業觀察
  return 'industry';
}

/**
 * 選擇身份
 */
function selectIdentity(topic) {
  const category = categorizeTopicType(topic);
  const pool = IDENTITY_POOLS[category];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 使用 Ollama 生成 LinkedIn 原創貼文
 */
async function generateLinkedInPost(persona, topic) {
  const personaSummary = extractPersonaSummary(persona);
  const identity = selectIdentity(topic);
  const topicType = categorizeTopicType(topic);

  const styles = [
    'Share a professional insight with concrete examples',
    'Tell a story about a recent challenge and solution',
    'Share lessons learned from a project or experience',
    'Discuss industry trends with your unique perspective',
    'Ask a thought-provoking question to spark discussion',
    'Share practical advice for professionals in your field',
    'Provide analysis of current tech developments',
    'Share a contrarian view with supporting reasoning'
  ];
  const randomStyle = styles[Math.floor(Math.random() * styles.length)];

  // 根據主題類型決定是否可以提 IrisGo
  const companyMentionRule = topicType === 'product'
    ? '- You MAY mention IrisGo.AI naturally if relevant'
    : '- Do NOT mention any company name - focus on general insights';

  const prompt = `Write a professional LinkedIn post as ${identity}.

Topic: ${topic}
Style: ${randomStyle}

Step 1: Think about the best approach (internal analysis only)
Step 2: Write your final LinkedIn post

Requirements for final post:
- Length: 600-1000 characters
- English only
- Professional yet conversational
- Include a hook in the first line
- Share personal insights or expertise
- End with a question or call-to-action
- Use paragraph breaks for readability
- 3-5 relevant hashtags at the end
${companyMentionRule}

Format your response as:
FINAL POST: [your actual LinkedIn post here]`;

  try {
    const response = await callOllamaAPI(prompt);
    return cleanLinkedInContent(response, topic);
  } catch (error) {
    console.error('Error generating LinkedIn post:', error.message);
    return null;
  }
}

// 動漫/SciFi 類比庫 - LinkedIn 專業版（從 Twitter Curator 整合）
const LINKEDIN_ANIME_ANALOGIES = {
  'AI': [
    { anime: '我的英雄學院', analogy: 'AI evolution reminds me of Deku\'s growth - it\'s about continuous improvement, not initial capabilities.' },
    { anime: '星際效應', analogy: 'AI development needs an Interstellar perspective - thinking in terms of long-term impact.' },
    { anime: 'The Matrix', analogy: 'Like The Matrix taught us, the key question isn\'t what AI can do, but how we choose to use it.' }
  ],
  'Startup': [
    { anime: '一拳超人', analogy: 'Building a startup is like Saitama\'s training - real strength comes from doing the ordinary things consistently.' },
    { anime: 'Silicon Valley', analogy: 'The startup ecosystem is exactly like Silicon Valley (the show) depicts - chaotic but full of opportunities.' },
    { anime: '怪獸八號', analogy: 'Career transitions remind me of Kaiju No. 8 - it\'s never too late to pursue your unique value.' }
  ],
  'Product': [
    { anime: '葬送的芙莉蓮', analogy: 'Product design is like Frieren teaches us - don\'t chase short-term flashiness, choose what lasts.' },
    { anime: '迷宮飯', analogy: 'Product development requires Dungeon Meshi thinking - creative resource integration is key.' }
  ],
  'Team': [
    { anime: '排球少年', analogy: 'Effective teams are like volleyball - everyone plays their position, trusting each other.' },
    { anime: 'Fairy Tail', analogy: 'Team culture is our guild - partners are the most valuable asset.' }
  ],
  'Leadership': [
    { anime: 'Star Trek', analogy: 'Leadership needs Star Trek captains\' mindset - exploration spirit + rational decisions + humanistic care.' },
    { anime: 'Gundam', analogy: 'Leadership requires Gundam-level systems thinking - balancing multiple complex factors.' }
  ]
};

/**
 * 獲取動漫類比（LinkedIn 版本 - 10% 機率，更專業）
 */
function getLinkedInAnimeAnalogy(postText) {
  // LinkedIn 上使用更保守的機率 (10%)
  if (Math.random() > 0.1) return null;

  const lowerText = postText.toLowerCase();

  for (const [category, analogies] of Object.entries(LINKEDIN_ANIME_ANALOGIES)) {
    if (lowerText.includes(category.toLowerCase())) {
      const randomAnalogy = analogies[Math.floor(Math.random() * analogies.length)];
      return randomAnalogy.analogy;
    }
  }

  return null;
}

/**
 * 回覆用的身份池（更簡潔）
 */
const REPLY_IDENTITIES = [
  'Lman, a tech entrepreneur',
  'Lman, startup founder',
  'Lman, AI enthusiast and builder',
  'Lman, product-focused founder'
];

/**
 * 使用 Ollama 生成 LinkedIn 回覆
 */
async function generateLinkedInReply(postText, postAuthor, persona) {
  // 隨機選擇身份（回覆不需要一直提公司）
  const identity = REPLY_IDENTITIES[Math.floor(Math.random() * REPLY_IDENTITIES.length)];

  // 檢查是否使用動漫類比
  const animeAnalogy = getLinkedInAnimeAnalogy(postText);

  let prompt;
  if (animeAnalogy) {
    // 有動漫類比的版本
    prompt = `You are ${identity}. Write a professional LinkedIn comment reply.

Post from @${postAuthor}: "${postText}"

Include this insight naturally in your reply: "${animeAnalogy}"

Requirements:
- Write 2-3 sentences (150-250 characters)
- Add genuine value or insight
- Be conversational and professional
- Do NOT mention any company name
- No hashtags

Output ONLY your comment text, nothing else.`;
  } else {
    // 標準版本
    prompt = `You are ${identity}. Write a professional LinkedIn comment reply.

Post from @${postAuthor}: "${postText}"

Requirements:
- Write 2-3 sentences (100-200 characters)
- Add value: agree/disagree with insight, share experience, or ask thoughtful question
- Be conversational and authentic
- Do NOT mention any company name
- No hashtags

Output ONLY your comment text, nothing else.`;
  }

  try {
    const response = await callOllamaAPI(prompt);
    const cleanedReply = cleanReplyContent(response);

    // 如果使用了動漫類比，記錄日誌
    if (animeAnalogy && cleanedReply) {
      console.log('[INFO] 🎬 Used anime analogy in LinkedIn reply');
    }

    return cleanedReply;
  } catch (error) {
    console.error('Error generating LinkedIn reply:', error.message);
    return null;
  }
}

/**
 * 調用本地 Ollama API
 */
async function callOllamaAPI(prompt) {
  const url = 'http://localhost:11434/api/generate';
  // 模型列表：優先使用 gpt-oss:20b，失敗時 fallback 到 qwen3-vl:30b (MoE)
  const models = ['gpt-oss:20b', 'qwen3-vl:30b'];

  for (const model of models) {
    try {
      const payload = {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 500,
          top_p: 0.9,
        }
      };

      const command = `curl -s -X POST '${url}' \
        -H 'Content-Type: application/json' \
        -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}'`;

      const response = execSync(command, { encoding: 'utf-8', timeout: 90000 });
      const data = JSON.parse(response);

      // ✅ Always prefer data.response (actual output)
      // data.thinking is the model's internal reasoning - should NOT be returned
      if (data.response) {
        console.log(`[INFO] Using model: ${model}`);
        return data.response;
      } else if (data.thinking) {
        // Fallback: some models only return thinking
        console.log(`[WARN] Model ${model} only returned thinking, extracting content...`);
        // Strip thinking markers if present
        let content = data.thinking;
        content = content.replace(/Thinking\.{3}[\s\S]*?\.{3}done thinking\.\s*/gi, '');
        content = content.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '');
        content = content.replace(/^\s+/, '');
        return content;
      }

      throw new Error('No valid response from model');

    } catch (error) {
      console.log(`[WARN] Model ${model} failed: ${error.message}, trying next...`);
      continue;
    }
  }

  throw new Error('All Ollama models failed');
}

/**
 * 清理 LinkedIn 貼文內容
 */
function cleanLinkedInContent(content, topic) {
  console.log('[DEBUG] Cleaning LinkedIn content, length:', content.length);

  // ✅ Meta-instruction 關鍵字
  const metaKeywords = [
    'We need to produce',
    'We need to write',
    'Thinking',
    'Step 1:',
    'Step 2:',
    'Requirements:',
    'Format your response',
    'Output ONLY'
  ];

  // ✅ 優先：提取 "FINAL POST:" 後的內容
  const finalPostMatch = content.match(/FINAL POST:\s*(.+?)$/is);
  if (finalPostMatch) {
    const extracted = finalPostMatch[1].trim();
    console.log('[INFO] Extracted from FINAL POST marker');
    return validateAndFinalizePost(extracted, topic, metaKeywords);
  }

  // ✅ 次選：提取引號中的長內容
  const quoteMatches = content.match(/"([^"]{100,2000}[.!?])"/g);
  if (quoteMatches && quoteMatches.length > 0) {
    const lastQuote = quoteMatches[quoteMatches.length - 1];
    const extracted = lastQuote.replace(/"/g, '').trim();
    console.log('[INFO] Extracted from quotes');
    return validateAndFinalizePost(extracted, topic, metaKeywords);
  }

  // ✅ Fallback
  console.log('[WARN] Using fallback cleaning');
  return validateAndFinalizePost(content, topic, metaKeywords);
}

/**
 * 驗證並最終處理 LinkedIn 貼文
 */
function validateAndFinalizePost(content, topic, metaKeywords) {
  // ✅ Step 0: 先用 stripThinkingBlock 清理思考過程
  let cleaned = stripThinkingBlock(content);

  // ✅ 驗證：檢查 meta-instruction
  for (const keyword of metaKeywords) {
    if (cleaned.includes(keyword)) {
      console.log(`[ERROR] Meta-instruction detected: "${keyword}". Rejecting.`);
      return null;
    }
  }

  // ✅ 驗證：長度檢查
  if (cleaned.length < 100) {
    console.log('[ERROR] Content too short. Rejecting.');
    return null;
  }

  console.log('[SUCCESS] Valid LinkedIn post extracted');
  return finalizeLinkedInPost(cleaned, topic);
}

/**
 * 過濾掉 LLM 的思考過程區塊 (v2.2)
 * 完整版本，與 linkedin-fact-checker-ollama.js 保持同步
 */
function stripThinkingBlock(content) {
  let cleaned = content;

  // 1. 移除 "Thinking..." 到 "...done thinking." 的區塊
  cleaned = cleaned.replace(/Thinking\.{3}[\s\S]*?\.{3}done thinking\.\s*/gi, '');

  // 2. 移除 "<thinking>" 到 "</thinking>" 的 XML 標籤形式
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '');

  // 3. 移除 "[post]" 開頭的指令行 (整行)
  cleaned = cleaned.replace(/^\[post\].*$/gim, '');

  // 4. 移除 "We need..." 開頭的指令行 (整行)
  cleaned = cleaned.replace(/^We need\s+(to\s+)?(produce|write|ensure|create|make).*$/gim, '');

  // 5. 移除 "Let's..." 開頭的思考行 (整行)
  cleaned = cleaned.replace(/^Let's\s+(aim|count|draft|approximate|see|check|think|write|plan|structure|organize|ensure|make sure|keep|stay|target|shoot for|produce).*$/gim, '');

  // 6. 移除字數/段落計算行 (整行，包含數字範圍的)
  cleaned = cleaned.replace(/^.*\d+[-–]\d+\s*characters?.*$/gim, '');
  cleaned = cleaned.replace(/^.*~?\d+\s*characters?\.?\s*$/gim, '');
  cleaned = cleaned.replace(/^.*paragraph breaks?:.*$/gim, '');
  cleaned = cleaned.replace(/^.*\d+\s*paragraphs?.*$/gim, '');
  cleaned = cleaned.replace(/^.*need to keep within.*$/gim, '');
  cleaned = cleaned.replace(/^.*each paragraph.*\d+\s*chars?.*$/gim, '');
  cleaned = cleaned.replace(/^.*\d+\s*char(s)?\s*(per|each).*$/gim, '');

  // 7. 移除純指令短句 (整行)
  cleaned = cleaned.replace(/^(Count roughly|That's hook|That's about|Structure:|Format:|Note:|Remember:).*$/gim, '');

  // 8. 移除結構標籤前綴但保留內容 (Hook:, CTA:, etc.)
  cleaned = cleaned.replace(/\b(Hook:|End with question:|Personal insight:|Then story:|The challenge:|Solution:|Result:)\s*/gim, '');

  // 9. 移除行內的指令片段 (不刪除整行)
  cleaned = cleaned.replace(/\s*Paragraph breaks?:\s*\d+\s*paragraphs?\.?\s*/gi, ' ');
  cleaned = cleaned.replace(/\s*\d+-\d+\s*hashtags?\.?\s*/gi, ' ');
  cleaned = cleaned.replace(/\s*CTA:\s*["']?Share your experiences!?["']?\s*/gi, '\n\nShare your experiences!');

  // 10. 移除行尾的 meta 註解
  cleaned = cleaned.replace(/\s*That's\s+(hook|about|the\s+challenge|solution|result)\.?\s*$/gim, '');

  // 11. 移除獨立的數字標記
  cleaned = cleaned.replace(/\s+\d{3,4}\.\s*/g, ' ');

  // 12. 清理重複的空格
  cleaned = cleaned.replace(/  +/g, ' ');

  // 13. 清理多餘空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 14. 移除開頭結尾空白
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * 最終處理 LinkedIn 貼文
 */
function finalizeLinkedInPost(content, topic) {
  let cleaned = content
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  cleaned = cleaned.replace(/\. ([A-Z])/g, '.\n\n$1');

  if (!cleaned.includes('#')) {
    const hashtags = generateHashtags(topic);
    cleaned += `\n\n${hashtags.join(' ')}`;
  }

  if (cleaned.length > 3000) {
    cleaned = cleaned.substring(0, 2900) + '...';
  }

  return cleaned;
}

/**
 * 清理回覆內容
 */
function cleanReplyContent(content) {
  console.log('[DEBUG] Cleaning reply content, length:', content.length);

  // ✅ Meta-instruction 關鍵字（需要過濾的）
  const metaKeywords = [
    'We need to reply',
    'We need to write',
    'We should',
    'Let me',
    'I will',
    'Here is',
    'Here\'s my',
    'Thinking',
    'Step 1:',
    'Step 2:',
    'Requirements:',
    'Format your response',
    'Output ONLY',
    'Reply to this',
    'Post from @'
  ];

  // ✅ 首先移除 thinking 區塊
  let cleaned = content
    .replace(/Thinking\.{3}[\s\S]*?\.{3}done thinking\.\s*/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
    .trim();

  // ✅ 優先：提取 "FINAL REPLY:" 後的內容
  const finalReplyMatch = cleaned.match(/FINAL REPLY:\s*(.+?)(?:\n|$)/i);
  if (finalReplyMatch) {
    const extracted = finalReplyMatch[1].trim();
    console.log('[INFO] Extracted from FINAL REPLY marker');
    return validateReply(extracted, metaKeywords);
  }

  // ✅ 次選：如果內容以引號開頭結尾，直接提取
  if (cleaned.startsWith('"') && cleaned.includes('"')) {
    const quoteEnd = cleaned.lastIndexOf('"');
    if (quoteEnd > 1) {
      const extracted = cleaned.substring(1, quoteEnd).trim();
      if (extracted.length >= 30) {
        console.log('[INFO] Extracted from outer quotes');
        return validateReply(extracted, metaKeywords);
      }
    }
  }

  // ✅ 第三選：提取引號內的內容（最長的有效引號）
  const quoteMatches = content.match(/"([^"]{30,500})"/g);
  if (quoteMatches && quoteMatches.length > 0) {
    // 選擇最長的引號內容
    const validQuotes = quoteMatches
      .map(q => q.replace(/"/g, '').trim())
      .filter(q => !metaKeywords.some(kw => q.includes(kw)));

    if (validQuotes.length > 0) {
      const longest = validQuotes.reduce((a, b) => a.length > b.length ? a : b);
      console.log('[INFO] Extracted from quotes (longest valid)');
      return validateReply(longest, metaKeywords);
    }
  }

  // ✅ 第四選：如果內容很短且乾淨，直接使用
  if (cleaned.length >= 30 && cleaned.length <= 500 &&
      !metaKeywords.some(kw => cleaned.includes(kw))) {
    console.log('[INFO] Using cleaned content directly (short and clean)');
    return validateReply(cleaned, metaKeywords);
  }

  // ✅ Fallback：清理並提取最後一段有意義的文字
  console.log('[WARN] Using fallback cleaning');
  const lines = cleaned.split('\n').filter(l => l.trim().length > 20);
  const lastMeaningfulLine = lines[lines.length - 1] || cleaned;

  const finalCleaned = lastMeaningfulLine
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return validateReply(finalCleaned, metaKeywords);
}

/**
 * 驗證回覆內容
 */
function validateReply(content, metaKeywords) {
  const cleaned = content.substring(0, 500);

  // ✅ 驗證：檢查 meta-instruction
  for (const keyword of metaKeywords) {
    if (cleaned.includes(keyword)) {
      console.log(`[ERROR] Meta-instruction detected in reply: "${keyword}". Rejecting.`);
      return null;
    }
  }

  // ✅ 驗證：長度檢查
  if (cleaned.length < 30) {
    console.log('[ERROR] Reply too short. Rejecting.');
    return null;
  }

  console.log('[SUCCESS] Valid reply extracted');
  return cleaned;
}

/**
 * 載入 Persona 檔案
 */
function loadPersona(personaPath) {
  try {
    if (fs.existsSync(personaPath)) {
      return fs.readFileSync(personaPath, 'utf-8');
    }
    console.error(`[ERROR] Persona file not found: ${personaPath}`);
  } catch (error) {
    console.error(`[ERROR] Failed to load persona: ${error.message}`);
  }
  return null;
}

/**
 * 隨機選擇主題（舊版，向後兼容）
 */
function selectRandomTopic(topics) {
  const defaultTopics = [
    'AI industry trends and observations',
    'Startup lessons from the trenches',
    'Productivity systems that actually work',
    'Building privacy-first AI products'
  ];

  const topicsToUse = topics || defaultTopics;
  return topicsToUse[Math.floor(Math.random() * topicsToUse.length)];
}

/**
 * 加權隨機選擇主題（新版）
 * 根據 TOPIC_CATEGORIES 的權重選擇類別，再從類別中隨機選擇主題
 *
 * @param {Object} topicCategories - 來自 linkedin-config.js 的 TOPIC_CATEGORIES
 * @returns {string} 選中的主題
 */
function selectWeightedTopic(topicCategories) {
  if (!topicCategories) {
    return selectRandomTopic();
  }

  // 計算總權重
  const categories = Object.entries(topicCategories);
  const totalWeight = categories.reduce((sum, [, cat]) => sum + cat.weight, 0);

  // 隨機選擇類別
  let random = Math.random() * totalWeight;
  let selectedCategory = null;

  for (const [name, category] of categories) {
    random -= category.weight;
    if (random <= 0) {
      selectedCategory = { name, ...category };
      break;
    }
  }

  // 從選中的類別中隨機選擇主題
  if (selectedCategory && selectedCategory.topics && selectedCategory.topics.length > 0) {
    const topic = selectedCategory.topics[Math.floor(Math.random() * selectedCategory.topics.length)];
    console.log(`[INFO] Selected category: ${selectedCategory.name} (weight: ${selectedCategory.weight}%)`);
    return topic;
  }

  return selectRandomTopic();
}

module.exports = {
  loadPersona,
  generateLinkedInPost,
  generateLinkedInReply,
  selectRandomTopic,
  selectWeightedTopic,
  extractPersonaSummary,
  generateHashtags
};

// CLI 測試
if (require.main === module) {
  const config = require('./linkedin-config');
  const persona = fs.readFileSync(config.PERSONA_FILE, 'utf-8');
  const topic = selectRandomTopic(config.TOPICS);

  console.log('🧪 Testing LinkedIn content generation...\n');
  console.log(`Selected topic: ${topic}\n`);

  generateLinkedInPost(persona, topic).then(post => {
    console.log('✅ Generated LinkedIn post:');
    console.log('─'.repeat(60));
    console.log(post);
    console.log('─'.repeat(60));
    console.log(`\nLength: ${post.length} characters`);
  }).catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}
