#!/usr/bin/env node

/**
 * Content Generator for LinkedIn Curator
 * 使用 CLIProxyAPI (優先) 或 Ollama 本地模型生成符合 Persona 的 LinkedIn 貼文和回覆
 *
 * v2.6 - 2026-01-04: 整合 CLIProxyAPI 作為主要 AI 來源
 *   - CLIProxyAPI (OAuth Gemini/Claude) → Ollama fallback
 * v2.5 - 2025-12-14: 修復 prompt leak bug
 *   - 新增 "We should/must/can/have" 等 meta-instruction 過濾
 *   - stripThinkingBlock 現在返回 null 如果檢測到殘留指令
 *   - validateAndFinalizePost 處理 null 返回值
 */

require('dotenv').config();

const { execSync } = require('child_process');
const fs = require('fs');

// CLIProxyAPI configuration (unified AI proxy - OAuth-based, no quota limits)
// Fallback chain: Gemini → GLM (Z.AI) → OpenAI
const CLIPROXY_URL = process.env.CLIPROXY_URL || 'http://127.0.0.1:8317';
const CLIPROXY_API_KEY = process.env.CLIPROXY_API_KEY || 'magi-proxy-key-2026';
const CLIPROXY_MODEL = process.env.CLIPROXY_MODEL || 'gemini-2.5-flash';
const CLIPROXY_FALLBACK_MODEL = process.env.CLIPROXY_FALLBACK_MODEL || 'glm-4.5';  // Z.AI GLM for LinkedIn (quality)

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

// ============================================
// 🏢 品牌模式 Prompt 模板
// ============================================

/**
 * 品牌 LinkedIn 貼文 Prompt（公司視角，不用個人經驗）
 */
function getBrandLinkedInPostPrompt(brandConfig, topic, hookStyle) {
  return `Write a professional LinkedIn post as the ${brandConfig.name} brand voice.

CRITICAL RULES:
- NEVER use first-person singular ("I", "my", "me")
- NEVER reference personal experience ("After N years...", "In my career...", "When I was...")
- Use brand perspective: "We at ${brandConfig.name}...", "${brandConfig.name} believes...", "Our approach..."
- Focus on industry insights and thought leadership
- Write from company perspective, not individual founder

Brand Context:
- Brand: ${brandConfig.name}
- Tagline: ${brandConfig.tagline}
- Voice: ${brandConfig.voice}

Topic: ${topic}
Opening Style: ${hookStyle}

Requirements for final post:
- Length: 600-1000 characters
- English only
- Professional yet conversational
- Strong, specific opening (follow the style above)
- Share industry insights and perspective (NOT personal experience)
- End with a question or call-to-action
- Use paragraph breaks for readability
- 3-5 relevant hashtags at the end
- Do NOT mention specific company names unless relevant to the industry discussion

Output ONLY the final post text - no planning notes or meta-commentary.

Format your response as:
FINAL POST: [your actual LinkedIn post here]`;
}

/**
 * 品牌 LinkedIn 回覆 Prompt（公司視角）
 */
function getBrandLinkedInReplyPrompt(brandConfig, postText, postAuthor) {
  return `Write a professional LinkedIn comment reply as the ${brandConfig.name} brand voice.

CRITICAL RULES:
- NEVER use first-person singular ("I", "my", "me")
- NEVER reference personal experience ("After N years...", "In my career...")
- Use brand perspective: "We see this too...", "At ${brandConfig.name}, we believe...", "This aligns with..."
- Add value through industry insight, not personal stories

Brand Context:
- Brand: ${brandConfig.name}
- Voice: ${brandConfig.voice}

Post from @${postAuthor}: "${postText}"

Requirements:
- Write 2-3 sentences (100-200 characters)
- ENGLISH ONLY
- Add value: share perspective, ask thoughtful question, or offer insight
- Be conversational and professional
- No hashtags
- Do NOT copy or repeat the original post content
- NEVER start with "As an AI" or "As a [role]"

Output ONLY your comment text in English, nothing else.`;
}

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
 * @param {string} persona - Persona 內容
 * @param {string} topic - 貼文主題
 * @param {Object|null} brandConfig - 品牌配置（品牌模式時使用）
 */
