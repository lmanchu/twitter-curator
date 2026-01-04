#!/usr/bin/env node

/**
 * LinkedIn Curator - 智能貼文發布與互動系統
 * 
 * 功能：
 * 1. 每天發布 3 則原創貼文（隨機時間）
 * 2. 每天回覆 6 則相關貼文（隨機時間）
 * 3. 使用 Persona 驅動的內容生成
 * 4. 英文內容，符合 Lman 專業風格
 * 
 * 使用方式：
 * node linkedin-curator.js --mode post    # 發布模式
 * node linkedin-curator.js --mode reply   # 回覆模式
 */

require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const config = require('./linkedin-config');
const { generateLinkedInPost, generateLinkedInReply, selectRandomTopic, selectWeightedTopic } = require('./linkedin-content-generator');

// 載入事實核查系統 (Ollama 版本)
let factChecker;
try {
  factChecker = require('./linkedin-fact-checker-ollama');
  console.log('✅ Fact-checker (Ollama) loaded');
} catch (e) {
  console.log('⚠️  Fact-checker not available, using original generator');
}

puppeteer.use(StealthPlugin());

// ========================================
// 🎯 Tracked Accounts 解析
// ========================================

function parseTrackedAccounts() {
  try {
    const filePath = config.PATHS.tracked_accounts;
    if (!fs.existsSync(filePath)) {
      console.log('[INFO] No tracked-accounts.md found');
      return { twitter: [], linkedin: [] };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const twitter = [];
    const linkedin = [];
    let currentSection = null;
    let currentCategory = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 跳過空行
      if (!trimmed) continue;

      // 先檢測 section headers (## 開頭)
      if (trimmed.startsWith('## ')) {
        if (trimmed === '## Twitter Accounts') {
          currentSection = 'twitter';
        } else if (trimmed === '## LinkedIn Accounts') {
          currentSection = 'linkedin';
        } else if (trimmed === '## Notes') {
          currentSection = null;  // 停止解析
        } else {
          // 其他 ## 標題，保持當前 section
        }
        continue;
      }

      // 檢測 category (### 開頭)
      if (trimmed.startsWith('### ')) {
        currentCategory = trimmed.replace('### ', '').toLowerCase();
        continue;
      }

      // 跳過註解 (# 開頭但不是 ##/###)
      if (trimmed.startsWith('#')) continue;

      // 跳過其他 markdown 語法
      if (trimmed.startsWith('---') || trimmed.startsWith('- ')) continue;

      // 解析帳號
      if (currentSection === 'twitter') {
        const username = trimmed.replace(/^@/, '').trim();
        if (username && !username.includes(' ')) {
          twitter.push({
            username,
            category: currentCategory || 'general',
            priority: getPriority(currentCategory)
          });
        }
      } else if (currentSection === 'linkedin') {
        const username = trimmed.trim();
        if (username && !username.includes(' ')) {
          linkedin.push({
            username,
            category: currentCategory || 'general',
            priority: getPriority(currentCategory)
          });
        }
      }
    }

    console.log(`[INFO] Parsed tracked accounts: ${twitter.length} Twitter, ${linkedin.length} LinkedIn`);
    return { twitter, linkedin };

  } catch (error) {
    console.error('[ERROR] Failed to parse tracked accounts:', error.message);
    return { twitter: [], linkedin: [] };
  }
}

function getPriority(category) {
  if (!category) return 3;
  if (category.includes('vc') || category.includes('investor')) return 1;
  if (category.includes('leader') || category.includes('ai')) return 2;
  if (category.includes('founder')) return 3;
  return 4;
}

// ========================================
// 日誌系統
// ========================================

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);

  try {
    fs.appendFileSync(config.PATHS.logs, logMessage + '\n');
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

// ========================================
// 數據持久化
// ========================================

function loadJSON(filepath, defaultValue = []) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (error) {
    log(`Error loading ${filepath}: ${error.message}`, 'ERROR');
  }
  return defaultValue;
}

function saveJSON(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  } catch (error) {
    log(`Error saving ${filepath}: ${error.message}`, 'ERROR');
  }
}

// ========================================
// 每日限制檢查
// ========================================

function getDailyStats() {
  const stats = loadJSON(config.PATHS.daily_stats, {});
  // 使用台灣時區 (UTC+8) 計算日期
  const today = new Date(Date.now() + (8 * 60 * 60 * 1000)).toISOString().split('T')[0];

  if (!stats[today]) {
    stats[today] = { posts: 0, replies: 0, total: 0 };
  }

  return { stats, today };
}

function canPost() {
  const { stats, today } = getDailyStats();
  const todayStats = stats[today];

  if (todayStats.posts >= config.DAILY_LIMITS.max_posts) {
    log('Daily post limit reached', 'WARN');
    return false;
  }

  if (todayStats.total >= config.DAILY_LIMITS.max_total) {
    log('Daily total limit reached', 'WARN');
    return false;
  }

  return true;
}

