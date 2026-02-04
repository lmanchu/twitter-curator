#!/usr/bin/env node

/**
 * Content Generator for Twitter Curator
 * 使用 Gemini AI 生成符合 Persona 的推文和回覆
 */

require('dotenv').config();

const { execSync } = require('child_process');
const fs = require('fs');
const localTracker = require('../bin/local-model-token-tracker.js');

// ========================================
// 🔄 重複內容檢測
// ========================================

/**
 * 計算兩個字串的相似度 (Jaccard similarity on words)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * 載入最近發文記錄
 */
function loadRecentPosts(postsFile, limit = 30) {
  try {
    const fs = require('fs');
    if (!fs.existsSync(postsFile)) return [];

    const data = JSON.parse(fs.readFileSync(postsFile, 'utf-8'));
    // 取最近 N 篇
    return data.slice(-limit).map(p => p.text).filter(Boolean);
  } catch (error) {
    console.warn('[WARN] Failed to load recent posts:', error.message);
    return [];
  }
}

/**
 * 提取文本的開頭模式 (前 N 個詞)
 * @param {string} text - 文本
 * @param {number} n - 詞數 (預設 4)
 * @returns {string} 開頭模式
 */
function extractOpeningPattern(text, n = 4) {
  if (!text) return '';
  const words = text.toLowerCase().split(/\s+/).slice(0, n);
  return words.join(' ');
}

/**
 * 檢查開頭模式是否重複
 * @param {string} newContent - 新內容
 * @param {string[]} recentPosts - 最近發文列表
 * @param {number} maxRepeat - 允許的最大重複次數 (預設 2)
 * @returns {boolean} true 如果開頭模式重複過多
 */
function isOpeningPatternOverused(newContent, recentPosts, maxRepeat = 2) {
  const newOpening = extractOpeningPattern(newContent);
  if (!newOpening) return false;

  let count = 0;
  for (const post of recentPosts) {
    const postOpening = extractOpeningPattern(post);
    if (newOpening === postOpening) {
      count++;
    }
  }

  if (count >= maxRepeat) {
    console.log(`[DUPLICATE] Opening pattern "${newOpening}..." used ${count} times already. Rejecting.`);
    return true;
  }
  return false;
}

/**
 * 硬編碼的禁用開頭模式
 * 這些模式已被過度使用，AI 不應該再用
 */
const BANNED_OPENING_PATTERNS = [
  'everyone says',
  'everyone thinks',
  'most people think',
  'most ai assistants',
  'we at irisgo',
  'at irisgo we',
  'irisgo believes that',
];

/**
 * 過度使用的 n-gram 短語（3-4 詞組）
 * 這些短語在最近的推文中反覆出現，需要避免
 */
const OVERUSED_PHRASES = [
  'your data to',
  'ai needs your data',
  'needs your data',
  'we built the opposite',
  'we believe the opposite',
  'we chose differently',
  'privacy first',
  'on-device ai',
  'cloud dependence',
  'data sovereignty',
];

/**
 * 檢查是否包含過度使用的短語
 */
function containsOverusedPhrases(content) {
  const lowerContent = content.toLowerCase();
  for (const phrase of OVERUSED_PHRASES) {
    if (lowerContent.includes(phrase)) {
      console.log(`[DUPLICATE] Overused phrase detected: "${phrase}". Rejecting.`);
      return true;
    }
  }
  return false;
}

/**
 * 檢查是否使用了禁用的開頭模式
 */
function usesBannedOpening(content) {
  const lowerContent = content.toLowerCase();
  for (const pattern of BANNED_OPENING_PATTERNS) {
    if (lowerContent.startsWith(pattern)) {
      console.log(`[DUPLICATE] Banned opening pattern detected: "${pattern}". Rejecting.`);
      return true;
    }
  }
  return false;
}

/**
 * 檢查內容是否與最近發文重複
 * @param {string} newContent - 新生成的內容
 * @param {string[]} recentPosts - 最近發文列表
 * @param {number} threshold - 相似度閾值 (0-1, 預設 0.45 - 降低以更嚴格)
 * @returns {boolean} true 如果重複
 */
function isContentDuplicate(newContent, recentPosts, threshold = 0.45) {
  // 🚫 Step 1: 檢查禁用開頭模式
  if (usesBannedOpening(newContent)) {
    return true;
  }

  // 🔄 Step 2: 檢查過度使用的短語 (n-gram)
  if (containsOverusedPhrases(newContent)) {
    return true;
  }

  // 🔄 Step 3: 檢查開頭模式是否過度使用
  if (isOpeningPatternOverused(newContent, recentPosts, 2)) {
    return true;
  }

  // 📊 Step 4: Jaccard 相似度檢查 (閾值從 0.6 降到 0.45)
  for (const post of recentPosts) {
    const similarity = calculateSimilarity(newContent, post);
    if (similarity >= threshold) {
      console.log(`[DUPLICATE] Content too similar (${(similarity * 100).toFixed(1)}%) to: "${post.substring(0, 50)}..."`);
      return true;
    }
  }
  return false;
}

/**
 * 載入知識庫目錄中的所有 .md 檔案
 * @param {string} knowledgeBasePath - 知識庫目錄路徑
 * @returns {string} 合併後的知識庫內容
 */