async function generateLinkedInPost(persona, topic, brandConfig = null) {
  const personaSummary = extractPersonaSummary(persona);

  // ✨ Hook 多樣化系統 - 20 種具體開頭範例
  const hookExamples = [
    'Start with a surprising statistic or data point',
    'Challenge a common industry assumption',
    'Describe a problem your audience faces daily',
    'Start with what most people get wrong about [topic]',
    'Open with a counterintuitive observation',
    'Start with a common mistake you see professionals make',
    'Challenge conventional wisdom with evidence',
    'Describe a trend everyone else is missing',
    'Start with what nobody talks about in [industry]',
    'Open with a comparison that makes people think',
    'Share something that surprised you about [topic]',
    'Start with a prediction and your reasoning',
    'Describe a paradox you noticed in your field'
  ];
  const randomStyle = hookExamples[Math.floor(Math.random() * hookExamples.length)];

  // 🏢 品牌模式：使用品牌 prompt 模板
  if (brandConfig) {
    console.log(`[INFO] 🏢 Using brand prompt for LinkedIn post: ${brandConfig.name}`);
    const brandPrompt = getBrandLinkedInPostPrompt(brandConfig, topic, randomStyle);

    try {
      const response = await callOllamaAPI(brandPrompt);
      return cleanLinkedInContent(response, topic);
    } catch (error) {
      console.error('Error generating brand LinkedIn post:', error.message);
      return null;
    }
  }

  // 👤 個人模式：使用原有 Lman 身份
  const identity = selectIdentity(topic);
  const topicType = categorizeTopicType(topic);

  // 根據主題類型決定是否可以提 IrisGo
  const companyMentionRule = topicType === 'product'
    ? '- You MAY mention IrisGo.AI naturally if relevant'
    : '- Do NOT mention any company name - focus on general insights';

  // 個人模式額外的 hook（包含個人經驗）
  const personalHooks = [
    'Open with a brief personal failure story',
    'Share a recent "aha moment" from your work',
    'Use a brief case study from your experience',
    'Share the worst advice you ever received',
    'Describe what changed your perspective recently',
    'Open with a specific example from this week',
    'Share an unexpected lesson from a project'
  ];
  const allHooks = [...hookExamples, ...personalHooks];
  const personalStyle = allHooks[Math.floor(Math.random() * allHooks.length)];

  const prompt = `Write a professional LinkedIn post as ${identity}.

Topic: ${topic}
Opening Style: ${personalStyle}

⚠️ CRITICAL RULES:
1. Do NOT use these overused openings:
   - "Ever wonder..."
   - "Have you ever wondered..."
   - "Did you know..."
   - "What if I told you..."
   - "Imagine this..."
2. Do NOT include ANY meta-commentary like:
   - "Let's draft...", "Count roughly...", "That's hook..."
   - "[post]", "Paragraph 1:", "Hook:", etc.
3. Output ONLY the final post text - no planning notes

Requirements for final post:
- Length: 600-1000 characters
- English only
- Professional yet conversational
- Strong, specific opening (follow the style above)
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
  'Lman, product-focused founder',
  'Lman, someone who builds tech products'
];

/**
 * 使用 Ollama 生成 LinkedIn 回覆
 * @param {string} postText - 原貼文內容
 * @param {string} postAuthor - 原作者
 * @param {string} persona - Persona 內容
 * @param {Object|null} brandConfig - 品牌配置（品牌模式時使用）
 */
async function generateLinkedInReply(postText, postAuthor, persona, brandConfig = null) {
  // 🏢 品牌模式：使用品牌 prompt 模板
  if (brandConfig) {
    console.log(`[INFO] 🏢 Using brand prompt for LinkedIn reply: ${brandConfig.name}`);
    const brandPrompt = getBrandLinkedInReplyPrompt(brandConfig, postText, postAuthor);

    try {
      const response = await callOllamaAPI(brandPrompt);
      const cleanedReply = cleanReplyContent(response);

      // 驗證：檢查是否複製原文
      if (cleanedReply && isContentDuplicate(cleanedReply, postText)) {
        console.log('[ERROR] Brand reply duplicates original post content. Rejecting.');
        return null;
      }

      return cleanedReply;
    } catch (error) {
      console.error('Error generating brand LinkedIn reply:', error.message);
      return null;
    }
  }

  // 👤 個人模式：使用原有 Lman 身份
  // 隨機選擇身份（回覆不需要一直提公司）
  const identity = REPLY_IDENTITIES[Math.floor(Math.random() * REPLY_IDENTITIES.length)];

  // 檢查是否使用動漫類比（品牌模式不使用）
  const animeAnalogy = getLinkedInAnimeAnalogy(postText);

  let prompt;
  if (animeAnalogy) {
    // 有動漫類比的版本
    prompt = `You are ${identity}. Write a professional LinkedIn comment reply.

Post from @${postAuthor}: "${postText}"

Include this insight naturally in your reply: "${animeAnalogy}"

Requirements:
- Write 2-3 sentences (150-250 characters)
- ENGLISH ONLY - never use Chinese or other languages
- Add genuine value or insight
- Be conversational and professional
- Do NOT mention any company name
- No hashtags
- Do NOT copy or repeat the original post content
- NEVER start with "As an AI" or "As a [role]" - just speak naturally

Output ONLY your comment text in English, nothing else.`;
  } else {
    // 標準版本
    prompt = `You are ${identity}. Write a professional LinkedIn comment reply.

Post from @${postAuthor}: "${postText}"

Requirements:
- Write 2-3 sentences (100-200 characters)
- ENGLISH ONLY - never use Chinese or other languages
- Add value: agree/disagree with insight, share experience, or ask thoughtful question
- Be conversational and authentic
- Do NOT mention any company name
- No hashtags
- Do NOT copy or repeat the original post content
- NEVER start with "As an AI" or "As a [role]" - just speak naturally

Output ONLY your comment text in English, nothing else.`;
  }

  try {
    const response = await callOllamaAPI(prompt);
    const cleanedReply = cleanReplyContent(response);

    // ✅ 驗證：檢查是否複製原文（重疊超過 50%）
    if (cleanedReply && isContentDuplicate(cleanedReply, postText)) {
      console.log('[ERROR] Reply duplicates original post content. Rejecting.');
      return null;
    }

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
 * 檢查回覆內容是否重複原文
 * 使用相似度計算，如果重疊超過 50% 則視為重複
 */
function isContentDuplicate(reply, originalPost) {
  // 正規化文字（移除標點、轉小寫、分詞）
  const normalize = (text) => {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3); // 只比較長度 > 3 的單字
  };

  const replyWords = new Set(normalize(reply));
  const postWords = new Set(normalize(originalPost));

  // 計算交集
  const intersection = [...replyWords].filter(word => postWords.has(word));
  const similarity = intersection.length / Math.min(replyWords.size, postWords.size);

  console.log(`[DEBUG] Content similarity: ${(similarity * 100).toFixed(1)}%`);

  return similarity > 0.5; // 超過 50% 相似度視為重複
}

/**
 * 調用 CLIProxyAPI (優先) 或 Ollama 本地模型
 * CLIProxyAPI 提供 OAuth-based Gemini/Claude，無配額限制
 */
async function callOllamaAPI(prompt) {
  // ===== Step 1: Try CLIProxyAPI first =====
  try {
    console.log('[INFO] Trying CLIProxyAPI...');
    const response = await fetch(`${CLIPROXY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CLIPROXY_API_KEY}`
      },
      body: JSON.stringify({
        model: CLIPROXY_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    const data = await response.json();

    if (data.choices && data.choices[0].message.content) {
      console.log(`[INFO] CLIProxyAPI success (model: ${CLIPROXY_MODEL})`);
      return data.choices[0].message.content;
    }

    throw new Error('Invalid CLIProxyAPI response');

  } catch (cliproxyError) {
    console.log(`[WARN] CLIProxyAPI failed: ${cliproxyError.message}, falling back to Ollama...`);
  }

  // ===== Step 2: Fallback to Ollama =====
  const url = 'http://localhost:11434/api/generate';
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

      if (data.response) {
        console.log(`[INFO] Ollama success (model: ${model})`);
        return data.response;
      } else if (data.thinking) {
        console.log(`[WARN] Model ${model} only returned thinking, extracting...`);
        let content = data.thinking;
        content = content.replace(/Thinking\.{3}[\s\S]*?\.{3}done thinking\.\s*/gi, '');
        content = content.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '');
        content = content.replace(/^\s+/, '');
        return content;
      }

      throw new Error('No valid response from model');

    } catch (error) {
      console.log(`[WARN] Ollama ${model} failed: ${error.message}, trying next...`);
      continue;
    }
  }

  throw new Error('All AI providers failed (CLIProxyAPI + Ollama)');
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

  // 🆕 2025-12-14: 處理 stripThinkingBlock 返回 null (meta-instruction 洩漏)
  if (cleaned === null) {
    console.log('[ERROR] stripThinkingBlock rejected content due to meta-instruction leak');
    return null;
  }

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
 * 過濾掉 LLM 的思考過程區塊 (v2.4)
 * 強化版 - 2025-12-13 修復更多洩漏模式
 */
function stripThinkingBlock(content) {
  let cleaned = content;

  // 1. 移除 "Thinking..." 到 "...done thinking." 的區塊
  cleaned = cleaned.replace(/Thinking\.{3}[\s\S]*?\.{3}done thinking\.\s*/gi, '');

  // 2. 移除 "<thinking>" 到 "</thinking>" 的 XML 標籤形式
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '');

  // 3. 移除 "[post]" 開頭的指令行 (整行)
  cleaned = cleaned.replace(/^\[post\].*$/gim, '');

  // 4. 移除 "We need..." 開頭的指令行 (整行) - 擴展更多動詞和名詞
  cleaned = cleaned.replace(/^We need\s+(to\s+)?(produce|write|ensure|create|make|decide|avoid|mention|use|include|focus|consider|highlight|check).*$/gim, '');
  // 4a. 🆕 移除 "We need a prediction/hook/opening..." 形式 (2025-12-14)
  cleaned = cleaned.replace(/^We need\s+a\s+(prediction|hook|opening|closing|call|cta|question|statement|strong|bold|creative|compelling|engaging).*$/gim, '');

  // 4b. 🆕 移除 "We should..." 開頭的指令行 (2025-12-14 新增 - 修復 prompt leak)
  cleaned = cleaned.replace(/^We should\s+(not\s+)?(produce|write|ensure|create|make|decide|avoid|mention|use|include|focus|consider|highlight|check|claim|keep).*$/gim, '');

  // 4c. 🆕 移除 "We must..." 開頭的指令行 (2025-12-14 新增 - 修復 prompt leak)
  cleaned = cleaned.replace(/^We must\s+(not\s+)?(produce|write|ensure|create|make|decide|avoid|mention|use|include|focus|consider|highlight|check).*$/gim, '');

  // 4d. 🆕 移除 "We can..." 開頭的指令行 (2025-12-14 新增 - 修復 prompt leak)
  cleaned = cleaned.replace(/^We can\s+(say|write|mention|use|include|add).*$/gim, '');

  // 4e. 🆕 移除 "We have many facts..." 開頭的指令行 (2025-12-14 新增 - 修復 prompt leak)
  cleaned = cleaned.replace(/^We have\s+(many\s+)?(facts|verified|confirmed).*$/gim, '');

  // 4f. 🆕 移除 "Include metrics..." 開頭的指令行 (2025-12-14 新增 - 修復 prompt leak)
  cleaned = cleaned.replace(/^Include\s+(metrics|numbers|statistics|data).*$/gim, '');

  // 4g. 🆕 移除 "So we can write..." 開頭的指令行 (2025-12-14 新增)
  cleaned = cleaned.replace(/^So\s+we\s+can\s+(write|say|mention|produce).*$/gim, '');

  // 4h. 🆕 移除模板標記行 "Core insight:", "Real examples:", "Call-to-action:" (2025-12-14)
  cleaned = cleaned.replace(/^(Core insight|Real examples?|Call-to-action|Opening hook|Main point|Key message|Closing|CTA):\s*["']?.*$/gim, '');

  // 4i. 🆕 移除 "e.g.," / "e.g.:" 開頭的範例行 (2025-12-14)
  cleaned = cleaned.replace(/^e\.g\.[,:]\s*["']?.*$/gim, '');

  // 4j. 🆕 移除 "Count approximate/roughly" 開頭的計算行 (2025-12-14)
  cleaned = cleaned.replace(/^Count\s+(approximate|roughly|about|the|characters|words).*$/gim, '');

  // 4k. 🆕 移除 "We'll write/draft/create" 開頭的指令行 (2025-12-14)
  cleaned = cleaned.replace(/^We'll\s+(write|draft|create|make|produce|use|include|add|start|begin).*$/gim, '');

  // 4l. 🆕 移除 "We will" 開頭的指令行 (2025-12-14)
  cleaned = cleaned.replace(/^We will\s+(write|draft|create|make|produce|use|include|add|start|begin|need).*$/gim, '');

  // 5. 移除 "Let's..." 開頭的思考行 (整行) - 擴充版 v2.4
  cleaned = cleaned.replace(/^Let's\s+(aim|count|draft|approximate|see|check|think|write|plan|structure|organize|ensure|make sure|keep|stay|target|shoot for|produce|outline|craft|create|quickly|manually|start|begin|try|do|go|review|verify|calculate|estimate).*$/gim, '');

  // 5b. 移除 "Ok. Let's..." 形式
  cleaned = cleaned.replace(/^Ok\.?\s*Let's.*$/gim, '');

  // 5c. 移除 "Also mention..." 形式的思考行
  cleaned = cleaned.replace(/^Also\s+(mention|include|add|note|avoid|use|focus|consider|highlight).*$/gim, '');

  // 5d. 移除 "Should not mention..." 形式
  cleaned = cleaned.replace(/^Should\s+(not\s+)?(mention|include|avoid|use|focus).*$/gim, '');

  // 5e. 🆕 移除 "Avoid..." 開頭的指令行 (v2.4)
  cleaned = cleaned.replace(/^Avoid\s+(banned|using|mentioning|overused|these|the|starting|beginning).*$/gim, '');

  // 5f. 🆕 移除 "Write in..." 指令行 (v2.4)
  cleaned = cleaned.replace(/^Write\s+(in|with|a|the|as|for|about).*$/gim, '');

  // 5g. 🆕 移除 "Now count..." / "Now let's..." 形式 (v2.4)
  cleaned = cleaned.replace(/^Now\s+(count|let's|we|I'll|check|verify|calculate|draft|write|create).*$/gim, '');

  // 5h. 🆕 移除 "Counterintuitive observation:" 等結構標記 (v2.4)
  cleaned = cleaned.replace(/^(Counterintuitive observation|Observation|Key insight|Main point|Core message|Opening hook|Strong opening):\s*(e\.g\..*)?$/gim, '');

  // 5i. 🆕 移除 "Share personal..." / "Share your..." 指令 (v2.4)
  cleaned = cleaned.replace(/^Share\s+(personal|your|a|the|some|insights|experience).*$/gim, '');

  // 5j. 🆕 移除 "Line1:", "Line 1:", etc. 格式標記 (v2.4)
  cleaned = cleaned.replace(/^Line\s*\d+:.*$/gim, '');

  // 6. 移除字數/段落計算行 (整行，包含數字範圍的)
  cleaned = cleaned.replace(/^.*\d+[-–]\d+\s*characters?.*$/gim, '');
  cleaned = cleaned.replace(/^.*~?\d+\s*characters?\.?\s*$/gim, '');
  cleaned = cleaned.replace(/^Count\s+(characters|words|roughly).*$/gim, '');
  cleaned = cleaned.replace(/^.*Rough\s+estimate.*$/gim, '');
  cleaned = cleaned.replace(/^Draft:?\s*$/gim, '');
  cleaned = cleaned.replace(/^.*paragraph breaks?:.*$/gim, '');
  cleaned = cleaned.replace(/^.*\d+\s*paragraphs?.*$/gim, '');
  cleaned = cleaned.replace(/^.*need to keep within.*$/gim, '');
  cleaned = cleaned.replace(/^.*each paragraph.*\d+\s*chars?.*$/gim, '');
  cleaned = cleaned.replace(/^.*\d+\s*char(s)?\s*(per|each).*$/gim, '');

  // 7. 移除純指令短句 (整行)
  cleaned = cleaned.replace(/^(Count roughly|That's hook|That's about|That will hook|Structure:|Format:|Note:|Remember:).*$/gim, '');

  // 8. 🆕 移除 "Paragraph N:" 格式的段落標記 (整行)
  cleaned = cleaned.replace(/^Paragraph\s+\d+:.*$/gim, '');

  // 9. 🆕 移除 "Hook:" / "Example:" 等標記 (整行)
  cleaned = cleaned.replace(/^(Hook|Example|Main analysis|Key reasons|Opening):\s*["']?.*$/gim, '');

  // 10. 移除結構標籤前綴但保留內容 (Hook:, CTA:, etc.) - 行內版本
  cleaned = cleaned.replace(/\b(Hook:|End with question:|Personal insight:|Then story:|The challenge:|Solution:|Result:)\s*/gim, '');

  // 11. 移除行內的指令片段 (不刪除整行)
  cleaned = cleaned.replace(/\s*Paragraph breaks?:\s*\d+\s*paragraphs?\.?\s*/gi, ' ');
  cleaned = cleaned.replace(/\s*\d+-\d+\s*hashtags?\.?\s*/gi, ' ');
  cleaned = cleaned.replace(/\s*CTA:\s*["']?Share your experiences!?["']?\s*/gi, '\n\nShare your experiences!');

  // 11b. 🆕 移除行內 meta-instruction (2025-12-14 - 修復 prompt leak)
  cleaned = cleaned.replace(/Check length:.*?(\.|\n)/gi, '');
  cleaned = cleaned.replace(/Let's draft and count.*?(\.|\n)/gi, '');
  cleaned = cleaned.replace(/We'll approximate\.?\s*/gi, '');
  cleaned = cleaned.replace(/Count approximate:.*?(\.|\n)/gi, '');
  cleaned = cleaned.replace(/We'll write and then.*?(\.|\n)/gi, '');

  // 12. 移除行尾的 meta 註解
  cleaned = cleaned.replace(/\s*That's\s+(hook|about|the\s+challenge|solution|result)\.?\s*$/gim, '');

  // 13. 🆕 移除 "mention personal experience" 這類指令
  cleaned = cleaned.replace(/^.*mention\s+(personal\s+experience|failed\s+AI\s+projects|I\s+observe).*$/gim, '');

  // 14. 移除獨立的數字標記
  cleaned = cleaned.replace(/\s+\d{3,4}\.\s*/g, ' ');

  // 15. 清理重複的空格
  cleaned = cleaned.replace(/  +/g, ' ');

  // 16. 清理多餘空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 17. 移除開頭結尾空白
  cleaned = cleaned.trim();

  // 18. 🆕 最終驗證：如果還有 meta-instruction 就返回 null (2025-12-14 新增 - 修復 prompt leak)
  // 🔧 2026-01-08: 同步 linkedin-fact-checker-ollama.js 的修復，增加 content guidelines leak 關鍵詞
  const metaKeywords = [
    'We should produce', 'We must ensure', 'We need to', 'We need a', 'We have many facts',
    'We can say', 'Include metrics', 'fabricated claims', 'verified facts',
    'exaggerated', 'Use conservative', 'Use allowed', 'Format your response',
    'Output ONLY', 'So we can write', 'Counterintuitive observation:', 'Avoid banned openings',
    'allowed exaggerations', 'emotional intensity', 'future vision high',
    'impact scope medium', 'Use conservative for uncertain',
    'Core insight:', 'Real examples:', 'Call-to-action:', 'e.g.,', 'e.g.:',
    'Count approximate', "We'll write", "We'll draft", 'We will write', 'We will draft',
    'Check length:', "Let's draft and count", "We'll approximate",
    // 🆕 2026-01-08: 修復 Apollo LinkedIn Page prompt leak (content guidelines 洩漏)
    'maybe a question', 'bold statement', 'Also ensure', 'Avoid B2B',
    'Use 2C perspective', 'Use safe statements', 'ask readers to share',
    'no mention of companies', 'Use 2C', 'B2B enterprise'
  ];

  for (const keyword of metaKeywords) {
    if (cleaned.includes(keyword)) {
      console.log(`[ERROR] stripThinkingBlock: Meta-instruction still present: "${keyword}"`);
      return null;  // 返回 null 讓調用方知道需要重新生成
    }
  }

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
    'We need to add',
    'We should',
    'Let me',
    'Let\'s',
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
    'Post from @',
    'Use 2-3 sentences',
    'Count characters',
    'wonder(', // 字數計算痕跡
    'space=',  // 字數計算痕跡
  ];

  // ✅ 首先移除 thinking 區塊和字數計算痕跡
  let cleaned = content
    .replace(/Thinking\.{3}[\s\S]*?\.{3}done thinking\.\s*/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '')
    // 移除字數計算行
    .replace(/^.*is\s+\d+\.\s*So\s+\d+.*$/gim, '')
    .replace(/^.*space=\d+.*$/gim, '')
    .replace(/^.*wonder\(\d+\)=.*$/gim, '')
    .replace(/^.*Count\s+characters?:?.*$/gim, '')
    .replace(/^.*\d+[-–]\d+\s*characters?.*$/gim, '')
    // 🆕 移除 LLM 逐字計數格式: "V(1)e(2)r(3)..." 或 "space(9)" (2025-12-16)
    .replace(/(?:[A-Za-z]\(\d+\)|space\(\d+\))+/gi, '')
    .replace(/^Count:.*$/gim, '')
    // 🆕 移除 token position 計數格式: "word"=N =>M (2025-12-27)
    .replace(/"\w*"=\d+\s*(?:=>\s*\d+\s*)*/g, '')
    // 🆕 移除無括號字元計數: "o2p3 space4o5n6—7c8..." (2025-12-28)
    // 匹配: 字元或"space"後接數字，重複5次以上
    .replace(/"\s*(?:space|[a-zA-Z—,.])\d{1,3}(?:\s*(?:space|[a-zA-Z—,.])\d{1,3}){5,}.*/gi, '')
    .replace(/\s+(?:space|[a-zA-Z—,.])\d{1,3}(?:\s*(?:space|[a-zA-Z—,.])\d{1,3}){5,}$/gi, '')
    // 🆕 移除重複的引號內容 (模型輸出兩次相同內容)
    .replace(/^(.{50,}?)\s*\1/gm, '$1')
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
  let cleaned = content.substring(0, 500);

  // ✅ 先清理字數計算的痕跡
  cleaned = cleaned
    .replace(/^.*is\s+\d+\.\s*So\s+\d+.*$/gim, '')  // "is 6. So 111"
    .replace(/^.*space=\d+.*$/gim, '')              // "space=112"
    .replace(/^.*Count\s+characters?:?.*$/gim, '')  // "Count characters:"
    .replace(/^.*\d+\s*characters?\.?.*$/gim, '')   // "150-250 characters"
    .replace(/^.*\(?\d+\s*inc\s+hyphen.*$/gim, '')  // "(10 inc hyphen?)"
    // 🆕 移除 LLM 逐字計數格式: "V(1)e(2)r(3)..." (2025-12-16)
    .replace(/(?:[A-Za-z]\(\d+\)|space\(\d+\))+/gi, '')
    .replace(/^Count:.*$/gim, '')
    // 🆕 移除無括號字元計數: "o2p3 space4o5n6—7c8..." (2025-12-28)
    // 匹配: 字元或"space"後接數字，重複5次以上
    .replace(/"\s*(?:space|[a-zA-Z—,.])\d{1,3}(?:\s*(?:space|[a-zA-Z—,.])\d{1,3}){5,}.*/gi, '')
    .replace(/\s+(?:space|[a-zA-Z—,.])\d{1,3}(?:\s*(?:space|[a-zA-Z—,.])\d{1,3}){5,}$/gi, '')
    .replace(/\s+/g, ' ')                            // 合併多餘空格
    .trim();

  // ✅ 驗證：檢查 meta-instruction
  for (const keyword of metaKeywords) {
    if (cleaned.includes(keyword)) {
      console.log(`[ERROR] Meta-instruction detected in reply: "${keyword}". Rejecting.`);
      return null;
    }
  }

  // ✅ 驗證：檢查是否是原文複製（與 post 內容重疊超過 50%）
  // （這個檢查在 generateLinkedInReply 中進行，因為需要原始 postText）

  // ✅ 驗證：長度檢查
  if (cleaned.length < 30) {
    console.log('[ERROR] Reply too short after cleaning. Rejecting.');
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
