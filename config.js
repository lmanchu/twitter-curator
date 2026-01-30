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
  // 🤖 AI Model Configuration (2026-01-30)
  // ========================================
  // Priority: CLIProxyAPI → Ollama → OpenAI
  // CLIProxyAPI fallback: Gemini → GLM → OpenAI
  AI_CONFIG: {
    // Primary: CLIProxyAPI (統一代理)
    cliproxy: {
      url: process.env.CLIPROXY_URL || 'http://127.0.0.1:8317',
      key: process.env.CLIPROXY_API_KEY || 'magi-proxy-key-2026',
      // 可用模型 (按優先順序)
      models: {
        primary: 'gemini-2.5-flash',     // Gemini (免費額度 + OAuth)
        fallback: 'glm-4.5-air',         // GLM (Z.AI Coding Plan)
        quality: 'glm-4.5',              // GLM 標準版 (品質優先時)
      }
    },
    // 本地 Ollama (離線備援)
    ollama: {
      url: 'http://localhost:11434',
      models: ['qwen3-coder:30b', 'gpt-oss:20b']
    }
  },

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
  // 📊 頻率配置 (基於 X 算法優化 - 2026-01-20)
  // ========================================

  // 每小時發文數量 - 基於作者多樣性機制
  POSTS_PER_HOUR: 0.7,  // 平均 90 分鐘 1 條（個人帳號可稍多於品牌）

  // 每小時回覆數量（提升為 5 則，增加曝光）
  REPLIES_PER_HOUR: 5,

  // 發文排程控制 - 新增
  POSTING_SCHEDULE: {
    min_interval_hours: 2.5,  // 最少間隔 2.5 小時（個人帳號稍短）
    optimal_times: [
      { hour: 23, timezone: 'Asia/Taipei', desc: '台北 23:00 = 美西 07:00 當天 (早晨通勤)' },
      { hour: 2, timezone: 'Asia/Taipei', desc: '台北 02:00 = 美西 10:00 當天 (工作時段)' },
      { hour: 5, timezone: 'Asia/Taipei', desc: '台北 05:00 = 美西 13:00 當天 (午休)' },
      { hour: 7, timezone: 'Asia/Taipei', desc: '台北 07:00 = 美西 15:00 當天 (下午)' }
    ],
    max_per_window: 1  // 每個時段最多 1 條
  },

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

  // 內容長度（字符數）- 基於 X 算法優化
  CONTENT_LENGTH: {
    min: 50,     // 維持
    max: 280,    // Twitter 限制
    ideal: 120   // 從 180 降到 120（短推更容易互動）
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
    ratio: 3,  // 每 3 則回覆有 1 則是興趣導向 (~33%)

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
  // 🎯 大帳號互動策略 (Reply Guy 戰術 - 2026-01-20)
  // ========================================

  // 基於 @Xprofessorrr 的 35 → 82K 成長案例：
  // "如果堅持回覆 6 個月，輕鬆可達 10,000+ 粉絲"
  // 個人帳號策略：更直接、更有態度、可談技術細節

  INFLUENCER_ENGAGEMENT: {
    enabled: true,

    // 分層目標策略 - 個人帳號配額
    target_tiers: [
      {
        name: 'mega',
        min_followers: 1000000,     // 百萬級：1M+
        per_day: 8,                 // 每天 8 則
        niches: ['AI', 'Tech', 'Privacy', 'Startup', 'Web3'],
        priority: 'highest',
        first_reply_bonus: true,    // 搶第一個回覆
        allow_hot_takes: true       // 個人帳號可以更大膽
      },
      {
        name: 'macro',
        min_followers: 100000,      // 十萬級：100K-1M
        per_day: 12,                // 每天 12 則
        niches: ['AI', 'Privacy', 'Tech', 'Startup', 'Productivity', 'Web3'],
        priority: 'high',
        allow_technical_depth: true // 可談技術細節
      },
      {
        name: 'micro',
        min_followers: 10000,       // 萬級：10K-100K
        per_day: 15,                // 每天 15 則
        niches: ['AI', 'Privacy', 'Tech', 'Startup', 'Productivity', 'IndieHacker', 'Web3'],
        priority: 'medium',
        personal_experience_ok: true // 可分享個人經驗
      }
    ],

    // 即時回覆模式（個人帳號更積極）
    priority_mode: {
      enabled: true,
      max_delay_minutes: 3,         // 3 分鐘內回覆（更快）
      monitor_tracked_accounts: true,
      quick_response_style: true    // 快速但有質量
    },

    engagement_quality: {
      min_reply_length: 60,         // 個人帳號可以更簡短有力
      add_unique_perspective: true,
      personal_insights: true,      // 允許個人經驗分享
      technical_depth_allowed: true,
      avoid_generic_praise: true,

      // Lman 風格（來自 persona）
      style: {
        direct: true,               // 直接不廢話
        opinionated: true,          // 有態度
        can_be_contrarian: true,    // 可以挑戰主流
        casual_tone_ok: true        // "Agree or nah?" 這種語氣
      },

      // Reply Guy 質量標準
      must_be: {
        relevant: true,
        meaningful: true,
        interesting: true
      }
    },

    // 總配額：8 + 12 + 15 = 35 則/天（大帳號回覆）
    daily_total: 35
  },

  // ========================================
  // 🛡️ 安全限制 (基於 X 算法 + Reply Guy 優化)
  // ========================================

  // 每日限制 - Reply Guy 策略調整
  DAILY_LIMITS: {
    max_posts: 5,       // 從 10 降到 5（避免作者多樣性衰減，配合 4 時段）
    max_replies: 70,    // Reply Guy 策略：35 大帳號 + 35 一般（從 60 提升）
    max_total: 75       // 5 posts + 70 replies（Reply Guy > 原創內容）
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
  // 💬 Engagement Hook 策略 (Heavy Ranker + marketing-skills)
  // ========================================
  //
  // Twitter 的神經網路預測用戶是否會互動
  // 使用特定 pattern 可以提高回覆被看到的機率
  //
  ENGAGEMENT_HOOKS: {
    // Hook Formulas (from marketing-skills/social-content)
    hook_formulas: {
      curiosity: {
        weight: 25,
        templates: [
          'Most founders get [X] wrong. Here\'s what actually works.',
          '[Counterintuitive fact]. The reason why...',
          'I\'ve shipped [X products]. The #1 lesson...',
        ]
      },
      contrarian: {
        weight: 30,
        templates: [
          'Everyone says [common belief]. I think the opposite.',
          '[Popular advice] is killing your [outcome].',
          'Unpopular opinion: [bold statement]',
        ]
      },
      story: {
        weight: 25,
        templates: [
          '[Specific moment]. That\'s when I realized...',
          'Yesterday I [specific action] and discovered...',
          '[Time ago], I made a mistake that...',
        ]
      },
      value: {
        weight: 20,
        templates: [
          '3 things that [improved X] by [Y%]:',
          'The framework I use to [specific outcome]:',
          'How to [outcome] in [timeframe]:',
        ]
      }
    },

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
  // 💬 互動設計策略 (基於 X 算法優化 + marketing-skills)
  // ========================================

  ENGAGEMENT_DESIGN: {
    // 結尾加互動觸發點（回覆權重最高）
    call_to_action: {
      enabled: true,
      types: [
        'question',          // "What's your take on...?"
        'hot_take',          // "Agree or disagree?"
        'share_experience'   // "Have you experienced...?"
      ],
      frequency: 0.6  // 60% 的內容有 CTA（個人可稍低於品牌）
    },

    // Voice Principles (from marketing-skills)
    voice_principles: {
      specific_over_vague: true,     // 📌 "CAC dropped 43%" not "I improved metrics"
      short_breathe_land: true,      // 📌 Short sentences. Let it land.
      show_over_tell: true,          // 📌 "3am debugging LLMs" not "I'm passionate about AI"
      numbers_add_credibility: true, // 📌 Specificity = trust
      personal_experience_ok: true,  // 📌 Unlike brand, Lman can share stories
    },

    // Psychology Triggers (from marketing-psychology)
    psychology_triggers: {
      jobs_to_be_done: true,   // Focus on OUTCOME reader wants
      mere_exposure: true,     // Consistency > virality (7+ touches)
      peak_end_rule: true,     // Strong opening + memorable close
      curiosity_gap: true,     // Open loop → insight → close
      pratfall_effect: true,   // Admitting flaws = more relatable
    },

    // 內容結構要求
    structure: {
      hook_first_sentence: true,  // 第一句要抓眼球
      max_paragraphs: 3,          // 最多 3 段
      prefer_short_sentences: true
    },

    // 避免負面信號
    avoid_negative_signals: {
      no_attack_language: true,
      no_spam_patterns: true,
      no_misleading_claims: true,
      no_controversial_politics: true
    },

    // 分享價值設計
    shareability: {
      has_useful_info: true,
      has_unique_perspective: true,
      has_personal_story: true  // 個人可分享故事
    }
  },

  // ========================================
  // 🎬 視頻策略 (基於 X 算法優化 - 2026-01-20)
  // ========================================

  VIDEO_STRATEGY: {
    // ⚠️ 在 Twitter 原創視頻 ROI 是負的
    prefer_quote_over_original: true,

    // 原創視頻（不推薦）
    original_video: {
      enabled: false,
      optimal_duration: '15-30s',
      must_have_subtitles: true,
      custom_thumbnail: true,
      hook_first_3s: true
    },

    // 引用視頻策略（推薦）
    quote_video: {
      enabled: true,
      add_commentary: true,  // 加上個人觀點
      target_sources: [
        'industry_leaders',
        'tech_creators',
        'startup_content'
      ]
    }
  },

  // ========================================
  // 🔄 Apollo 協作策略 (2026-01-20)
  // ========================================

  APOLLO_COLLABORATION: {
    enabled: true,

    // Hermes 幫 Apollo 推
    support_apollo: {
      retweet_frequency: 'selective',  // 選擇性轉發 @irisgoai
      quality_threshold: 0.8,          // 只轉高質量內容
      max_per_week: 2,                 // 每週最多 2 條
      add_personal_perspective: true   // 加上個人視角
    },

    // 回應 Apollo 的品牌內容
    respond_to_apollo: {
      enabled: true,
      when_relevant: true,
      personal_voice: true  // 維持個人聲音
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