function loadKnowledgeBase(knowledgeBasePath) {
  if (!knowledgeBasePath || !fs.existsSync(knowledgeBasePath)) {
    return '';
  }

  try {
    const files = fs.readdirSync(knowledgeBasePath)
      .filter(f => f.endsWith('.md'))
      .sort(); // 按字母順序排序以確保一致性

    if (files.length === 0) {
      console.log('[INFO] Knowledge base directory empty');
      return '';
    }

    const contents = files.map(file => {
      const filePath = require('path').join(knowledgeBasePath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      // 移除 TODO 標記的未完成項目
      const cleanedContent = content
        .split('\n')
        .filter(line => !line.includes('<!-- TODO') && !line.includes('- [ ]'))
        .join('\n');
      return `### ${file.replace('.md', '')}\n${cleanedContent}`;
    });

    console.log(`[INFO] Loaded knowledge base: ${files.length} files from ${knowledgeBasePath}`);
    return '\n\n## Knowledge Base (Source of Truth)\n' + contents.join('\n\n');
  } catch (error) {
    console.warn('[WARN] Failed to load knowledge base:', error.message);
    return '';
  }
}

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

// ========================================
// 🏢 品牌模式 Prompt 模板
// ========================================

/**
 * 獲取品牌模式的原創推文 prompt
 * @param {Object} brandConfig - 品牌配置
 * @param {string} topic - 主題
 * @returns {string} prompt
 */
function getBrandTweetPrompt(brandConfig, topic) {
  return `Write a tweet as the ${brandConfig.name} brand voice (${brandConfig.handle}).

Brand Identity:
- ${brandConfig.tagline}
- Core belief: ${brandConfig.voice}
- Perspective: Company/brand voice (use "we" or "${brandConfig.name}", NOT "I")

=== HOOK FORMULAS (Use ONE, vary usage) ===
🎣 CURIOSITY: "Most [users/companies] get [X] wrong. Here's what we learned."
🎣 VALUE: "[Specific number] ways to [outcome] without [pain point]:"
🎣 STORY: "When we shipped [feature], users told us..."
🎣 QUESTION: Start with a thought-provoking question
🎣 STAT: Start with a surprising statistic or fact

⚠️ BANNED OPENINGS (NEVER USE - overused and will be rejected):
❌ "Everyone says..."
❌ "Everyone thinks..."
❌ "Most people think..."
❌ "Most AI assistants..."
❌ "We at IrisGo..."
❌ "At IrisGo we..."
❌ "IrisGo believes that..."

These openings have been used too many times. Use FRESH, VARIED openings instead.

=== VOICE PRINCIPLES ===
📌 SPECIFIC > VAGUE: Numbers, concrete outcomes, real examples
📌 SHORT. BREATHE. LAND: Short sentences. Let ideas sink in.
📌 PRODUCT PHILOSOPHY > FEATURES: Why we build, not what we build
📌 USER OUTCOMES > COMPANY PRAISE: Show impact, not self-promotion
📌 VARIED OPENINGS: Start each tweet differently - no patterns!

CRITICAL RULES:
- NEVER use first-person singular ("I", "my", "me")
- NEVER reference personal experience ("After N years...", "In my career...")
- NEVER mention founder's background or personal journey
- NEVER start with the banned openings listed above

Writing Style:
- Thoughtful and professional
- Challenge mainstream views on AI privacy
- Focus on product philosophy and user value
- Direct, no corporate jargon
- FRESH opening every time - check banned list!

Topic: ${topic}

Requirements:
- Max 280 characters
- Write in English only (no translation needed)
- NO hashtags, NO emojis
- Add genuine insight or perspective
- Use ONE hook formula (vary which one)
- DO NOT use any banned opening patterns

Output ONLY the tweet text:`;
}

/**
 * 獲取品牌模式的回覆 prompt
 * @param {Object} brandConfig - 品牌配置
 * @param {string} tweetText - 原推文
 * @param {string} tweetAuthor - 原作者
 * @param {string} hookGuidance - engagement hook 指導
 * @param {string} avoidGuidance - 避免的模式
 * @returns {string} prompt
 */
function getBrandReplyPrompt(brandConfig, tweetText, tweetAuthor, hookGuidance, avoidGuidance) {
  return `You are the ${brandConfig.name} brand voice (${brandConfig.handle}). Write a reply to this tweet.

Tweet from @${tweetAuthor}: "${tweetText}"

Brand Identity:
- ${brandConfig.tagline}
- Core belief: ${brandConfig.voice}

=== REPLY HOOKS (pick ONE) ===
🎣 ADD VALUE: Share specific insight/data they didn't mention
🎣 ASK SMART: Question that makes them think deeper
🎣 CONTRARIAN: Respectfully challenge + offer alternative view
🎣 CONNECT DOTS: Link their point to unexpected implication

=== VOICE RULES ===
📌 SPECIFIC: Numbers, concrete examples, real data
📌 SHORT: 1-2 punchy sentences max
📌 BRAND, NOT PERSONAL: "We've seen..." not "I think..."

CRITICAL RULES:
- NEVER use first-person singular ("I", "my", "me")
- NEVER reference personal experience or years of experience
- Use brand perspective: "We...", "${brandConfig.name}...", "Our..."
- Focus on product philosophy, not personal stories

${hookGuidance ? `Engagement Strategy:\n${hookGuidance}\n` : ''}
Instructions:
- Max 280 characters
- Write in English only
- Add value with brand perspective on AI/privacy/productivity
- Be professional but engaging
- DO NOT paraphrase or repeat the original tweet
${avoidGuidance}

Reply:`;
}

/**
 * 獲取品牌模式的追蹤帳號回覆 prompt
 * @param {Object} brandConfig - 品牌配置
 * @param {string} tweetText - 原推文
 * @param {string} tweetAuthor - 原作者
 * @param {string} categoryGuidance - 類別指導
 * @param {string} avoidList - 避免列表
 * @param {string} includeList - 包含列表
 * @returns {string} prompt
 */
function getBrandTrackedReplyPrompt(brandConfig, tweetText, tweetAuthor, categoryGuidance, avoidList, includeList) {
  return `You are the ${brandConfig.name} brand voice (${brandConfig.handle}), representing an on-device AI assistant company. Write a strategic reply to this influential person's tweet.

Tweet from @${tweetAuthor}: "${tweetText}"

Brand Identity:
- ${brandConfig.tagline}
- Core belief: ${brandConfig.voice}

=== KOL ENGAGEMENT HOOKS (Use ONE) ===
🎣 CHALLENGE: Respectfully offer contrarian view with data
🎣 EXTEND: Build on their point with unexpected angle
🎣 QUESTION: Ask something that makes them want to respond
🎣 SPECIFIC EXAMPLE: Share concrete case that supports/contrasts their point

=== VOICE RULES ===
📌 SPECIFICITY = CREDIBILITY: Numbers, real outcomes, concrete data
📌 SHORT + PUNCHY: 1-2 sentences, strong finish
📌 VALUE-ADD FIRST: Help them look smart, not us
📌 PEAK-END: Memorable close that invites response

CRITICAL RULES:
- NEVER use first-person singular ("I", "my", "me")
- NEVER reference personal experience or founder background
- Use brand perspective: "We...", "${brandConfig.name}...", "Our approach..."
- Represent the company, not an individual

Goal: Get noticed through a thoughtful, valuable brand reply.
${categoryGuidance}

Instructions:
- Max 280 characters
- Write in English only
- Add genuine value from ${brandConfig.name}'s perspective on AI/privacy
- Be professional but not sycophantic
- Ask a thought-provoking question OR share a contrarian insight
- Your reply must add NEW perspective
- Avoid: ${avoidList || 'flattery, self-promotion, generic praise'}
- Include: ${includeList || 'unique perspective, brand values'}

Reply:`;
}

/**
 * 使用 Ollama 生成原創推文
 * @param {string} persona - Persona 內容
 * @param {string} topic - 主題
 * @param {string} apiKey - API Key
 * @param {Object} brandConfig - 品牌配置 (可選，null = 個人模式)
 */
async function generateOriginalTweet(persona, topic, apiKey, brandConfig = null) {
  let prompt;

  // 🏢 品牌模式：使用品牌 prompt
  if (brandConfig && brandConfig.name) {
    console.log(`[INFO] Using BRAND mode for ${brandConfig.name}`);
    prompt = getBrandTweetPrompt(brandConfig, topic);
  } else {
    // 👤 個人模式：使用 Lman prompt (原有邏輯)
    console.log('[INFO] Using PERSONAL mode (Lman)');
    const personaSummary = extractPersonaSummary(persona);

    // 從 204 篇文章分析 + marketing-skills 優化的寫作風格指導
    const styleGuide = `
Lman's Voice (based on 204 Medium articles, 2015-2025):
- Direct, no-nonsense communication
- Focus on practical insights over theory
- Critical thinking, challenge mainstream views
- Natural, conversational tone - NOT formulaic
- Connect technology with business value
- Pragmatic + idealistic mindset

=== HOOK FORMULAS (Use ONE per tweet, vary usage) ===
🎣 CURIOSITY: Create open loops that demand closure
   - "Most founders get [X] wrong. Here's what actually works."
   - "[Counterintuitive fact]. The reason why..."
   - "I've shipped [X products]. The #1 lesson..."

🎣 CONTRARIAN: Challenge accepted wisdom
   - "Everyone says [common belief]. I think the opposite."
   - "[Popular advice] is killing your [outcome]."
   - "Unpopular opinion: [bold statement]"

🎣 STORY: Start mid-action
   - "[Specific moment]. That's when I realized..."
   - "Yesterday I [specific action] and discovered..."
   - "[Time ago], I made a mistake that..."

🎣 VALUE: Promise concrete outcomes
   - "3 things that [improved X] by [Y%]:"
   - "The framework I use to [specific outcome]:"
   - "How to [outcome] in [timeframe]:"

=== VOICE PRINCIPLES ===
📌 SPECIFIC > VAGUE
   ❌ "I've learned a lot from building startups"
   ✅ "Building 3 failed startups taught me: validation before code"

📌 SHORT. BREATHE. LAND.
   ❌ "The thing I've realized after years of experience is that..."
   ✅ "Years of shipping. One truth. Ship small."

📌 SHOW > TELL
   ❌ "I'm passionate about AI"
   ✅ "3am debugging LLM hallucinations. Love this work."

📌 NUMBERS + SPECIFICITY
   ❌ "We improved our metrics"
   ✅ "CAC dropped 43% after killing 3 features"

=== PSYCHOLOGY TRIGGERS ===
🧠 Jobs to Be Done: Focus on OUTCOME, not feature
🧠 Mere Exposure: Consistency > virality (7+ touches)
🧠 Peak-End Rule: Strong opening + memorable close
🧠 Curiosity Gap: Open loop → valuable insight → close loop
🧠 Specificity: Concrete details = credibility

Writing Style:
- Start naturally - NO fixed templates or patterns
- Vary your openings: direct statements, observations, insights, questions
- Share perspectives without forced structures
- Be authentic and spontaneous, like a real conversation
- Mix long and short sentences for natural rhythm

CRITICAL RULES:
🚨 NEVER use formulaic openings like:
   - "Have you ever wondered..."
   - "From what I've observed over the years..."
   - "What we'll see next is..."
   - "The real question is..."
   - "After X years of building..."

🚨 IrisGo Mention Rules:
   - Topic category determines if you can mention IrisGo
   - If topic is "industry" (40%) or "personal" (25%) or "technical" (15%): DO NOT mention IrisGo
   - ONLY mention IrisGo if topic category is "product" (20%)
   - Even for product topics, be subtle - not every sentence needs "IrisGo.AI"
   - Most tweets should be about IDEAS, not company promotion

🚨 NEVER EXPOSE AUTOMATION:
   - Never mention: "scheduled tweets", "automation", "content calendar", "bot"
   - Sound human: "I type fast when caffeinated", "Just in the zone"
   - Users expect to talk to Lman the person, NOT a bot

✅ DO:
- Start with fresh, varied openings each time
- Use ONE hook formula per tweet (vary which one)
- Be SPECIFIC: numbers, names, concrete details
- SHORT sentences. Let ideas breathe.
- Focus on IDEAS and INSIGHTS, not self-promotion
- Write like you're tweeting spontaneously, not from a script
`;

    prompt = `Write a tweet as Lman (Tech Entrepreneur, Blockchain & AI Thought Leader).

${styleGuide}

Topic: ${topic}

CRITICAL - Content Focus:
- This is a tweet about IDEAS and INSIGHTS, not company promotion
- Start naturally - NO formulaic openings
- Be conversational like you're sharing a thought spontaneously
- Vary your sentence structure and rhythm

Requirements:
- Max 280 characters
- Write in BOTH English AND Traditional Chinese (雙語): English first, then Chinese translation on new line
- NO hashtags, minimal emojis
- Direct and authentic tone
- Business insight + technical depth
- Challenge common assumptions when relevant
- Sound like a real person sharing a spontaneous thought

Output ONLY the tweet text, nothing else:`;
  }

  // 載入最近發文，用於重複檢測
  const config = require('./config');
  const recentPosts = loadRecentPosts(config.PATHS.posted_tweets, 30);

  // 最多重試 3 次，直到生成不重複的內容
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await callGeminiAPI(prompt, apiKey);
      const cleaned = cleanContent(response);

      if (!cleaned) {
        console.log(`[WARN] Attempt ${attempt}: Generated content invalid, retrying...`);
        continue;
      }

      // 檢查是否與最近發文重複
      if (isContentDuplicate(cleaned, recentPosts, 0.6)) {
        console.log(`[WARN] Attempt ${attempt}: Content duplicate detected, regenerating...`);
        continue;
      }

      console.log(`[SUCCESS] Unique content generated on attempt ${attempt}`);
      return cleaned;

    } catch (error) {
      console.error(`[ERROR] Attempt ${attempt} failed:`, error.message);
      if (attempt === MAX_RETRIES) {
        return null;
      }
    }
  }

  console.log('[ERROR] All retry attempts failed to generate unique content');
  return null;
}