function canReply() {
  const { stats, today } = getDailyStats();
  const todayStats = stats[today];

  if (todayStats.replies >= config.DAILY_LIMITS.max_replies) {
    log('Daily reply limit reached', 'WARN');
    return false;
  }

  if (todayStats.total >= config.DAILY_LIMITS.max_total) {
    log('Daily total limit reached', 'WARN');
    return false;
  }

  return true;
}

function incrementPostCount() {
  const { stats, today } = getDailyStats();
  stats[today].posts++;
  stats[today].total++;
  saveJSON(config.PATHS.daily_stats, stats);
}

function incrementReplyCount() {
  const { stats, today } = getDailyStats();
  stats[today].replies++;
  stats[today].total++;
  saveJSON(config.PATHS.daily_stats, stats);
}

// ========================================
// 隨機延遲
// ========================================

function randomDelay(min = config.DELAYS.min, max = config.DELAYS.max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ========================================
// LinkedIn 登入
// ========================================

async function loginToLinkedIn(page) {
  try {
    log('Checking LinkedIn login status...');

    // 使用更寬容的 waitUntil 選項和更長的 timeout
    await page.goto(config.LINKEDIN_URLS.home, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await randomDelay(3000, 5000);

    const isLoggedIn = await page.evaluate(() => {
      return !window.location.href.includes('/login') &&
             !window.location.href.includes('/checkpoint');
    });

    if (isLoggedIn) {
      log('Already logged in! ✓');
      return true;
    }

    log('Not logged in. Please login manually...', 'WARN');

    if (!page.url().includes('/login')) {
      await page.goto('https://www.linkedin.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    }

    await page.waitForFunction(
      () => {
        return window.location.href.includes('/feed') ||
               window.location.href === 'https://www.linkedin.com/';
      },
      { timeout: 300000 }
    );

    await randomDelay(2000, 3000);
    log('Login successful!');

    return true;

  } catch (error) {
    log(`Login error: ${error.message}`, 'ERROR');
    return false;
  }
}

// ========================================
// 發布原創貼文
// ========================================

async function postLinkedInPost(page, postText) {
  try {
    if (config.DRY_RUN) {
      log(`[DRY RUN] Would post: "${postText.substring(0, 100)}..."`, 'INFO');
      return true;
    }

    log('Posting to LinkedIn...');

    await page.goto(config.LINKEDIN_URLS.home, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await randomDelay(3000, 5000);

    // 點擊 "Start a post" 按鈕 - 使用通過文字查找的方式更可靠
    log('Looking for Start a post button...');
    const startPostButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.find(btn => btn.textContent.trim() === 'Start a post');
    });

    if (!startPostButton) {
      throw new Error('Start a post button not found');
    }

    await startPostButton.click();
    log('Clicked Start a post button');
    await randomDelay(2000, 3000);

    // 輸入貼文內容
    const editorSelector = 'div.ql-editor[contenteditable="true"]';
    await page.waitForSelector(editorSelector, { timeout: 10000 });
    await page.click(editorSelector);
    await randomDelay(500, 1000);

    // 輸入文字
    await page.type(editorSelector, postText, { delay: 30 });
    await randomDelay(2000, 3000);

    // 點擊 Post 按鈕
    const postButtonSelector = 'button[class*="share-actions__primary-action"]';
    const postButton = await page.$(postButtonSelector);
    
    if (postButton) {
      await postButton.click();
      await randomDelay(5000, 7000);

      log(`✅ LinkedIn post published`);
      log(`Preview: ${postText.substring(0, 150)}...`);

      // 記錄已發布
      const posted = loadJSON(config.PATHS.posted);
      posted.push({
        text: postText.substring(0, 200),
        timestamp: new Date().toISOString(),
        platform: 'linkedin',
        method: 'puppeteer'
      });
      saveJSON(config.PATHS.posted, posted);

      incrementPostCount();
      return true;
    }

    log('Post button not found', 'ERROR');
    return false;

  } catch (error) {
    log(`Error posting: ${error.message}`, 'ERROR');
    return false;
  }
}

// ========================================
// 搜尋 Tracked Accounts 的貼文
// ========================================

async function searchTrackedAccountPosts(page, trackedAccounts) {
  try {
    log('🎯 Searching posts from tracked LinkedIn accounts...');

    // 按優先級排序
    const sortedAccounts = trackedAccounts.sort((a, b) => a.priority - b.priority);

    // 隨機選擇一個帳號（優先級高的機率較大）
    const account = sortedAccounts[Math.floor(Math.random() * Math.min(3, sortedAccounts.length))];

    log(`Searching for posts from: ${account.username} (${account.category}, priority ${account.priority})`);

    // 搜尋該帳號的貼文
    const searchUrl = `https://www.linkedin.com/search/results/content/?fromMember=%5B%22${account.username}%22%5D&sortBy=%22date_posted%22`;

    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await randomDelay(5000, 7000);

    // 滾動載入內容
    await page.evaluate(() => window.scrollBy(0, 800));
    await randomDelay(2000, 3000);

    // 等待貼文載入
    try {
      await page.waitForSelector('[class*="feed-shared-update-v2"]', { timeout: 20000 });
    } catch (e) {
      log('No posts found from tracked account, falling back...', 'WARN');
      return null;
    }

    // 提取貼文（使用與 searchRelevantPosts 相同的邏輯）
    const posts = await page.evaluate(() => {
      const postElements = Array.from(document.querySelectorAll('[class*="feed-shared-update-v2"]'));

      return postElements.slice(0, 10).map((post, index) => {
        try {
          let author = 'Unknown';
          const authorSelectors = [
            '[class*="update-components-actor__name"]',
            '[class*="entity-result__title"]',
            '[data-test-link-to-profile-link]',
            'span.update-components-actor__name span[aria-hidden="true"]'
          ];

          for (const selector of authorSelectors) {
            const authorElement = post.querySelector(selector);
            if (authorElement && authorElement.textContent.trim()) {
              author = authorElement.textContent.trim();
              break;
            }
          }

          let text = '';
          const textSelectors = [
            '[class*="feed-shared-text__text-view"]',
            '[class*="update-components-text"]',
            '[data-test-update-text]'
          ];

          for (const selector of textSelectors) {
            const textElement = post.querySelector(selector);
            if (textElement && textElement.textContent.trim()) {
              text = textElement.textContent.trim();
              break;
            }
          }

          const commentButton = post.querySelector('button[aria-label*="Comment"]');

          return {
            index,
            author,
            text: text.substring(0, 500),
            hasCommentButton: !!commentButton,
            element: post
          };
        } catch (e) {
          return null;
        }
      }).filter(p => p && p.text.length > 50 && p.hasCommentButton);
    });

    if (posts.length > 0) {
      log(`✅ Found ${posts.length} posts from tracked account: ${account.username}`);
      return { posts, accountInfo: account };
    }

    return null;

  } catch (error) {
    log(`Error searching tracked account posts: ${error.message}`, 'ERROR');
    return null;
  }
}

// ========================================
// 搜尋相關貼文
// ========================================

async function searchRelevantPosts(page) {
  try {
    log('Searching for relevant LinkedIn posts...');

    // 🆕 策略優先級：
    // 1. 33% 機率搜尋 tracked accounts（如果有開啟）
    // 2. 70% 使用主頁 feed
    // 3. 30% 使用關鍵字搜尋

    const trackedConfig = config.TRACKED_ACCOUNTS;
    const useTrackedAccounts = trackedConfig && trackedConfig.enabled && Math.random() < (1 / (trackedConfig.ratio || 3));

    if (useTrackedAccounts) {
      const { linkedin: trackedAccounts } = parseTrackedAccounts();
      if (trackedAccounts.length > 0) {
        const result = await searchTrackedAccountPosts(page, trackedAccounts);
        if (result) {
          return result.posts;
        }
        log('Tracked account search failed, falling back to regular search', 'WARN');
      }
    }

    const useHomeFeed = Math.random() < 0.7; // 70% 使用主頁 feed

    if (useHomeFeed) {
      log('Using home feed (posts from your network)...');
      await page.goto(config.LINKEDIN_URLS.home, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    } else {
      const keywords = config.SEARCH_KEYWORDS;
      const searchTerm = keywords[Math.floor(Math.random() * keywords.length)];
      log(`Searching for: "${searchTerm}"`);
      const searchUrl = `${config.LINKEDIN_URLS.search}?keywords=${encodeURIComponent(searchTerm)}`;
      await page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
    }

    // 給頁面更多時間加載內容
    log('Waiting for search results to load...');
    await randomDelay(5000, 7000);

    // 滾動一下以載入更多內容
    await page.evaluate(() => window.scrollBy(0, 800));
    await randomDelay(2000, 3000);

    // 使用更長的 timeout 等待貼文元素
    try {
      await page.waitForSelector('[class*="feed-shared-update-v2"]', { timeout: 20000 });
    } catch (e) {
      log('Primary selector timed out, trying alternative...', 'WARN');
      await page.waitForSelector('.search-results-container li', { timeout: 20000 });
    }

    // 提取貼文 - 使用多個策略
    const posts = await page.evaluate(() => {
      // 嘗試多個可能的選擇器
      let postElements = Array.from(document.querySelectorAll('[class*="feed-shared-update-v2"]'));

      // 如果第一個方法找不到，嘗試備用方法
      if (postElements.length === 0) {
        postElements = Array.from(document.querySelectorAll('.search-results-container li'));
      }

      console.log(`[DEBUG] Found ${postElements.length} post elements`);

      return postElements.slice(0, 20).map((post, index) => {
        try {
          // 嘗試多種方式提取作者名稱
          let author = 'Unknown';
          const authorSelectors = [
            '[class*="update-components-actor__name"]',
            '[class*="entity-result__title"]',
            '[data-test-link-to-profile-link]',
            'span.update-components-actor__name span[aria-hidden="true"]'
          ];

          for (const selector of authorSelectors) {
            const authorElement = post.querySelector(selector);
            if (authorElement && authorElement.textContent.trim()) {
              author = authorElement.textContent.trim();
              break;
            }
          }

          // 嘗試多種方式提取文字內容
          let text = '';
          const textSelectors = [
            '[class*="feed-shared-text"]',
            '[class*="update-components-text"]',
            '[class*="entity-result__summary"]',
            '.feed-shared-update-v2__description'
          ];

          for (const selector of textSelectors) {
            const textElement = post.querySelector(selector);
            if (textElement && textElement.textContent.trim()) {
              text = textElement.textContent.trim();
              break;
            }
          }

          // 如果還是沒有文字，使用整個元素的文字
          if (!text) {
            text = post.textContent.trim();
          }

          // 提取 post ID
          let postId = null;
          const linkElement = post.querySelector('a[href*="/feed/update/"], a[href*="urn:li:activity"]');
          if (linkElement) {
            const href = linkElement.href;
            if (href.includes('/feed/update/')) {
              postId = href.split('/feed/update/')[1].split('/')[0].split('?')[0];
            } else if (href.includes('urn:li:activity:')) {
              postId = href.split('urn:li:activity:')[1].split('&')[0];
            }
          }

          // 如果沒有找到 postId，使用 content hash 作為穩定 ID（避免重複回覆）
          if (!postId) {
            // 用 author + text 前 100 字產生穩定的 hash
            const hashSource = `${author}:${text.substring(0, 100)}`;
            let hash = 0;
            for (let i = 0; i < hashSource.length; i++) {
              hash = ((hash << 5) - hash) + hashSource.charCodeAt(i);
              hash = hash & hash; // Convert to 32bit integer
            }
            postId = `content-${Math.abs(hash).toString(36)}`;
          }

          console.log(`[DEBUG] Post ${index}: author="${author}", text length=${text.length}, postId="${postId}"`);

          return {
            postId,
            author,
            text: text.substring(0, 500),
            timestamp: new Date().toISOString(),
            elementIndex: index  // 用於在當前頁面直接回覆
          };
        } catch (e) {
          console.error(`[DEBUG] Error processing post ${index}:`, e.message);
          return null;
        }
      }).filter(p => p && p.text && p.text.length > 20); // 至少要有 20 個字符
    });

    log(`Found ${posts.length} posts`);

    if (posts.length > 0) {
      log(`Sample post: ${posts[0].author} - "${posts[0].text.substring(0, 80)}..."`);
    }

    return posts;

  } catch (error) {
    log(`Error searching posts: ${error.message}`, 'ERROR');
    return [];
  }
}

// ========================================
// 篩選值得回覆的貼文
// ========================================

function filterPostsForReply(posts) {
  const repliedPosts = loadJSON(config.PATHS.replied);
  const repliedIds = new Set(repliedPosts.map(p => p.postId));

  const filtered = posts.filter(post => {
    if (repliedIds.has(post.postId)) {
      return false;
    }

    const lowerText = post.text.toLowerCase();
    
    // 檢查垃圾關鍵詞
    if (config.REPLY_FILTERS.exclude_keywords.some(kw => lowerText.includes(kw))) {
      return false;
    }

    // 檢查是否包含相關關鍵詞
    const hasRelevantKeyword = config.REPLY_FILTERS.include_keywords.some(kw => 
      lowerText.includes(kw.toLowerCase())
    );

    return hasRelevantKeyword;
  });

  log(`Filtered to ${filtered.length} posts worth replying to`);
  return filtered;
}

// ========================================
// 在當前頁面直接回覆（不導航離開）
// ========================================

async function replyOnCurrentPage(page, elementIndex, replyText) {
  try {
    // 找到對應的貼文元素
    const postElements = await page.$$('[class*="feed-shared-update-v2"]');

    if (elementIndex >= postElements.length) {
      log(`Element index ${elementIndex} out of range (${postElements.length} elements)`, 'WARN');
      return false;
    }

    const postElement = postElements[elementIndex];

    // 滾動到貼文位置
    await postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await randomDelay(1500, 2500);

    // LinkedIn 的 Comment 按鈕在 post 元素外部的 social actions 區域
    // 方法：找到所有 "Comment" 按鈕，選擇視覺上最接近這個 post 的那個
    const commentBtn = await page.evaluateHandle((postEl, idx) => {
      // 取得 post 元素的位置
      const postRect = postEl.getBoundingClientRect();
      const postCenterY = postRect.top + postRect.height / 2;

      // 找所有 aria-label 含 "Comment" 的按鈕
      const allCommentBtns = Array.from(document.querySelectorAll('button[aria-label="Comment"]'));

      if (allCommentBtns.length === 0) return null;

      // 對於搜尋結果頁面，Comment 按鈕的順序通常與 post 順序一致
      // 直接用 index 選擇對應的 Comment 按鈕
      if (allCommentBtns.length > idx) {
        return allCommentBtns[idx];
      }

      // Fallback: 選擇距離 post 元素最近的 Comment 按鈕
      let closestBtn = null;
      let minDistance = Infinity;

      for (const btn of allCommentBtns) {
        const btnRect = btn.getBoundingClientRect();
        const btnCenterY = btnRect.top + btnRect.height / 2;
        const distance = Math.abs(btnCenterY - postCenterY);

        // 確保按鈕在 post 附近（垂直距離不超過 post 高度的 1.5 倍）
        if (distance < minDistance && distance < postRect.height * 1.5) {
          minDistance = distance;
          closestBtn = btn;
        }
      }

      return closestBtn;
    }, postElement, elementIndex);

    const isValid = await commentBtn.evaluate(el => el !== null);
    if (!commentBtn || !isValid) {
      log('Comment button not found for this post', 'WARN');
      return false;
    }

    log(`✓ Found comment button for post ${elementIndex}`);

    await commentBtn.click();
    log('✓ Comment button clicked on current page');

    // 滾動確保 comment 區域可見
    await postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await randomDelay(2000, 3000);

    // 檢查是否有「僅限連結才能留言」的限制
    const connectionOnlyMessage = await page.$('text/Only connections can comment');
    if (connectionOnlyMessage) {
      log('⚠️ Post restricted to connections only, skipping...', 'WARN');
      return false;
    }

    // 找留言框 - 使用多個選擇器和等待
    let commentBox = null;
    const commentBoxSelectors = [
      // LinkedIn 2024-2025 常見選擇器
      '.ql-editor[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      '[data-placeholder*="Add a comment"]',
      '.comments-comment-box__form-container [contenteditable="true"]',
      '.comments-comment-texteditor [contenteditable="true"]',
      '.editor-content[contenteditable="true"]',
      'div.ql-editor[data-placeholder]',
      // 新增：更多 LinkedIn 變體
      '.comments-comment-box [contenteditable="true"]',
      '[class*="comment"] [contenteditable="true"]',
      '[aria-label*="comment" i] [contenteditable="true"]',
      'form[class*="comment"] [contenteditable="true"]'
    ];

    // 先等待一段時間讓 UI 完全載入
    log('Waiting for comment box to appear...');
    await randomDelay(1500, 2000);

    // 嘗試等待留言框出現
    for (const selector of commentBoxSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000, visible: true });
        commentBox = await page.$(selector);
        if (commentBox) {
          log(`✓ Comment box found with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // 繼續嘗試下一個選擇器
      }
    }

    // 如果還找不到，嘗試用 evaluate 找任何可編輯區域
    if (!commentBox) {
      log('Trying to find comment box via evaluate...');
      const handle = await page.evaluateHandle(() => {
        // 找所有 contenteditable 元素
        const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
        // 過濾掉隱藏的和 post 編輯器（只要 comment 相關的）
        const visible = editables.filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 &&
                 style.display !== 'none' && style.visibility !== 'hidden';
        });
        // 返回最下面的那個（通常是最近打開的 comment box）
        if (visible.length > 0) {
          return visible[visible.length - 1];
        }
        return null;
      });

      const isValid = await handle.evaluate(el => el !== null);
      if (handle && isValid) {
        commentBox = handle;
        log('✓ Comment box found via evaluate (last visible contenteditable)');
      }
    }

    if (!commentBox) {
      // 截圖以便調試
      const screenshotPath = `/Users/lman/twitter-curator/debug-no-commentbox-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
      log(`Screenshot saved: ${screenshotPath}`, 'DEBUG');
      log('Comment box not found after clicking', 'WARN');
      return false;
    }

    // 輸入留言
    await commentBox.click();
    await randomDelay(500, 1000);
    await page.keyboard.type(replyText, { delay: 30 });
    log(`✓ Reply typed (${replyText.length} characters)`);
    await randomDelay(1000, 2000);

    // 找提交按鈕 - 使用多個選擇器和策略
    log('Looking for Post/Submit button...');
    let submitBtn = null;

    const submitButtonSelectors = [
      'button.comments-comment-box__submit-button',
      'button.comments-comment-box__submit-button--cr',
      'form.comments-comment-box__form button[type="submit"]',
      'button.artdeco-button--primary[type="submit"]',
      'button[aria-label*="Post"]',
      'button[class*="comment"][class*="submit"]',
      '.comments-comment-box button.artdeco-button--primary',
      'button.comments-comment-box-comment__submit-button'
    ];

    // 等待一下讓按鈕出現（在輸入文字後）
    await randomDelay(500, 1000);

    // 嘗試每個選擇器
    for (const selector of submitButtonSelectors) {
      try {
        submitBtn = await page.$(selector);
        if (submitBtn) {
          // 確認按鈕是可見且可點擊的
          const isVisible = await submitBtn.evaluate(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 &&
                   style.display !== 'none' && style.visibility !== 'hidden';
          });

          if (isVisible) {
            log(`✓ Submit button found with selector: ${selector}`);
            break;
          }
          submitBtn = null;
        }
      } catch (e) {
        // 繼續嘗試下一個
      }
    }

    // 如果還找不到，用 evaluate 尋找包含 "Post" 文字的按鈕
    if (!submitBtn) {
      log('Trying to find Post button by text...');
      const buttonHandle = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // 找最近的留言區域內的 Post 按鈕
        const commentArea = document.querySelector('.comments-comment-box, form.comments-comment-box__form');
        if (commentArea) {
          const btnsInCommentArea = Array.from(commentArea.querySelectorAll('button'));
          return btnsInCommentArea.find(btn =>
            btn.textContent.trim().toLowerCase() === 'post' ||
            btn.getAttribute('aria-label')?.toLowerCase().includes('post')
          );
        }
        // Fallback: 全域搜尋
        return buttons.find(btn =>
          (btn.textContent.trim().toLowerCase() === 'post' ||
           btn.getAttribute('aria-label')?.toLowerCase().includes('post')) &&
          btn.getBoundingClientRect().width > 0
        );
      });

      const isValid = await buttonHandle.evaluate(el => el !== null);
      if (buttonHandle && isValid) {
        submitBtn = buttonHandle;
        log('✓ Post button found via text search');
      }
    }

    if (submitBtn) {
      await submitBtn.click();
      log('✓ Reply submitted via Post button');
      await randomDelay(4000, 6000);
      return true;
    } else {
      log('❌ Post button not found, cannot submit reply', 'ERROR');
      // 截圖以便調試
      const screenshotPath = `/Users/lman/twitter-curator/debug-no-postbutton-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
      log(`Screenshot saved: ${screenshotPath}`, 'DEBUG');
      return false;
    }

  } catch (error) {
    log(`Error replying on current page: ${error.message}`, 'ERROR');
    return false;
  }
}

// ========================================
// 發送回覆（改進版 - 直接在 Feed 頁面回覆）
// ========================================

async function replyToPost(page, post, replyText) {
  try {
    if (config.DRY_RUN) {
      log(`[DRY RUN] Would reply to ${post.author}: "${replyText}"`, 'INFO');
      return true;
    }

    log(`Replying to ${post.author}...`);

    // 策略 1: 嘗試在當前頁面找到該貼文並回覆（避免導航問題）
    if (post.elementIndex !== undefined) {
      log(`Trying to reply on current page (element index: ${post.elementIndex})...`);
      const replySuccess = await replyOnCurrentPage(page, post.elementIndex, replyText);
      if (replySuccess) {
        // 記錄已回覆（與導航方式相同的記錄邏輯）
        const replied = loadJSON(config.PATHS.replied);
        replied.push({
          postId: post.postId,
          postText: post.text.substring(0, 100),
          postAuthor: post.author,
          reply: replyText,
          timestamp: new Date().toISOString(),
          method: 'in-page-reply'
        });
        saveJSON(config.PATHS.replied, replied);
        incrementReplyCount();
        log(`✅ Reply recorded for ${post.author}`);
        return true;
      }
      log('Failed to reply on current page, trying navigation method...', 'WARN');
    }

    // 策略 2: 導航到貼文頁面（備用方案）
    // 只在 postId 不是臨時 ID 時嘗試
    if (post.postId && !post.postId.startsWith('temp-')) {
      const postUrl = `https://www.linkedin.com/feed/update/${post.postId}`;
      log(`Navigating to: ${postUrl}`);
      await page.goto(postUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      await randomDelay(3000, 5000);

      // 檢查頁面是否正常加載
      const hasError = await page.$('text=Something went wrong');
      if (hasError) {
        log('Post page failed to load, skipping...', 'WARN');
        return false;
      }
    } else {
      log(`Invalid postId: ${post.postId}, cannot navigate`, 'WARN');
      return false;
    }

    // === 步驟 1: 點擊 Comment 按鈕（使用多個策略）===
    log('Looking for Comment button...');
    let commentClicked = false;

    // 策略 1: 使用 aria-label
    const commentButtonSelectors = [
      'button[aria-label*="Comment"]',
      'button[aria-label*="comment"]',
      'button[data-test-icon="comment-medium"]',
      'button.comment-button',
      'button[class*="comment"]'
    ];

    for (const selector of commentButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          log(`✓ Comment button clicked (selector: ${selector})`);
          commentClicked = true;
          await randomDelay(2000, 3000);
          break;
        }
      } catch (e) {
        log(`Failed with selector ${selector}: ${e.message}`, 'DEBUG');
      }
    }

    // 策略 2: 如果找不到按鈕，嘗試通過文字查找
    if (!commentClicked) {
      log('Trying to find Comment button by text...');
      try {
        const buttonHandle = await page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.find(btn =>
            btn.textContent.toLowerCase().includes('comment') ||
            btn.getAttribute('aria-label')?.toLowerCase().includes('comment')
          );
        });

        if (buttonHandle) {
          await buttonHandle.click();
          log('✓ Comment button clicked (by text search)');
          commentClicked = true;
          await randomDelay(2000, 3000);
        }
      } catch (e) {
        log(`Text search failed: ${e.message}`, 'WARN');
      }
    }

    if (!commentClicked) {
      log('Comment button not found, comment box might already be visible', 'WARN');
    }

    // === 步驟 2: 找到並輸入留言框（使用多個策略）===
    log('Looking for comment input box...');
    let commentBox = null;
    let selectorUsed = null;

    // 多個可能的留言框選擇器
    const commentBoxSelectors = [
      'div.ql-editor[contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[data-placeholder*="comment"]',
      'div.comments-comment-box__form-container div[contenteditable="true"]',
      'div.comments-comment-texteditor div[contenteditable="true"]',
      'div[aria-label*="comment" i][contenteditable="true"]',
      'textarea[placeholder*="comment" i]',
      'div.editor-content[contenteditable="true"]'
    ];

    for (const selector of commentBoxSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        commentBox = await page.$(selector);
        if (commentBox) {
          selectorUsed = selector;
          log(`✓ Comment box found (selector: ${selector})`);
          break;
        }
      } catch (e) {
        // 繼續嘗試下一個選擇器
      }
    }

    // 如果還是找不到，嘗試通過屬性查找
    if (!commentBox) {
      log('Trying alternative method to find comment box...');
      try {
        const boxHandle = await page.evaluateHandle(() => {
          // 查找所有 contenteditable 元素
          const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
          // 優先選擇在留言區域的元素
          return editables.find(el => {
            const parent = el.closest('.comments-comment-box, .comments-comment-texteditor');
            return parent !== null;
          }) || editables[editables.length - 1]; // 取最後一個作為備用
        });

        if (boxHandle && boxHandle.asElement()) {
          commentBox = boxHandle.asElement();
          selectorUsed = 'fallback-method';
          log('✓ Comment box found (fallback method)');
        }
      } catch (e) {
        log(`Fallback method failed: ${e.message}`, 'ERROR');
      }
    }

    if (!commentBox) {
      throw new Error('Comment box not found with any selector');
    }

    // === 步驟 3: 輸入回覆內容 ===
    log('Typing reply...');
    await commentBox.click();
    await randomDelay(500, 1000);

    // 清空現有內容（如果有的話）
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await randomDelay(300, 500);

    // 輸入回覆
    await commentBox.type(replyText, { delay: 30 });
    log(`✓ Reply typed (${replyText.length} characters)`);
    await randomDelay(1500, 2500);

    // === 步驟 4: 點擊發送按鈕 ===
    log('Looking for Submit button...');
    let submitButton = null;

    const submitButtonSelectors = [
      'button[class*="comments-comment-box__submit-button"]',
      'button[type="submit"]',
      'button[aria-label*="Post" i]',
      'button[class*="comment"][class*="submit"]',
      'button.artdeco-button--primary'
    ];

    for (const selector of submitButtonSelectors) {
      try {
        submitButton = await page.$(selector);
        if (submitButton) {
          // 確認按鈕是可見且可點擊的
          const isVisible = await page.evaluate(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }, submitButton);

          if (isVisible) {
            log(`✓ Submit button found (selector: ${selector})`);
            break;
          }
        }
        submitButton = null;
      } catch (e) {
        // 繼續嘗試
      }
    }

    // 通過文字查找發送按鈕
    if (!submitButton) {
      log('Trying to find Submit button by text...');
      try {
        const buttonHandle = await page.evaluateHandle(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.find(btn =>
            btn.textContent.trim().toLowerCase() === 'post' ||
            btn.textContent.trim().toLowerCase() === 'submit' ||
            btn.getAttribute('aria-label')?.toLowerCase().includes('post')
          );
        });

        if (buttonHandle && buttonHandle.asElement()) {
          submitButton = buttonHandle.asElement();
          log('✓ Submit button found (by text)');
        }
      } catch (e) {
        log(`Text search for submit button failed: ${e.message}`, 'WARN');
      }
    }

    if (!submitButton) {
      throw new Error('Submit button not found');
    }

    // 點擊發送
    await submitButton.click();
    log('✓ Submit button clicked');
    await randomDelay(4000, 6000);

    log(`✅ Reply sent to ${post.author}`);

    // 記錄已回覆
    const replied = loadJSON(config.PATHS.replied);
    replied.push({
      postId: post.postId,
      postText: post.text.substring(0, 100),
      postAuthor: post.author,
      reply: replyText,
      timestamp: new Date().toISOString(),
      url: postUrl,
      selectorUsed: selectorUsed // 記錄使用的選擇器
    });
    saveJSON(config.PATHS.replied, replied);

    incrementReplyCount();
    return true;

  } catch (error) {
    log(`❌ Error replying: ${error.message}`, 'ERROR');
    log(`Stack trace: ${error.stack}`, 'DEBUG');

    // 截圖以便調試
    try {
      const screenshotPath = `/Users/lman/twitter-curator/error-screenshot-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath });
      log(`Screenshot saved: ${screenshotPath}`, 'DEBUG');
    } catch (screenshotError) {
      log(`Failed to save screenshot: ${screenshotError.message}`, 'DEBUG');
    }

    return false;
  }
}

// ========================================
// 主函數
// ========================================

async function main() {
  const mode = process.argv.includes('--mode') 
    ? process.argv[process.argv.indexOf('--mode') + 1]
    : 'post';

  log(`=== LinkedIn Curator Started (Mode: ${mode}) ===`);
  log(`DRY RUN: ${config.DRY_RUN ? 'YES' : 'NO'}`);

  let browser;

  try {
    const persona = fs.readFileSync(config.PERSONA_FILE, 'utf-8');
    log('Persona loaded successfully');

    log('Launching browser...');
    const userDataDir = path.join(__dirname, 'chrome-user-data-linkedin');

    browser = await puppeteer.launch({
      headless: config.HEADLESS,
      userDataDir: userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      defaultViewport: {
        width: 1280,
        height: 800
      }
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    const loggedIn = await loginToLinkedIn(page);
    if (!loggedIn) {
      throw new Error('Failed to login to LinkedIn');
    }

    // ========================================
    // POST 模式：發布 1 則貼文
    // ========================================

    if (mode === 'post') {
      if (canPost()) {
        log('\n--- Generating LinkedIn post ---');

        // 使用加權主題選擇（如果有 TOPIC_CATEGORIES）
        const topic = config.TOPIC_CATEGORIES
          ? selectWeightedTopic(config.TOPIC_CATEGORIES)
          : selectRandomTopic(config.TOPICS);
        log(`Selected topic: ${topic}`);

        let postText;

        // 使用事實核查系統（如果可用）
        if (factChecker) {
          log('🔍 Using fact-checker system...');
          try {
            const context = { platform: 'LinkedIn', tone: 'Professional' };
            const result = await factChecker.generateLinkedInPost(topic, context);

            // 🆕 2025-12-14: 處理 rejected 狀態
            if (result.status === 'rejected') {
              log(`❌ Content rejected: ${result.rejectionReason}`, 'ERROR');
              log('🔄 Skipping this post to prevent meta-instruction leak');
              postText = null;
            } else {
              postText = result.finalPost;
              log(`✅ Fact-check score: ${result.factCheck.score}/100`);
              if (result.requiresReview) {
                log('⚠️  Content requires review, but proceeding...', 'WARN');
              }
            }
          } catch (error) {
            log(`Fact-checker error, falling back to original: ${error.message}`, 'WARN');
            postText = await generateLinkedInPost(persona, topic);
          }
        } else {
          postText = await generateLinkedInPost(persona, topic);
        }

        if (postText) {
          await postLinkedInPost(page, postText);
          await randomDelay(config.DELAYS.after_post);
        } else {
          log('⚠️  No valid post content generated, skipping', 'WARN');
        }
      } else {
        log('Skipping post - daily limit reached');
      }
    }

    // ========================================
    // REPLY 模式：回覆 1 則貼文
    // ========================================

    if (mode === 'reply') {
      if (canReply()) {
        log('\n--- Finding posts to reply to ---');

        const posts = await searchRelevantPosts(page);
        const worthReplyingTo = filterPostsForReply(posts);

        if (worthReplyingTo.length > 0) {
          let replySent = false;
          const maxAttempts = Math.min(worthReplyingTo.length, 5); // 最多嘗試 5 篇

          for (let i = 0; i < maxAttempts && !replySent; i++) {
            const post = worthReplyingTo[i];

            log(`\n--- Processing post ${i + 1}/${maxAttempts} from ${post.author} ---`);
            log(`Post: ${post.text.substring(0, 100)}...`);

            const replyText = await generateLinkedInReply(post.text, post.author, persona);

            if (replyText) {
              const success = await replyToPost(page, post, replyText);
              if (success) {
                replySent = true;
                await randomDelay(config.DELAYS.after_reply);
              } else {
                log(`Failed to reply to post ${i + 1}, trying next...`, 'WARN');
                await randomDelay(2000, 3000); // 短暫等待後嘗試下一篇
              }
            }
          }

          if (!replySent) {
            log('❌ Failed to reply to any posts after multiple attempts', 'ERROR');
          }
        } else {
          log('No suitable posts found to reply to');
        }
      } else {
        log('Skipping reply - daily limit reached');
      }
    }

    const { stats, today } = getDailyStats();
    log(`\n📊 Today's stats: ${stats[today].posts} posts, ${stats[today].replies} replies`);

  } catch (error) {
    log(`Main error: ${error.message}`, 'ERROR');
    log(error.stack, 'ERROR');
  } finally {
    if (browser) {
      await browser.close();
      log('Browser closed');
    }
  }
}

// 執行
if (require.main === module) {
  main().catch(error => {
    log(`Unhandled error: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = { main };
