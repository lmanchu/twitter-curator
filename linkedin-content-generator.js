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
 * 使用 Ollama 生成 LinkedIn 原創貼文
 */
async function generateLinkedInPost(persona, topic) {
  const personaSummary = extractPersonaSummary(persona);

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

  const prompt = `Write a professional LinkedIn post as Lman (Co-Founder at IrisGo.AI).

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
 * 使用 Ollama 生成 LinkedIn 回覆
 */
async function generateLinkedInReply(postText, postAuthor, persona) {
  // 檢查是否使用動漫類比
  const animeAnalogy = getLinkedInAnimeAnalogy(postText);

  let prompt;
  if (animeAnalogy) {
    // 有動漫類比的版本
    prompt = `You are Lman, Co-Founder at IrisGo.AI. Write a professional LinkedIn comment reply.

Post to reply to: "${postText}"

Include this insight naturally in your reply: "${animeAnalogy}"

Step 1: Think about how to incorporate the insight naturally (internal)
Step 2: Write your final reply

Requirements:
- 200-350 characters
- Professional, concise, add value
- No hashtags

Format your response as:
FINAL REPLY: [your actual LinkedIn comment here]`;
  } else {
    // 標準版本
    prompt = `You are Lman, Co-Founder at IrisGo.AI. Write a professional LinkedIn comment reply.

Post to reply to: "${postText}"

Step 1: Think about the best response approach (internal)
Step 2: Write your final reply

Requirements:
- 150-300 characters
- Professional, concise, respectful
- No hashtags

Format your response as:
FINAL REPLY: [your actual LinkedIn comment here]`;
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
  // ✅ 驗證：檢查 meta-instruction
  for (const keyword of metaKeywords) {
    if (content.includes(keyword)) {
      console.log(`[ERROR] Meta-instruction detected: "${keyword}". Rejecting.`);
      return null;
    }
  }

  // ✅ 驗證：長度檢查
  if (content.length < 100) {
    console.log('[ERROR] Content too short. Rejecting.');
    return null;
  }

  console.log('[SUCCESS] Valid LinkedIn post extracted');
  return finalizeLinkedInPost(content, topic);
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

  // ✅ Meta-instruction 關鍵字
  const metaKeywords = [
    'We need to reply',
    'We need to write',
    'Thinking',
    'Step 1:',
    'Step 2:',
    'Requirements:',
    'Format your response',
    'Output ONLY',
    'Reply to this'
  ];

  // ✅ 優先：提取 "FINAL REPLY:" 後的內容
  const finalReplyMatch = content.match(/FINAL REPLY:\s*(.+?)(?:\n|$)/i);
  if (finalReplyMatch) {
    const extracted = finalReplyMatch[1].trim();
    console.log('[INFO] Extracted from FINAL REPLY marker');
    return validateReply(extracted, metaKeywords);
  }

  // ✅ 次選：提取引號內的內容
  const quoteMatches = content.match(/"([^"]{30,500}[.!?])"/g);
  if (quoteMatches && quoteMatches.length > 0) {
    const lastQuote = quoteMatches[quoteMatches.length - 1];
    const extracted = lastQuote.replace(/"/g, '').trim();
    console.log('[INFO] Extracted from quotes');
    return validateReply(extracted, metaKeywords);
  }

  // ✅ Fallback
  console.log('[WARN] Using fallback cleaning');
  const cleaned = content
    .replace(/^["']|["']$/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return validateReply(cleaned, metaKeywords);
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
 * 隨機選擇主題
 */
function selectRandomTopic(topics) {
  // 如果沒有傳入 topics，使用預設主題列表
  const defaultTopics = [
    'Enterprise AI',
    'On-Premise AI',
    'AI Product Strategy',
    'Startup Journey',
    'Product Management'
  ];

  const topicsToUse = topics || defaultTopics;
  return topicsToUse[Math.floor(Math.random() * topicsToUse.length)];
}

module.exports = {
  loadPersona,
  generateLinkedInPost,
  generateLinkedInReply,
  selectRandomTopic,
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
