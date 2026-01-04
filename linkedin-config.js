#!/usr/bin/env node

/**
 * LinkedIn Curator Configuration
 * 用戶可修改的配置參數
 */

require('dotenv').config();

module.exports = {
  // ========================================
  // 🎯 核心配置
  // ========================================

  // Persona 文件路徑
  PERSONA_FILE: process.env.PERSONA_FILE || '/Users/lman/Dropbox/PKM-Vault/0-Inbox/Lman-Deep-Persona-Profile.md',

  // Gemini API Key (實際使用 Ollama 本地模型)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

  // ========================================
  // ⏰ 時間配置
  // ========================================

  // LinkedIn 最佳發文時段
  OPTIMAL_HOURS: {
    morning: [9, 10, 11],      // 早上 9-11 點
    afternoon: [14, 15, 16],   // 下午 2-4 點
    evening: [18, 19]          // 傍晚 6-7 點
  },

  // ========================================
  // 📊 頻率配置
  // ========================================

  // 每日發文數量
  DAILY_POSTS: 3,

  // 每日回覆數量（提升曝光）
  DAILY_REPLIES: 10,

  // ========================================
  // 🎨 內容配置
  // ========================================

  // ========================================
  // 📚 LinkedIn 主題分類系統（加權選擇）
  // ========================================
  //
  // 分類比例設計：
  // - industry (40%): 產業觀察，不提公司
  // - personal (25%): 個人洞察與成長
  // - product (20%): 可提 IrisGo
  // - technical (15%): 技術深度
  //
  TOPIC_CATEGORIES: {
    // 產業觀察類 (40%) - 不提 IrisGo
    industry: {
      weight: 40,
      topics: [
        'AI industry trends and observations',
        'The future of knowledge work',
        'Enterprise AI adoption challenges',
        'Consumer AI vs Enterprise AI',
        'Why most AI products fail',
        'Startup lessons from the trenches',
        'Tech industry observations',
        'The hype cycle in AI',
        'Remote work productivity insights',
        'What big tech gets wrong about AI'
      ]
    },

    // 個人洞察類 (25%) - 不提 IrisGo
    personal: {
      weight: 25,
      topics: [
        'Lessons from startup failures',
        'Founder mental health and burnout',
        'Productivity systems that actually work',
        'Continuous learning strategies',
        'Reading recommendations for tech leaders',
        'Work-life integration (not balance)',
        'Decision-making frameworks',
        'Historical parallels in technology',
        'Philosophy of technology',
        'Critical thinking in the AI age'
      ]
    },

    // 產品相關類 (20%) - 可以提 IrisGo
    product: {
      weight: 20,
      topics: [
        'Building privacy-first AI products',
        'On-premise AI for consumers',
        'Personal AI assistants evolution',
        'IrisGo.AI product journey',
        'Privacy-first personal productivity',
        'Local-first AI tools'
      ]
    },

    // 技術深度類 (15%) - 專家視角
    technical: {
      weight: 15,
      topics: [
        'LLM deployment strategies',
        'Edge AI vs cloud AI tradeoffs',
        'Local-first software architecture',
        'AI PC ecosystem analysis',
        'On-device inference challenges',
        'Privacy-preserving AI techniques'
      ]
    }
  },

  // 選擇主題的函數（在 linkedin-curator.js 中使用）
  // 使用方法: selectWeightedTopic(config.TOPIC_CATEGORIES)
  //
  // 舊版 TOPICS 保留用於向後兼容
  TOPICS: [
    // 產業觀察 (40%)
    'AI industry trends and observations',
    'The future of knowledge work',
    'Enterprise AI adoption challenges',
    'Consumer AI vs Enterprise AI',
    'Why most AI products fail',
    'Startup lessons from the trenches',
    'Tech industry observations',
    'Remote work productivity insights',

    // 個人洞察 (25%)
    'Lessons from startup failures',
    'Founder mental health and burnout',
    'Productivity systems that actually work',
    'Continuous learning strategies',
    'Work-life integration',
    'Decision-making frameworks',

    // 產品相關 (20%) - 可提 IrisGo
    'Building privacy-first AI products',
    'On-premise AI for consumers',
    'Personal AI assistants evolution',

    // 技術深度 (15%)
    'LLM deployment strategies',
    'Edge AI vs cloud AI tradeoffs',
    'Local-first software architecture'
  ],

  // 內容長度（LinkedIn 獎勵 dwell time，越長越好）
  CONTENT_LENGTH: {
    min: 500,
    max: 3000,
    ideal: 1800    // LinkedIn sweet spot for engagement
  },

  // 語言設定
  LANGUAGE: 'en',  // 僅英文

  // 內容風格（LinkedIn 更專業）
  STYLE: {
    tone: 'professional_conversational',  // 專業但對話式
    technical_depth: 'medium_to_high',    // 中到高技術深度
    use_analogies: true,                  // 使用類比
    use_hashtags: true,                   // LinkedIn 使用 hashtags
    hashtag_count: 3,                     // 3-5 個 hashtags
    use_emojis: 'moderate',               // 適量 emoji
    personal_insights: true,              // 分享個人洞察
    include_call_to_action: true,         // 包含 CTA
    post_structure: 'hook_body_cta'       // Hook → Body → CTA
  },

  // ========================================
  // 🔍 搜尋與篩選配置
  // ========================================

  // LinkedIn 搜尋關鍵詞（面向消費者與知識工作者）
  SEARCH_KEYWORDS: [
    'personal ai assistant',
    'ai productivity',
    'knowledge worker',
    'personal productivity',
    'ai tools',
    'consumer ai',
    'work life balance',
    'remote work',
    'personal knowledge management',
    'ai for everyone'
  ],

  // 回覆篩選條件（放寬條件以增加回覆機會）
  REPLY_FILTERS: {
    // 優先回覆的作者類型
    priority_authors: [
      'verified',          // 已驗證帳號
      'influencer',        // 影響力人士
      'relevant_field'     // 相關領域專家
    ],

    // 必須包含的關鍵詞（至少一個）- 擴大範圍
    include_keywords: [
      // AI 相關
      'ai', 'artificial intelligence', 'machine learning', 'llm', 'gpt', 'claude',
      'chatgpt', 'copilot', 'automation', 'agent',
      // 生產力
      'productivity', 'workflow', 'efficiency', 'time management',
      // 創業/職場
      'startup', 'founder', 'entrepreneur', 'product', 'tech', 'innovation',
      'leadership', 'career', 'work', 'team',
      // 寬泛主題
      'future', 'trend', 'insight', 'lesson', 'learning', 'growth'
    ],

    // 排除的關鍵詞
    exclude_keywords: [
      'buy now', 'click here', 'dm me',
      'check out my course', 'limited time offer',
      'crypto trading', 'get rich quick',
      'hiring', 'job opening', 'we are hiring'  // 避免回覆招聘帖
    ],

    // 最小互動數
    min_engagement: {
      likes: 10,
      comments: 2
    }
  },

  // ========================================
  // 🛡️ 安全限制
  // ========================================

  // 每日限制（LinkedIn 較保守但可提高）
  DAILY_LIMITS: {
    max_posts: 3,       // 每日最多 3 則發文
    max_replies: 12,    // 每日最多 12 則回覆
    max_total: 15       // LinkedIn 每日總限制
  },

  // 延遲設定（毫秒）- LinkedIn 需要更長延遲
  DELAYS: {
    min: 5000,          // 最小 5 秒
    max: 15000,         // 最大 15 秒
    between_actions: 10000,  // 動作間延遲 10 秒
    after_post: 30000,  // 發文後等待 30 秒
    after_reply: 20000  // 回覆後等待 20 秒
  },

  // ========================================
  // 📁 檔案路徑
  // ========================================

  PATHS: {
    posted: '/Users/lman/twitter-curator/posted-linkedin.json',
    replied: '/Users/lman/twitter-curator/replied-linkedin.json',
    daily_stats: '/Users/lman/twitter-curator/daily-linkedin-stats.json',
    logs: '/Users/lman/twitter-curator/linkedin-curator.log',
    errors: '/Users/lman/twitter-curator/linkedin-curator.error.log',
    tracked_accounts: '/Users/lman/Dropbox/PKM-Vault/0-Inbox/Tracked-Accounts.md'
  },

  // ========================================
  // 🎯 追蹤帳號設定
  // ========================================
  //
  // 從 tracked-accounts.md 讀取的帳號會被優先回覆
  // 這些是你想讓他們注意到你的帳號（VCs、意見領袖等）
  //
  TRACKED_ACCOUNTS: {
    enabled: true,
    // 追蹤帳號回覆比例（每 N 則回覆有 1 則是追蹤帳號）
    ratio: 2,  // 50% 的回覆會針對追蹤帳號
    // 回覆風格
    reply_style: {
      tone: 'professional_insightful',  // 專業有見解
      approach: 'add_value',  // 增加價值
      avoid: ['sycophancy', 'self_promotion', 'generic_praise'],
      include: ['unique_perspective', 'relevant_experience', 'thoughtful_question']
    }
  },

  // ========================================
  // 🧪 測試模式
  // ========================================

  DRY_RUN: process.env.DRY_RUN === 'true',  // 測試模式（不實際發送）
  HEADLESS: process.env.HEADLESS !== 'false', // 無頭模式

  // ========================================
  // 🎯 LinkedIn 特定配置
  // ========================================

  // LinkedIn URLs
  LINKEDIN_URLS: {
    home: 'https://www.linkedin.com/feed/',
    search: 'https://www.linkedin.com/search/results/content/',
    profile: 'https://www.linkedin.com/in/lmanchu/'
  },

  // LinkedIn Selectors (updated Dec 2025 - multiple fallbacks for UI changes)
  SELECTORS: {
    // 發文相關
    startPostButton: [
      '[aria-label*="Start a post"]',
      'button.share-box-feed-entry__trigger',
      '[data-test-icon="create-post"]'
    ],
    postEditor: '.ql-editor',
    postButton: '[data-test-modal-id="share-box-post-button"]',

    // 搜尋與回覆相關
    searchBox: 'input.search-global-typeahead__input',
    postCard: [
      '.feed-shared-update-v2',
      '[data-urn*="activity"]',
      '.update-components-actor'
    ],
    commentButton: [
      'button[aria-label*="Comment"]',
      'button[aria-label*="comment"]',
      '[data-test-icon="comment-medium"]',
      'button.comment-button',
      'span.social-actions-button'
    ],
    commentBox: [
      '.ql-editor[contenteditable="true"]',
      '[data-placeholder*="Add a comment"]',
      '.comments-comment-box__form-container [contenteditable="true"]',
      '.comments-comment-texteditor [contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]'
    ],
    commentSubmitButton: [
      'button.comments-comment-box__submit-button',
      'button[data-test-icon="send-privately-small"]',
      'button.artdeco-button--primary[type="submit"]',
      'form.comments-comment-box__form button[type="submit"]'
    ],

    // 通用
    loadingSpinner: '.artdeco-loader'
  },

  // ========================================
  // 📊 內容來源
  // ========================================

  // RSS 訂閱源（用於靈感）
  RSS_FEEDS: [
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
    'https://news.ycombinator.com/rss',
    'https://www.producthunt.com/feed'
  ]
};
