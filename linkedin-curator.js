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
const { generateLinkedInPost, generateLinkedInReply, selectRandomTopic } = require('./linkedin-content-generator');

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
  const today = new Date().toISOString().split('T')[0];

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
// 搜尋相關貼文
// ========================================

async function searchRelevantPosts(page) {
  try {
    log('Searching for relevant LinkedIn posts...');

    const keywords = config.SEARCH_KEYWORDS;
    const searchTerm = keywords[Math.floor(Math.random() * keywords.length)];

    log(`Searching for: "${searchTerm}"`);

    const searchUrl = `${config.LINKEDIN_URLS.search}?keywords=${encodeURIComponent(searchTerm)}`;
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // 給頁面更多時間加載內容
    log('Waiting for search results to load...');
    await randomDelay(5000, 7000);

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

          // 如果沒有找到 postId，使用 index 作為臨時 ID
          if (!postId) {
            postId = `temp-${Date.now()}-${index}`;
          }

          console.log(`[DEBUG] Post ${index}: author="${author}", text length=${text.length}, postId="${postId}"`);

          return {
            postId,
            author,
            text: text.substring(0, 500),
            timestamp: new Date().toISOString()
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
// 發送回覆（改進版 - 多個備用選擇器）
// ========================================

async function replyToPost(page, post, replyText) {
  try {
    if (config.DRY_RUN) {
      log(`[DRY RUN] Would reply to ${post.author}: "${replyText}"`, 'INFO');
      return true;
    }

    log(`Replying to ${post.author}...`);

    const postUrl = `https://www.linkedin.com/feed/update/${post.postId}`;
    await page.goto(postUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await randomDelay(3000, 5000);

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

        const topic = selectRandomTopic(config.TOPICS);
        log(`Selected topic: ${topic}`);

        let postText;

        // 使用事實核查系統（如果可用）
        if (factChecker) {
          log('🔍 Using fact-checker system...');
          try {
            const context = { platform: 'LinkedIn', tone: 'Professional' };
            const result = await factChecker.generateLinkedInPost(topic, context);
            postText = result.finalPost;
            log(`✅ Fact-check score: ${result.factCheck.score}/100`);
            if (result.requiresReview) {
              log('⚠️  Content requires review, but proceeding...', 'WARN');
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
          const post = worthReplyingTo[0];

          log(`\n--- Processing post from ${post.author} ---`);
          log(`Post: ${post.text.substring(0, 100)}...`);

          const replyText = await generateLinkedInReply(post.text, post.author, persona);

          if (replyText) {
            await replyToPost(page, post, replyText);
            await randomDelay(config.DELAYS.after_reply);
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