// ========================================
// 🎯 相關性檢查 (Relevance Filtering)
// ========================================

/**
 * 我們可以有意義回覆的領域關鍵詞
 * 如果原推文不包含這些關鍵詞，就跳過回覆
 */
const EXPERTISE_KEYWORDS = {
  // AI/Tech 核心領域
  ai: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'gpt', 'claude', 'gemini', 'chatgpt', 'deep learning', 'neural', 'model', 'inference', 'training', 'fine-tune', 'rag', 'embedding', 'transformer', 'agent', 'copilot'],

  // 創業與商業
  startup: ['startup', 'founder', 'entrepreneur', 'vc', 'venture', 'funding', 'seed', 'series', 'bootstrapp', 'pivot', 'pmf', 'product market fit', 'gtm', 'go to market', 'mvp', 'saas', 'b2b', 'b2c'],

  // 產品與工程 (注意：移除 'pm' 避免匹配時間格式如 "3:00 PM")
  product: ['product', 'product manager', 'product management', 'roadmap', 'feature', 'user experience', 'ux', 'ui', 'design', 'engineer', 'developer', 'dev', 'code', 'programming', 'software', 'app', 'platform', 'api', 'sdk'],

  // 基礎設施
  infra: ['infrastructure', 'cloud', 'aws', 'gcp', 'azure', 'kubernetes', 'k8s', 'docker', 'container', 'devops', 'sre', 'observability', 'monitoring', 'deployment', 'ci/cd', 'pipeline', 'linux', 'server', 'network', 'edge', 'on-premise', 'on-device', 'local-first'],

  // 隱私與安全
  privacy: ['privacy', 'security', 'data protection', 'gdpr', 'encryption', 'on-device', 'local', 'private', 'secure'],

  // Web3/Blockchain (較低優先)
  web3: ['blockchain', 'web3', 'crypto', 'defi', 'nft', 'token', 'smart contract', 'decentralized'],

  // 生產力工具
  productivity: ['productivity', 'workflow', 'automation', 'tool', 'notion', 'obsidian', 'pkm', 'knowledge management', 'second brain']
};

