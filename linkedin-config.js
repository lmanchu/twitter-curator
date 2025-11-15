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

  // 每日回覆數量
  DAILY_REPLIES: 6,

  // ========================================
  // 🎨 內容配置
  // ========================================

  // LinkedIn 主題領域（面向消費者與知識工作者）
  TOPICS: [
    // 個人 AI 助理與生產力
    'Personal AI Assistants for Everyone',
    'AI-Powered Personal Productivity',
    'Managing Information Overload',
    'Personal Knowledge Management',
    'Workflow Automation for Individuals',
    'AI Tools for Daily Life',
    'Privacy-First Personal AI',
    'On-Device AI for Consumers',

    // 知識工作者痛點
    'Future of Knowledge Work',
    'Remote Work Productivity',
    'Managing Multiple Projects',
    'Information Organization Tips',
    'Fighting Digital Distraction',
    'Work-Life Balance with AI',
    'Personal Efficiency Hacks',
    'Lifelong Learning Strategies',

    // 消費者科技趨勢
    'AI PC for Regular Users',
    'Consumer AI Trends',
    'Local-First Software',
    'Privacy in Consumer Tech',
    'Accessible AI Tools',
    'User-Friendly AI',
    'AI for Non-Technical People',

    // 創業與產品洞察（from founder perspective）
    'Building Products for Everyone',
    'Consumer vs Enterprise Products',
    'Lessons from Product Launches',
    'Understanding User Needs',
    'Founder Journey Insights',
    'Product-Led Growth',

    // 個人成長與思考
    'Productivity Systems',
    'Continuous Learning',
    'Critical Thinking in AI Age',
    'Philosophy of Technology',
    'Systems Thinking',
    'Historical Parallels in Tech',
    'Innovation for Individuals'
  ],

  // 內容長度（LinkedIn 允許更長）
  CONTENT_LENGTH: {
    min: 200,
    max: 3000,
    ideal: 1000    // LinkedIn sweet spot
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

  // 回覆篩選條件
  REPLY_FILTERS: {
    // 優先回覆的作者類型
    priority_authors: [
      'verified',          // 已驗證帳號
      'influencer',        // 影響力人士
      'relevant_field'     // 相關領域專家
    ],

    // 必須包含的關鍵詞（至少一個）
    include_keywords: [
      'ai', 'artificial intelligence', 'personal assistant',
      'productivity', 'knowledge work', 'remote work',
      'work life balance', 'personal ai', 'privacy',
      'ai tools', 'ai pc', 'consumer tech', 'workflow'
    ],

    // 排除的關鍵詞
    exclude_keywords: [
      'buy now', 'click here', 'dm me',
      'check out my course', 'limited time offer',
      'crypto trading', 'get rich quick'
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

  // 每日限制（LinkedIn 較保守）
  DAILY_LIMITS: {
    max_posts: 3,       // 每日最多 3 則發文
    max_replies: 6,     // 每日最多 6 則回覆
    max_total: 10       // LinkedIn 每日總限制
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
    errors: '/Users/lman/twitter-curator/linkedin-curator.error.log'
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

  // LinkedIn Selectors (may need updates as LinkedIn changes UI)
  SELECTORS: {
    // 發文相關
    startPostButton: '[aria-label*="Start a post"]',
    postEditor: '.ql-editor',
    postButton: '[data-test-modal-id="share-box-post-button"]',

    // 搜尋與回覆相關
    searchBox: 'input.search-global-typeahead__input',
    postCard: '.feed-shared-update-v2',
    commentButton: '[aria-label*="Comment"]',
    commentBox: '.ql-editor[contenteditable="true"]',
    commentSubmitButton: 'button.comments-comment-box__submit-button',

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
