#!/usr/bin/env node

/**
 * Twitter Curator Configuration
 * 用戶可修改的配置參數
 */

require('dotenv').config();

module.exports = {
  // ========================================
  // 🎯 核心配置
  // ========================================

  // Persona 文件路徑
  PERSONA_FILE: process.env.PERSONA_FILE || '/Users/lman/Dropbox/PKM-Vault/0-Inbox/Lman-Deep-Persona-Profile.md',

  // Gemini API Key
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

  // ========================================
  // ⏰ 時間配置
  // ========================================

  // 活動時段（23:00-07:00）
  ACTIVE_HOURS: {
    start: 23,  // 晚上 11 點開始
    end: 7      // 早上 7 點結束
  },

  // ========================================
  // 📊 頻率配置
  // ========================================

  // 每小時發文數量
  POSTS_PER_HOUR: 1,

  // 每小時回覆數量
  REPLIES_PER_HOUR: 2,

  // ========================================
  // 🎨 內容配置
  // ========================================

  // 主題領域
  TOPICS: [
    'AI/LLM Applications',
    'On-Premise AI',
    'Privacy-First Technology',
    'Early-stage Startups',
    'Product Management',
    'Go-to-market Strategy',
    'Blockchain/Web3',
    'IrisGo.AI',
    'Intel AI PC',
    'AI Fund Insights',
    'Building in Bear Markets',
    'Human-centric AI'
  ],

  // 內容長度（字符數）
  CONTENT_LENGTH: {
    min: 50,
    max: 280,    // Twitter 限制
    ideal: 180
  },

  // 語言設定
  LANGUAGE: 'en',  // 僅英文

  // 內容風格
  STYLE: {
    tone: 'conversational',         // 對話式
    technical_depth: 'medium',      // 中等技術深度
    use_analogies: true,           // 使用歷史類比
    use_hashtags: false,           // 不使用 hashtags
    use_emojis: 'minimal',         // 最少 emoji
    personal_insights: true        // 分享個人洞察
  },

  // ========================================
  // 🔍 篩選配置
  // ========================================

  // 要回覆的推文篩選條件
  REPLY_FILTERS: {
    // 優先回覆的作者類型
    priority_authors: [
      'verified',          // 已驗證帳號
      'high_engagement',   // 高互動帳號
      'relevant_field'     // 相關領域專家
    ],

    // 必須包含的關鍵詞（至少一個）
    include_keywords: [
      'ai', 'llm', 'claude', 'gpt', 'gemini',
      'startup', 'product', 'pm',
      'web3', 'blockchain', 'on-premise',
      'privacy', 'enterprise ai',
      'intel', 'ai pc'
    ],

    // 排除的關鍵詞
    exclude_keywords: [
      'crypto price', 'pump', 'moon',
      'follow back', 'dm me', 'check out my',
      'buy now', 'giveaway', 'airdrop'
    ],

    // 最小互動數
    min_engagement: {
      likes: 5,
      retweets: 1
    }
  },

  // ========================================
  // 🛡️ 安全限制
  // ========================================

  // 每日限制
  DAILY_LIMITS: {
    max_posts: 10,      // 最多 10 則發文（8 小時 x 1 則 = 8，留 buffer）
    max_replies: 20,    // 最多 20 則回覆（8 小時 x 2 則 = 16，留 buffer）
    max_total: 50       // Twitter 每日總限制
  },

  // 延遲設定（毫秒）
  DELAYS: {
    min: 3000,          // 最小 3 秒
    max: 10000,         // 最大 10 秒
    between_actions: 5000  // 動作間延遲 5 秒
  },

  // ========================================
  // 📁 檔案路徑
  // ========================================

  PATHS: {
    cookies: '/Users/lman/twitter-curator/twitter-cookies.json',
    posted_tweets: '/Users/lman/twitter-curator/posted-tweets.json',
    replied_tweets: '/Users/lman/twitter-curator/replied-tweets.json',
    daily_stats: '/Users/lman/twitter-curator/daily-stats.json',
    logs: '/Users/lman/twitter-curator/twitter-curator.log',
    errors: '/Users/lman/twitter-curator/twitter-curator.error.log'
  },

  // ========================================
  // 🧪 測試模式
  // ========================================

  DRY_RUN: process.env.DRY_RUN === 'true',  // 測試模式（不實際發送）
  HEADLESS: process.env.HEADLESS !== 'false', // 無頭模式

  // ========================================
  // 📊 內容來源
  // ========================================

  // RSS 訂閱源（用於生成靈感）
  RSS_FEEDS: [
    'https://techcrunch.com/feed/',
    'https://www.theverge.com/rss/index.xml',
    'https://news.ycombinator.com/rss'
  ],

  // Twitter Lists（用於尋找值得回覆的推文）
  TWITTER_LISTS: [
    // 可以添加 Twitter List IDs
  ]
};