/**
 * 檢查原推文是否在我們的專業領域內
 * @param {string} tweetText - 原推文內容
 * @returns {{isRelevant: boolean, matchedDomain: string|null, matchedKeywords: string[]}}
 */
function isRelevantToExpertise(tweetText) {
  if (!tweetText) {
    return { isRelevant: false, matchedDomain: null, matchedKeywords: [] };
  }

  const lowerText = tweetText.toLowerCase();
  const matchedKeywords = [];
  let matchedDomain = null;

  for (const [domain, keywords] of Object.entries(EXPERTISE_KEYWORDS)) {
    for (const keyword of keywords) {
      // 使用 word boundary 避免部分匹配 (例如 "ai" 匹配 "fair")
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lowerText)) {
        matchedKeywords.push(keyword);
        if (!matchedDomain) matchedDomain = domain;
      }
    }
  }

  const isRelevant = matchedKeywords.length > 0;

  if (isRelevant) {
    console.log(`[RELEVANCE] ✓ Tweet relevant to "${matchedDomain}" domain. Keywords: ${matchedKeywords.slice(0, 3).join(', ')}`);
  } else {
    console.log(`[RELEVANCE] ✗ Tweet NOT in expertise area. Skipping reply.`);
  }

  return { isRelevant, matchedDomain, matchedKeywords };
}

