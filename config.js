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

  // Persona 文件路徑 (DayFlow + LinkedIn 動態數據)
  PERSONA_FILE: process.env.PERSONA_FILE || '/Users/lman/Dropbox/PKM-Vault/0-Inbox/Lman-Deep-Persona-Profile.md',

  // 📝 補充寫作風格資料：分析自 204 篇 Medium 文章 (2015-2025)
  //    位置: ~/.ai-butler-system/personas/lman-writing-style.json
  //    包含: twitter_curator_style, voice_examples, signature_phrases, hooks
  //    已整合到 content-generator.js 的 prompt 中

  // Gemini API Key
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',

  // Anthropic API Key (for LinkedIn fact-checking)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

  // ========================================
  // 🔄 帳號切換模式 (與 Apollo 共用 chrome-user-data)
  // ========================================
  DELEGATE_MODE: {
    enabled: true,
    base_profile: '/Users/lman/twitter-curator/chrome-user-data',
    target_account: 'lmanchu'  // Hermes 使用 Lman 個人帳號
  },

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

  // 每小時回覆數量（提升為 5 則，增加曝光）
  REPLIES_PER_HOUR: 5,

  // ========================================
  // 🎨 內容配置
  // ========================================

  // ========================================
  // 📚 Twitter 主題分類系統（加權選擇）
  // ========================================
  //
  // 分類比例設計（與 LinkedIn 一致）：
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
        'AI industry trends and hot takes',
        'Why most AI startups will fail',
        'Enterprise AI adoption reality check',
        'Consumer AI vs Enterprise AI',
        'What big tech gets wrong about AI',
        'Startup lessons from the trenches',
        'Tech industry observations',
        'The hype cycle in AI',
        'VC and funding landscape',
        'Building in bear markets'
      ]
    },

    // 個人洞察類 (25%) - 不提 IrisGo
    personal: {
      weight: 25,
      topics: [
        'Lessons from startup failures',
        'Founder mental health and burnout',
        'Productivity hacks that actually work',
        'Reading and learning strategies',
        'Work-life integration (not balance)',
        'Decision-making under uncertainty',
        'Historical parallels in technology',
        'Philosophy of technology',
        'Career advice for builders',
        'Contrarian takes on common wisdom'
      ]
    },

    // 產品相關類 (20%) - 可以提 IrisGo
    product: {
      weight: 20,
      topics: [
        'Building privacy-first AI products',
        'On-premise AI for consumers',
        'Personal AI assistants evolution',
        'IrisGo.AI updates and journey',
        'Local-first software movement',
        'Knowledge management tools'
      ]
    },

    // 技術深度類 (15%) - 專家視角
    technical: {
      weight: 15,
      topics: [
        'LLM deployment and optimization',
        'Edge AI vs cloud AI tradeoffs',
        'On-device inference challenges',
        'AI PC ecosystem and Intel',
        'Privacy-preserving AI techniques',
        'Local-first architecture patterns'
      ]
    }
  },

  // 舊版 TOPICS 保留用於向後兼容
  TOPICS: [
    // AI/Tech 核心主題
    'AI/LLM Applications',
    'On-Premise AI',
    'Privacy-First Technology',
    'Human-centric AI',
    'AI Product Design',
    'Local-first AI',
    'Edge AI Computing',

    // 創業與商業
    'Early-stage Startups',
    'Product Management',
    'Go-to-market Strategy',
    'Building in Bear Markets',
    'Founder Mental Health',
    'Team Building',
    'Startup Fundraising',

    // 產業與趨勢
    'Blockchain/Web3',
    'Intel AI PC',
    'AI Fund Insights',
    'Enterprise AI Adoption',
    'AI Regulations',

    // IrisGo 相關
    'IrisGo.AI',
    'Personal AI Assistants',
    'Knowledge Management',

    // 個人成長與觀察
    'Lessons from Failure',
    'Tech Industry Observations',
    'Work-Life Integration',
    'Productivity Hacks',
    'Reading & Learning',

    // 跨領域
    'History Lessons for Tech',
    'Philosophy of Technology',
    'Future of Work'
  ],

  // 內容長度（字符數）
  CONTENT_LENGTH: {
    min: 50,
    max: 280,    // Twitter 限制
    ideal: 180
  },

  // 語言設定
  LANGUAGE: 'bilingual',  // 雙語 (EN+ZH) - 分析顯示雙語貼文表現更好

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
      'intel', 'ai pc',
      // 基礎設施/網路技術 (高流量來源)
      'infrastructure', 'networking', 'kubernetes', 'k8s',
      'bgp', 'micro-kernel', 'linux', 'devops', 'sre',
      'arista', 'cisco', 'cloud native', 'docker', 'container'
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
  // 🎬 興趣導向互動 (Anime/SciFi/Entertainment)
  // ========================================
  //
  // 根據 Persona 中的 Otaku Attributes，增加與興趣相關的互動
  // 這讓發文更有人性化，展現真實的個人興趣
  //
  INTEREST_ENGAGEMENT: {
    // 啟用興趣導向回覆
    enabled: true,

    // 興趣回覆比例 (每 N 則回覆中有 1 則是興趣導向)
    ratio: 5,  // 每 5 則回覆有 1 則是興趣導向 (20%)

    // 官方帳號 - 製作公司、出版社、官方
    official_accounts: [
      // 動畫製作公司
      'WIT_STUDIO',        // Wit Studio
      'MAPPA_Info',        // MAPPA
      'CloverWorks_en',    // CloverWorks

      // 漫畫/動畫官方
      'heroaca_anime',     // My Hero Academia
      'CHAINSAWMAN_PR',    // Chainsaw Man
      'GUNDAM_INFO',       // Gundam
      'EVA_GLOBAL',        // Evangelion
      'frieren_PR',        // Frieren
      'DANDADAN_PR',       // Dandadan

      // SciFi 影視
      'starwars',          // Star Wars
      'StarTrek',          // Star Trek
      'Stranger_Things',   // Stranger Things

      // 美劇
      'SiliconHBO',        // Silicon Valley
    ],

    // 創作者帳號 - 漫畫家、監督
    creator_accounts: [
      'Anno_Hideaki',      // Hideaki Anno (EVA)
    ],

    // 興趣關鍵詞 - 用於搜尋相關推文
    keywords: [
      // 熱門作品名
      'my hero academia', 'boku no hero', 'mha',
      'jujutsu kaisen', 'jjk',
      'chainsaw man', 'csm',
      'frieren', 'sousou no frieren',
      'dandadan',
      'kaiju no 8',
      'attack on titan', 'shingeki no kyojin',
      'one punch man', 'opm',
      'gundam',
      'evangelion', 'eva',
      'fullmetal alchemist', 'fma',
      'haikyuu',
      'demon slayer', 'kimetsu no yaiba',

      // SciFi
      'star wars', 'mandalorian',
      'star trek', 'strange new worlds',
      'stranger things',
      'interstellar',
      'the matrix',

      // 動漫產業
      'anime', 'manga', 'new episode',
      'season finale', 'anime adaptation',
      'manga chapter', 'anime movie',

      // 美劇
      'silicon valley hbo',
    ],

    // 回覆風格 - 以粉絲/觀眾身份互動
    reply_style: {
      tone: 'enthusiastic_fan',  // 熱情粉絲
      approach: 'genuine_appreciation',  // 真誠欣賞
      avoid: ['spoilers', 'negative_criticism', 'controversy'],
      include: ['appreciation', 'favorite_moment', 'tech_connection']
    }
  },

  // ========================================
  // 🛡️ 安全限制
  // ========================================

  // 每日限制
  DAILY_LIMITS: {
    max_posts: 10,      // 最多 10 則發文
    max_replies: 60,    // 最多 60 則回覆（16 agents × 5 replies = 80 理論值，留 buffer）
    max_total: 60       // Twitter 每日總限制
  },

  // ========================================
  // 🔄 Anti-Fatigue 策略 (基於 Twitter Algorithm 分析)
  // ========================================
  //
  // Twitter 的 Heavy Ranker 會對過度活動給予 fatigue penalty
  // 這些設定用於避免觸發這個機制
  // See: TWITTER-ALGORITHM-INSIGHTS.md
  //
  ANTI_FATIGUE: {
    // 同一帳號的回覆限制
    per_account: {
      max_replies_per_day: 2,      // 每日最多回覆同一人 2 次
      min_gap_hours: 4,            // 回覆同一人需間隔 4 小時
    },

    // 多樣性要求 (SimClusters 友善)
    diversity: {
      min_unique_authors_ratio: 0.7,  // 70%+ 的回覆需對不同人
      target_unique_authors: 15,       // 每日目標回覆 15+ 不同人
    },

    // 速率限制
    rate_limits: {
      max_replies_per_hour: 4,     // 每小時最多 4 則回覆（留 buffer）
      cooldown_after_burst: 20,    // 連續動作後冷卻 20 分鐘
      burst_threshold: 6,          // 6 則以上視為 burst
    }
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
    errors: '/Users/lman/twitter-curator/twitter-curator.error.log',
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
  // 💬 Engagement Hook 策略 (基於 Heavy Ranker 分析)
  // ========================================
  //
  // Twitter 的神經網路預測用戶是否會互動
  // 使用特定 pattern 可以提高回覆被看到的機率
  //
  ENGAGEMENT_HOOKS: {
    // 優先使用的 hook 類型
    preferred_patterns: [
      'question',           // 提問引發回應
      'hot_take',          // 有爭議性觀點引發討論
      'personal_experience', // 分享經驗增加獨特價值
      'build_on'           // 延伸對話
    ],

    // 避免的模式（Heavy Ranker 會給低分）
    avoid_patterns: [
      'generic_agreement',  // "Great point!" 無價值
      'pure_praise',        // "Love this!" 太籠統
      'self_promo_only',    // 純粹自我推銷
      'one_word'            // 單字回覆
    ],

    // 每種 pattern 的權重（生成時使用）
    weights: {
      question: 30,
      hot_take: 25,
      personal_experience: 25,
      build_on: 20
    }
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
