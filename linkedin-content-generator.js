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

Requirements:
- Length: 600-1000 characters
- English only
- Professional yet conversational
- Include a hook in the first line
- Share personal insights or expertise
- End with a question or call-to-action
- Use paragraph breaks for readability
- 3-5 relevant hashtags at the end

Output ONLY the LinkedIn post text, nothing else:`;

  try {
    const response = await callOllamaAPI(prompt);
    return cleanLinkedInContent(response, topic);
  } catch (error) {
    console.error('Error generating LinkedIn post:', error.message);
    return null;
  }
}

/**
 * 使用 Ollama 生成 LinkedIn 回覆
 */
async function generateLinkedInReply(postText, postAuthor, persona) {
  const prompt = `You are Lman, Co-Founder at IrisGo.AI. Write a professional LinkedIn comment reply.

Post to reply to: "${postText}"

Write a 150-300 character professional reply. Be concise, add value, and be respectful. No hashtags.

Your reply:`;

  try {
    const response = await callOllamaAPI(prompt);
    return cleanReplyContent(response);
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
  // 對於短回覆，優先使用非思考型模型
  const models = ['qwen2.5:14b', 'qwen2.5vl:3b', 'gpt-oss:20b'];

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

      if (data.thinking) {
        console.log(`[INFO] Using model: ${model}`);
        return data.thinking;
      } else if (data.response) {
        console.log(`[INFO] Using model: ${model}`);
        return data.response;
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
  const promptKeywords = ['Topic:', 'Requirements:', 'Output ONLY', 'Co-Founder at'];
  if (promptKeywords.some(kw => content.includes(kw))) {
    console.log('[WARN] Model output contains prompt keywords, trying to extract...');

    const quoteMatches = content.match(/"([^"]{100,2000}[.!?])"/g);
    if (quoteMatches && quoteMatches.length > 0) {
      const lastQuote = quoteMatches[quoteMatches.length - 1];
      const extracted = lastQuote.replace(/"/g, '').trim();
      if (!promptKeywords.some(kw => extracted.includes(kw))) {
        return finalizeLinkedInPost(extracted, topic);
      }
    }

    console.log('[ERROR] Could not extract clean LinkedIn post');
    return null;
  }

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

  const promptKeywords = ['Requirements:', 'Output ONLY', 'Author:', 'Reply to this'];

  // 如果包含 prompt 關鍵詞，嘗試提取實際回覆
  if (promptKeywords.some(kw => content.includes(kw))) {
    console.log('[WARN] Reply contains prompt keywords, extracting...');

    // 策略 1: 提取引號內的內容
    const quoteMatches = content.match(/"([^"]{30,500}[.!?])"/g);
    if (quoteMatches && quoteMatches.length > 0) {
      const lastQuote = quoteMatches[quoteMatches.length - 1];
      const extracted = lastQuote.replace(/"/g, '').trim();
      if (!promptKeywords.some(kw => extracted.includes(kw)) && extracted.length >= 50) {
        console.log('[INFO] Extracted from quotes:', extracted.substring(0, 80) + '...');
        return extracted.substring(0, 500);
      }
    }

    // 策略 2: 查找 "Output ONLY" 後的內容
    const afterOutput = content.split('Output ONLY the reply text:').pop();
    if (afterOutput && afterOutput.trim().length >= 30) {
      const cleaned = afterOutput.trim().split('\n')[0];
      if (!promptKeywords.some(kw => cleaned.includes(kw)) && cleaned.length >= 50) {
        console.log('[INFO] Extracted after "Output ONLY":', cleaned.substring(0, 80) + '...');
        return cleaned.substring(0, 500);
      }
    }

    // 策略 3: 提取各種格式的回覆內容
    const writePatterns = [
      /Draft:\s*["']([^"']{50,500})["']/i,
      /Your reply:\s*["']([^"']{50,500})["']/i,
      /Let's write:\s*["']([^"']{50,500})["']/i,
      /Here's the reply:\s*["']([^"']{50,500})["']/i,
      /Reply:\s*["']([^"']{50,500})["']/i,
      /^["']([^"']{50,500})["']$/m  // 單獨一行的引號內容
    ];

    for (const pattern of writePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const extracted = match[1].trim();
        if (!promptKeywords.some(kw => extracted.includes(kw))) {
          console.log('[INFO] Extracted using pattern match:', extracted.substring(0, 80) + '...');
          return extracted.substring(0, 500);
        }
      }
    }

    // 策略 4: 提取最後一個完整句子
    const sentences = content.split(/[.!?]\s+/);
    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i].trim();
      if (sentence.length >= 50 && sentence.length <= 500 &&
          !promptKeywords.some(kw => sentence.includes(kw))) {
        console.log('[INFO] Extracted last sentence:', sentence.substring(0, 80) + '...');
        return sentence;
      }
    }

    console.log('[ERROR] Could not extract clean reply, returning null');
    return null;
  }

  // 正常清理
  const cleaned = content
    .replace(/^["']|["']$/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/#\w+/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '') // Remove emojis
    .trim()
    .substring(0, 300); // Enforce 300 character limit

  console.log('[INFO] Cleaned reply:', cleaned.substring(0, 80) + '...');
  return cleaned;
}

/**
 * 隨機選擇主題
 */
function selectRandomTopic(topics) {
  return topics[Math.floor(Math.random() * topics.length)];
}

module.exports = {
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