/**
 * 偵測原推文的意圖
 * @param {string} tweetText - 原推文
 * @returns {{intent: string, requiresAnswer: boolean, sentiment: string}}
 */
function detectTweetIntent(tweetText) {
  if (!tweetText) return { intent: 'unknown', requiresAnswer: false, sentiment: 'neutral' };

  const lowerText = tweetText.toLowerCase();

  // 問句偵測
  const questionPatterns = [
    /\?/,                                    // 直接問號
    /anyone (have|know|use|recommend)/i,     // anyone have/know/use
    /what .* (use|recommend|suggest)/i,      // what do you use
    /which .* (better|best|recommend)/i,     // which is better
    /any (suggestion|recommendation)/i,      // any suggestions
    /looking for/i,                          // looking for
    /need .* (help|advice|recommendation)/i, // need help
    /can anyone/i,                           // can anyone
    /does anyone/i,                          // does anyone
    /how do (you|i|we)/i,                    // how do you
  ];

  const isQuestion = questionPatterns.some(p => p.test(lowerText));

  // 抱怨/負面情緒偵測
  const complaintPatterns = [
    /\b(sucks?|terrible|awful|horrible|hate|annoying|frustrat|confus|junk|garbage|trash|worst|broken|buggy)\b/i,
    /\b(kinda jank|so confusing|really bad|pretty bad|so bad)\b/i,
    /\b(can't stand|fed up|giving up|done with)\b/i,
  ];

  const isComplaint = complaintPatterns.some(p => p.test(lowerText));

  // 求推薦偵測
  const recommendPatterns = [
    /recommend/i,
    /suggest/i,
    /alternative/i,
    /what .* (use|try)/i,
    /anyone (have|know) .* (good|better)/i,
  ];

  const isSeekingRecommendation = recommendPatterns.some(p => p.test(lowerText));

  // 決定意圖
  let intent = 'statement';
  let requiresAnswer = false;

  if (isQuestion || isSeekingRecommendation) {
    intent = 'question';
    requiresAnswer = true;
  } else if (isComplaint) {
    intent = 'complaint';
  }

  // 決定情緒
  let sentiment = 'neutral';
  if (isComplaint) sentiment = 'negative';

  console.log(`[INTENT] Detected: intent=${intent}, requiresAnswer=${requiresAnswer}, sentiment=${sentiment}`);

  return { intent, requiresAnswer, sentiment };
}

/**
 * 檢查回覆是否正確回應了問題
 * @param {string} originalTweet - 原推文
 * @param {string} generatedReply - 生成的回覆
 * @param {Object} intentInfo - 意圖資訊
 * @returns {boolean}
 */
function doesReplyAnswerQuestion(originalTweet, generatedReply, intentInfo) {
  if (!intentInfo.requiresAnswer) return true; // 不需要回答的就通過

  const replyLower = generatedReply.toLowerCase();

  // 檢查是否有具體回答的跡象
  const answerIndicators = [
    /\b(try|use|recommend|suggest|check out|go with|prefer|like|love)\b/i,  // 推薦動詞
    /\b(google|notion|excel|airtable|coda|numbers|sheets)\b/i,              // 具體產品名
    /\b(i use|i'd suggest|i recommend|have you tried|you could try)\b/i,    // 回答句式
    /\b(works great|works well|much better|way better)\b/i,                 // 評價
  ];

  const hasAnswer = answerIndicators.some(p => p.test(replyLower));

  // 檢查是否只是空泛讚美（答非所問的典型模式）
  const genericPraisePatterns = [
    /\b(unsung hero|so important|absolutely|totally agree|great point)\b/i,
    /\b(love .* about|beautiful thing|wonderful|amazing)\b/i,
    /\b(tell stories|capture data|organization|productivity)\b/i, // 泛泛而談
  ];

  const isGenericPraise = genericPraisePatterns.some(p => p.test(replyLower));

  // 如果原文在問問題/求推薦，但回覆只有空泛讚美，拒絕
  if (!hasAnswer && isGenericPraise) {
    console.log(`[INTENT] ✗ Original asks question but reply is generic praise. Rejecting.`);
    return false;
  }

  // 如果原文在抱怨，但回覆是正面讚美（情緒不匹配），拒絕
  if (intentInfo.sentiment === 'negative' && isGenericPraise) {
    console.log(`[INTENT] ✗ Original is complaint but reply is praise. Tone mismatch. Rejecting.`);
    return false;
  }

  if (hasAnswer) {
    console.log(`[INTENT] ✓ Reply contains concrete answer/recommendation.`);
  }

  return true;
}

/**
 * 檢查生成的回覆是否與原推文相關
 * @param {string} originalTweet - 原推文
 * @param {string} generatedReply - 生成的回覆
 * @returns {boolean} true 如果相關
 */
function isReplyRelevant(originalTweet, generatedReply) {
  if (!originalTweet || !generatedReply) return false;

  // 🎯 Step 1: 意圖檢查 - 確保回覆正確回應原文意圖
  const intentInfo = detectTweetIntent(originalTweet);
  if (!doesReplyAnswerQuestion(originalTweet, generatedReply, intentInfo)) {
    return false;
  }

  // 提取原推文的關鍵詞 (長度 > 3 的單詞)
  const originalWords = new Set(
    originalTweet.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean)
  );

  const replyWords = new Set(
    generatedReply.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean)
  );

  // 計算交集
  const intersection = [...originalWords].filter(w => replyWords.has(w));

  // 如果沒有任何共同詞彙，且回覆沒有提到任何專業領域，則視為不相關
  if (intersection.length === 0) {
    // 檢查回覆是否至少提到了專業領域
    const replyLower = generatedReply.toLowerCase();
    let hasExpertiseMention = false;

    for (const keywords of Object.values(EXPERTISE_KEYWORDS)) {
      for (const kw of keywords) {
        if (replyLower.includes(kw)) {
          hasExpertiseMention = true;
          break;
        }
      }
      if (hasExpertiseMention) break;
    }

    // 如果回覆既沒有與原文共同詞彙，也沒有專業領域詞彙，則不相關
    // 但如果原文本身就是專業領域的討論，則允許專業領域的回覆
    const { isRelevant: originalIsRelevant } = isRelevantToExpertise(originalTweet);

    if (!hasExpertiseMention && !originalIsRelevant) {
      console.log(`[RELEVANCE] ✗ Reply has no connection to original tweet. Rejecting.`);
      return false;
    }
  }

  // 計算相似度分數
  const similarityScore = intersection.length / Math.min(originalWords.size, replyWords.size);

  // 如果相似度太低 (< 0.1) 且沒有任何專業領域關聯，拒絕
  if (similarityScore < 0.1 && intersection.length < 2) {
    const { isRelevant: originalIsRelevant } = isRelevantToExpertise(originalTweet);
    if (!originalIsRelevant) {
      console.log(`[RELEVANCE] ✗ Reply too generic (similarity: ${(similarityScore * 100).toFixed(1)}%). Rejecting.`);
      return false;
    }
  }

  console.log(`[RELEVANCE] ✓ Reply relevant (shared words: ${intersection.slice(0, 5).join(', ')})`);
  return true;
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
 * @param {string} tweetText - 原推文
 * @param {string} tweetAuthor - 原作者
 * @param {string} persona - Persona 內容
 * @param {string} apiKey - API Key
 * @param {Object} engagementHooks - engagement hook 配置
 * @param {Object} brandConfig - 品牌配置 (可選，null = 個人模式)
 */
async function generateReply(tweetText, tweetAuthor, persona, apiKey, engagementHooks = null, brandConfig = null) {
  // 先檢查原推文是否為不當內容
  if (isInappropriateContent(tweetText)) {
    console.log(`[SKIP] Skipping reply to inappropriate content from @${tweetAuthor}`);
    return null;
  }

  // 🎯 相關性預檢：確保原推文在我們的專業領域內
  const { isRelevant, matchedDomain, matchedKeywords } = isRelevantToExpertise(tweetText);
  if (!isRelevant) {
    console.log(`[SKIP] Tweet from @${tweetAuthor} not in expertise area. Cannot add value.`);
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

  let prompt;

  // 🏢 品牌模式：使用品牌 prompt
  if (brandConfig && brandConfig.name) {
    console.log(`[INFO] Using BRAND mode for reply (${brandConfig.name})`);
    prompt = getBrandReplyPrompt(brandConfig, tweetText, tweetAuthor, hookGuidance, avoidGuidance);
  } else {
    // 👤 個人模式：使用 Lman prompt (原有邏輯)
    console.log('[INFO] Using PERSONAL mode for reply (Lman)');

    // 🎯 偵測原推文意圖，提供給 AI 參考
    const intentInfo = detectTweetIntent(tweetText);
    let intentGuidance = '';

    if (intentInfo.requiresAnswer) {
      intentGuidance = `
⚠️ CRITICAL: The original tweet is ASKING A QUESTION or SEEKING RECOMMENDATIONS.
You MUST provide a concrete answer, suggestion, or recommendation.
DO NOT give generic praise or philosophical musings.
Example: If they ask "what spreadsheet do you use?", answer with actual tools (Google Sheets, Notion, etc.)`;
    } else if (intentInfo.sentiment === 'negative') {
      intentGuidance = `
⚠️ CRITICAL: The original tweet expresses FRUSTRATION or COMPLAINT.
DO NOT respond with generic positive praise - it will seem tone-deaf.
Instead: empathize, offer solutions, or share similar experiences.`;
    }

    prompt = `You are Lman, a tech entrepreneur and AI expert. Write a reply to this tweet.

Tweet from @${tweetAuthor}: "${tweetText}"

=== STEP 1: UNDERSTAND THE TWEET (DO THIS FIRST) ===
Before writing, identify:
1. What is the person's INTENT? (asking question? complaining? sharing? discussing?)
2. What do they NEED? (answer? empathy? validation? discussion?)
3. What would be HELPFUL to them?

${intentGuidance}

=== STEP 2: REPLY HOOKS (Use ONE) ===
🎣 ANSWER: If they ask a question, ANSWER IT with specific recommendations
🎣 EMPATHIZE: If they're frustrated, acknowledge it and offer help
🎣 ADD VALUE: Share specific insight/data/experience they missed
🎣 QUESTION: Ask something that invites deeper conversation

=== VOICE RULES ===
📌 SPECIFIC > VAGUE: "I cut churn 40% by..." not "This is so true!"
📌 ANSWER QUESTIONS: If they ask, give a real answer with specifics
📌 MATCH TONE: Don't praise when they're complaining
📌 SHORT: 1-2 punchy sentences. Let it land.

CRITICAL - NEVER EXPOSE AUTOMATION:
🚨 NEVER mention: "scheduled", "automation", "bot", "content calendar", "time zones"
✅ Sound human and natural - use casual expressions, emotions, personal touch

Engagement Strategy (${hookPattern.replace(/_/g, ' ')}):
${hookGuidance}

Instructions:
- FIRST understand what they're asking/saying, THEN respond appropriately
- If they ask for recommendations, give specific product/tool names
- If they're complaining, empathize or offer solutions
- Max 280 characters
- Write in BOTH English AND Traditional Chinese (雙語): English first, then Chinese translation on new line
- Be conversational and add value
- Technical but friendly
- DO NOT give generic praise to questions/complaints
- Your reply must DIRECTLY ADDRESS what they said
${avoidGuidance}

Reply:`;
  }

  // 最多重試 2 次，確保生成相關的回覆
  const MAX_RELEVANCE_RETRIES = 2;

  for (let attempt = 1; attempt <= MAX_RELEVANCE_RETRIES; attempt++) {
    try {
      const response = await callGeminiAPI(prompt, apiKey);
      let cleaned = cleanContent(response);

      // ✅ 如果 cleanContent 失敗，直接用 OpenAI 重試
      if (!cleaned || cleaned.length < 10) {
        console.log('[WARN] cleanContent failed, retrying with OpenAI directly...');
        cleaned = await callOpenAIDirect(prompt);
      }

      if (!cleaned) continue;

      // 🎯 相關性後驗：確保生成的回覆與原推文相關
      if (!isReplyRelevant(tweetText, cleaned)) {
        console.log(`[WARN] Attempt ${attempt}: Generated reply not relevant to original tweet, retrying...`);
        continue;
      }

      console.log(`[SUCCESS] Relevant reply generated on attempt ${attempt}`);
      return cleaned;

    } catch (error) {
      console.error(`Error generating reply (attempt ${attempt}):`, error.message);

      // 最後一次嘗試 OpenAI
      if (attempt === MAX_RELEVANCE_RETRIES) {
        try {
          console.log('[WARN] Final attempt with OpenAI...');
          const openaiReply = await callOpenAIDirect(prompt);
          if (openaiReply && isReplyRelevant(tweetText, openaiReply)) {
            return openaiReply;
          }
        } catch (e) {
          console.error('OpenAI fallback also failed:', e.message);
        }
      }
    }
  }

  console.log('[ERROR] Failed to generate relevant reply after all attempts');
  return null;
}

/**
 * 調用 CLIProxyAPI (用於 content extraction 失敗時)
 * CLIProxyAPI 統一代理 Gemini OAuth / OpenAI，繞過 Free Tier 限制
 */
async function callOpenAIDirect(prompt) {
  // 優先使用 CLIProxyAPI (gemini-2.5-flash via OAuth)
  const proxyUrl = process.env.CLIPROXY_URL || 'http://127.0.0.1:8317';
  const proxyKey = process.env.CLIPROXY_API_KEY || 'magi-proxy-key-2026';

  const payload = {
    model: 'gemini-2.5-flash',  // OAuth 模型，繞過 Free Tier
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 200
  };

  try {
    const proxyCommand = `curl -s -X POST '${proxyUrl}/v1/chat/completions' \
      -H 'Content-Type: application/json' \
      -H 'Authorization: Bearer ${proxyKey}' \
      -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}'`;

    const proxyResponse = execSync(proxyCommand, { encoding: 'utf-8', timeout: 30000 });
    const proxyData = JSON.parse(proxyResponse);

    if (proxyData.choices && proxyData.choices[0]?.message?.content) {
      console.log('[INFO] ✅ Using CLIProxyAPI gemini-2.5-flash (OAuth fallback)');
      return proxyData.choices[0].message.content.trim();
    }
  } catch (proxyError) {
    console.log(`[WARN] CLIProxyAPI failed: ${proxyError.message}, trying OpenAI...`);
  }

  // Fallback: 直接 OpenAI (保留作為最後手段)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return null;

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
    console.log('[INFO] ✅ Using OpenAI gpt-4o-mini (final fallback)');
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

CRITICAL - NEVER EXPOSE AUTOMATION:
🚨 NEVER mention automation, bots, or scheduled posting
✅ Sound like a genuine fan reacting naturally and spontaneously

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
 * @param {string} tweetText - 原推文
 * @param {string} tweetAuthor - 原作者
 * @param {string} persona - Persona 內容
 * @param {string} apiKey - API Key
 * @param {Object} trackedConfig - 追蹤帳號配置
 * @param {string} category - 帳號類別
 * @param {Object} brandConfig - 品牌配置 (可選，null = 個人模式)
 */
async function generateTrackedReply(tweetText, tweetAuthor, persona, apiKey, trackedConfig, category, brandConfig = null) {
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

  let prompt;

  // 🏢 品牌模式：使用品牌 prompt
  if (brandConfig && brandConfig.name) {
    console.log(`[INFO] Using BRAND mode for tracked reply (${brandConfig.name})`);
    prompt = getBrandTrackedReplyPrompt(brandConfig, tweetText, tweetAuthor, categoryGuidance, avoidList, includeList);
  } else {
    // 👤 個人模式：使用 Lman prompt (原有邏輯)
    console.log('[INFO] Using PERSONAL mode for tracked reply (Lman)');
    prompt = `You are Lman, CoFounder of IrisGo.AI (on-device AI assistant). Write a strategic reply to this influential person's tweet.

Tweet from @${tweetAuthor}: "${tweetText}"

=== KOL ENGAGEMENT HOOKS (Use ONE - get noticed!) ===
🎣 CHALLENGE: Respectfully push back with data/insight ("Actually, I've found...")
🎣 EXTEND: Build on their point with unexpected angle they didn't consider
🎣 QUESTION: Ask something that makes them think + want to respond
🎣 SPECIFIC EXAMPLE: Share concrete experience that supports/contrasts their view

=== VOICE RULES (CRITICAL) ===
📌 SPECIFICITY = CREDIBILITY: "Our CAC dropped 43%" not "We improved metrics"
📌 SHORT + PUNCHY: 1-2 sentences max. Strong finish.
📌 VALUE-ADD FIRST: Make THEM look smart, not yourself
📌 PEAK-END RULE: End with hook that invites response

CRITICAL - NEVER EXPOSE AUTOMATION:
🚨 NEVER mention: "scheduled", "automation", "bot", "posting system", "time zones"
✅ Sound like a real person engaging naturally - human, authentic, spontaneous

Goal: Get noticed by this person through a thoughtful, valuable reply.
${categoryGuidance}

Instructions:
- Max 280 characters
- Write in BOTH English AND Traditional Chinese (雙語): English first, then Chinese translation on new line
- Use ONE hook formula above
- Add genuine value - share a unique insight or perspective
- Be professional but not sycophantic
- Show expertise without being arrogant
- Ask a thought-provoking question OR share a contrarian insight
- DO NOT repeat or paraphrase the original tweet
- Your reply must be SUBSTANTIALLY DIFFERENT - add your own angle
- Avoid: ${avoidList || 'flattery, self-promotion, generic praise'}
- Include: ${includeList || 'unique perspective, relevant experience'}

Reply:`;
  }

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
  // ========================================
  // 🔄 AI Model Priority (2026-01-26 更新)
  // ========================================
  // 1. CLIProxyAPI (gemini-2.5-flash via OAuth) - 主要
  // 2. Ollama (gpt-oss:20b → qwen3-coder:30b) - Fallback
  // 3. OpenAI (gpt-4o-mini) - 最終 Fallback

  // ========================================
  // 1️⃣ Primary: CLIProxyAPI (gemini-2.5-flash via OAuth)
  // ========================================
  const proxyUrl = process.env.CLIPROXY_URL || 'http://127.0.0.1:8317';
  const proxyKey = process.env.CLIPROXY_API_KEY || 'magi-proxy-key-2026';

  try {
    const proxyPayload = {
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 200
    };

    const proxyCommand = `curl -s -X POST '${proxyUrl}/v1/chat/completions' \
      -H 'Content-Type: application/json' \
      -H 'Authorization: Bearer ${proxyKey}' \
      -d '${JSON.stringify(proxyPayload).replace(/'/g, "'\\''")}'`;

    const proxyResponse = execSync(proxyCommand, { encoding: 'utf-8', timeout: 30000 });
    const proxyData = JSON.parse(proxyResponse);

    if (proxyData.choices && proxyData.choices[0]?.message?.content) {
      console.log('[INFO] ✅ Using model: CLIProxyAPI gemini-2.5-flash (OAuth primary)');
      return proxyData.choices[0].message.content;
    }
    throw new Error('No valid response from CLIProxyAPI');
  } catch (proxyError) {
    console.log(`[WARN] CLIProxyAPI failed: ${proxyError.message}, trying Ollama...`);
  }

  // ========================================
  // 2️⃣ Fallback 1: Ollama (local models)
  // ========================================
  const ollamaUrl = 'http://localhost:11434/api/generate';
  const ollamaModels = ['gpt-oss:20b', 'qwen3-coder:30b'];

  for (const model of ollamaModels) {
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

      const command = `curl -s -X POST '${ollamaUrl}' \
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
        console.log(`[INFO] Using model: Ollama ${model} (fallback)`);
        return data.thinking;
      } else if (data.response) {
        console.log(`[INFO] Using model: Ollama ${model} (fallback)`);
        return data.response;
      }

      throw new Error('No valid response from model');

    } catch (error) {
      console.log(`[WARN] Ollama ${model} failed: ${error.message}, trying next...`);
      continue;
    }
  }

  // ========================================
  // 3️⃣ Fallback 2: OpenAI (gpt-4o-mini)
  // ========================================
  console.log('[WARN] All Ollama models failed, trying OpenAI...');

  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error('No OpenAI API key');

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
      console.log('[INFO] Using model: OpenAI gpt-4o-mini (final fallback)');
      return openaiData.choices[0].message.content;
    }

    throw new Error('No valid response from OpenAI');
  } catch (openaiError) {
    console.log(`[ERROR] All fallbacks failed: ${openaiError.message}`);
    throw new Error('All AI models failed (CLIProxyAPI + Ollama + OpenAI)');
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
    'We need to produce',
    'We need to create',
    // Brand prompt 洩漏
    'brand voice',
    'On-Device AI Butler',
    'no first-person',
    'no corporate jargon',
    'no mention of founder',
    'challenge mainstream',
    'product philosophy',
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
  isInappropriateContent,
  // 重複檢測相關
  calculateSimilarity,
  loadRecentPosts,
  isContentDuplicate,
  extractOpeningPattern,
  isOpeningPatternOverused,
  usesBannedOpening,
  BANNED_OPENING_PATTERNS,
  containsOverusedPhrases,
  OVERUSED_PHRASES,
  // 相關性檢查
  isRelevantToExpertise,
  isReplyRelevant,
  EXPERTISE_KEYWORDS,
  // 意圖辨識 (2026-02-03 新增)
  detectTweetIntent,
  doesReplyAnswerQuestion,
  // 知識庫載入
  loadKnowledgeBase
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
