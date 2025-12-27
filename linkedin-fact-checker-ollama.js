#!/usr/bin/env node

/**
 * LinkedIn Fact Checker - Ollama Version
 *
 * 用途: 確保 LinkedIn 貼文基於真實事實，消除幻想內容
 * 架構: Draft → Fact-Check → Correct
 * API: Ollama (本地 LLM)
 *
 * v2.3 - 2025-12-14: 修復 prompt leak bug
 *   - stripThinkingBlock 新增 "We should/must/can/have" 過濾
 *   - 新增 meta-instruction 最終驗證，返回 null 如果檢測到殘留指令
 *   - correctWithFacts 處理 null，返回 'rejected' 狀態
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Ollama 配置
const OLLAMA_MODEL = 'gpt-oss:20b'; // 使用你現有的模型
const OLLAMA_FALLBACK = 'qwen3-vl:30b'; // Fallback model

// 載入 Ground Truth 資料庫
function loadGroundTruth() {
  const groundTruthPath = path.join(
    process.env.HOME,
    'Dropbox/PKM-Vault/.ai-butler-system/ground-truth/lman-public-facts.json'
  );

  if (!fs.existsSync(groundTruthPath)) {
    throw new Error('Ground Truth 資料庫不存在');
  }

  return JSON.parse(fs.readFileSync(groundTruthPath, 'utf8'));
}

// 載入 LinkedIn 內容準則
function loadContentGuidelines() {
  const guidelinesPath = path.join(
    process.env.HOME,
    'Dropbox/PKM-Vault/.ai-butler-system/shared-context/linkedin-content-guidelines.md'
  );

  if (fs.existsSync(guidelinesPath)) {
    return fs.readFileSync(guidelinesPath, 'utf8');
  }

  return null;
}

// 調用 Ollama HTTP API (非互動式，適合 LaunchAgent)
async function callOllama(prompt) {
  const url = 'http://localhost:11434/api/generate';
  const models = [OLLAMA_MODEL, OLLAMA_FALLBACK];

  for (const model of models) {
    try {
      const payload = {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 2000,
          top_p: 0.9,
        }
      };

      // 使用 curl 呼叫 Ollama HTTP API
      const command = `curl -s -X POST '${url}' \
        -H 'Content-Type: application/json' \
        -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}'`;

      const response = execSync(command, { encoding: 'utf-8', timeout: 120000 });
      const data = JSON.parse(response);

      // gpt-oss model puts content in 'thinking' field
      if (data.thinking) {
        console.log(`   [INFO] Using model: ${model}`);
        return data.thinking;
      } else if (data.response) {
        console.log(`   [INFO] Using model: ${model}`);
        return data.response;
      }

      throw new Error('No valid response from model');

    } catch (error) {
      console.log(`   [WARN] Model ${model} failed: ${error.message}, trying next...`);
      continue;
    }
  }

  throw new Error('All Ollama models failed');
}

/**
 * 身份池 - 避免每篇貼文都提 IrisGo
 */
const IDENTITY_POOLS = {
  industry: [
    'Lman, a tech entrepreneur and AI observer',
    'Lman, startup founder with 10+ years in tech',
    'Lman, AI/blockchain veteran and industry commentator'
  ],
  personal: [
    'Lman, serial entrepreneur and lifelong learner',
    'Lman, tech founder sharing lessons from the trenches'
  ],
  product: [
    'Lman (building privacy-first AI at IrisGo.AI)',
    'Lman, Co-Founder at IrisGo.AI'
  ],
  technical: [
    'Lman, on-premise AI advocate and builder',
    'Lman, former blockchain founder turned AI entrepreneur'
  ]
};

function categorizeTopicType(topic) {
  const topicLower = topic.toLowerCase();
  if (topicLower.includes('irisgo') || topicLower.includes('on-premise ai') ||
      topicLower.includes('privacy-first') || topicLower.includes('personal ai assistant')) {
    return 'product';
  }
  if (topicLower.includes('llm') || topicLower.includes('edge ai') || topicLower.includes('local-first')) {
    return 'technical';
  }
  if (topicLower.includes('lesson') || topicLower.includes('failure') ||
      topicLower.includes('mental health') || topicLower.includes('productivity')) {
    return 'personal';
  }
  return 'industry';
}

function selectIdentity(topic) {
  const category = categorizeTopicType(topic);
  const pool = IDENTITY_POOLS[category];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Step 1: 生成草稿（創意層）
async function generateDraft(topic, context) {
  const groundTruth = loadGroundTruth();
  const guidelines = loadContentGuidelines();
  const identity = selectIdentity(topic);
  const topicType = categorizeTopicType(topic);

  // 根據主題類型決定是否使用 Ground Truth
  const useGroundTruth = topicType === 'product' || topicType === 'technical';
  const companyRule = topicType === 'product'
    ? '- You MAY mention IrisGo.AI naturally if relevant to the topic'
    : '- Do NOT mention any company name - focus on general industry insights';

  const prompt = `You are writing a LinkedIn post as ${identity}.

**CRITICAL RULES** (Must follow):
1. ❌ Never fabricate numbers, case studies, or experiences
2. ❌ Never create fictional clients, partners, or projects
3. ✅ You may use emphatic language for emotional impact (without changing facts)
4. ✅ You may discuss future vision (but clearly label as "vision" or "goal")
${useGroundTruth ? `5. ✅ You may reference facts from the Ground Truth Database below` : '5. ✅ Focus on general industry observations and personal insights'}

${useGroundTruth ? `**Ground Truth Database (optional reference)**:\n${JSON.stringify(groundTruth, null, 2)}\n` : ''}
${guidelines ? `**Content Guidelines**:\n${guidelines}\n` : ''}

**Topic**: ${topic}

**Additional Context**: ${context ? JSON.stringify(context, null, 2) : 'None'}

**Requirements**:
- Language: English only (LinkedIn is an international platform)
- Tone: Passionate but honest, professional yet authentic
- Length: 600-1000 characters
- Structure: Hook → Core insight → Real examples → Call-to-action
${companyRule}

Generate the LinkedIn post directly, no additional explanation.`;

  console.log('   呼叫 Ollama (gpt-oss:20b)...');
  const result = await callOllama(prompt);

  // ✅ 過濾掉模型的思考過程 (Thinking... 到 ...done thinking.)
  const cleaned = stripThinkingBlock(result);
  return cleaned;
}

/**
 * 過濾掉 LLM 的思考過程區塊 (v2.3)
 * 完整版本，與 linkedin-content-generator.js 保持同步
 * 2025-12-14 修復：新增 "We should/must/have" 等模式
 */
function stripThinkingBlock(content) {
  let cleaned = content;

  // 1. 移除 "Thinking..." 到 "...done thinking." 的區塊
  cleaned = cleaned.replace(/Thinking\.{3}[\s\S]*?\.{3}done thinking\.\s*/gi, '');

  // 2. 移除 "<thinking>" 到 "</thinking>" 的 XML 標籤形式
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '');

  // 3. 移除 "[post]" 開頭的指令行 (整行)
  cleaned = cleaned.replace(/^\[post\].*$/gim, '');

  // 4. 移除 "We need..." 開頭的指令行 (整行) - 擴展更多動詞
  cleaned = cleaned.replace(/^We need\s+(to\s+)?(produce|write|ensure|create|make|decide|avoid|mention|use|include|focus|consider|highlight|check).*$/gim, '');
  // 4a. 🆕 移除 "We need a prediction/hook/opening..." 形式 (2025-12-14)
  cleaned = cleaned.replace(/^We need\s+a\s+(prediction|hook|opening|closing|call|cta|question|statement|strong|bold|creative|compelling|engaging).*$/gim, '');

  // 4b. 🆕 移除 "We should..." 開頭的指令行 (2025-12-14 新增)
  cleaned = cleaned.replace(/^We should\s+(not\s+)?(produce|write|ensure|create|make|decide|avoid|mention|use|include|focus|consider|highlight|check|claim|keep).*$/gim, '');

  // 4c. 🆕 移除 "We must..." 開頭的指令行 (2025-12-14 新增)
  cleaned = cleaned.replace(/^We must\s+(not\s+)?(produce|write|ensure|create|make|decide|avoid|mention|use|include|focus|consider|highlight|check).*$/gim, '');

  // 4d. 🆕 移除 "We can..." 開頭的指令行 (2025-12-14 新增)
  cleaned = cleaned.replace(/^We can\s+(say|write|mention|use|include|add).*$/gim, '');

  // 4e. 🆕 移除 "We have many facts..." 開頭的指令行 (2025-12-14 新增)
  cleaned = cleaned.replace(/^We have\s+(many\s+)?(facts|verified|confirmed).*$/gim, '');

  // 4f. 🆕 移除 "Include metrics..." 開頭的指令行 (2025-12-14 新增)
  cleaned = cleaned.replace(/^Include\s+(metrics|numbers|statistics|data).*$/gim, '');

  // 4g. 🆕 移除模板標記行 "Core insight:", "Real examples:", "Call-to-action:" (2025-12-14)
  cleaned = cleaned.replace(/^(Core insight|Real examples?|Call-to-action|Opening hook|Main point|Key message|Closing|CTA):\s*["']?.*$/gim, '');

  // 4h. 🆕 移除 "e.g.," / "e.g.:" 開頭的範例行 (2025-12-14)
  cleaned = cleaned.replace(/^e\.g\.[,:]\s*["']?.*$/gim, '');

  // 4i. 🆕 移除 "Count approximate/roughly" 開頭的計算行 (2025-12-14)
  cleaned = cleaned.replace(/^Count\s+(approximate|roughly|about|the|characters|words).*$/gim, '');

  // 4j. 🆕 移除 "We'll write/draft/create" 開頭的指令行 (2025-12-14)
  cleaned = cleaned.replace(/^We'll\s+(write|draft|create|make|produce|use|include|add|start|begin).*$/gim, '');

  // 4k. 🆕 移除 "We will" 開頭的指令行 (2025-12-14)
  cleaned = cleaned.replace(/^We will\s+(write|draft|create|make|produce|use|include|add|start|begin|need).*$/gim, '');

  // 5. 移除 "Let's..." 開頭的思考行 (整行)
  cleaned = cleaned.replace(/^Let's\s+(aim|count|draft|approximate|see|check|think|write|plan|structure|organize|ensure|make sure|keep|stay|target|shoot for|produce|craft|create).*$/gim, '');

  // 5b. 移除 "Ok. Let's..." 形式
  cleaned = cleaned.replace(/^Ok\.?\s*Let's.*$/gim, '');

  // 5c. 移除 "Also mention..." 形式的思考行
  cleaned = cleaned.replace(/^Also\s+(mention|include|add|note|avoid|use|focus|consider|highlight).*$/gim, '');

  // 5d. 移除 "Should not mention..." 形式
  cleaned = cleaned.replace(/^Should\s+(not\s+)?(mention|include|avoid|use|focus).*$/gim, '');

  // 6. 移除字數/段落計算行 (整行，包含數字範圍的)
  cleaned = cleaned.replace(/^.*\d+[-–]\d+\s*characters?.*$/gim, '');
  cleaned = cleaned.replace(/^.*~?\d+\s*characters?\.?\s*$/gim, '');
  cleaned = cleaned.replace(/^Count\s+(characters|words|roughly).*$/gim, '');
  cleaned = cleaned.replace(/^.*Rough\s+estimate.*$/gim, '');
  cleaned = cleaned.replace(/^Draft:?\s*$/gim, '');
  cleaned = cleaned.replace(/^.*paragraph breaks?:.*$/gim, '');
  cleaned = cleaned.replace(/^.*\d+\s*paragraphs?.*$/gim, '');
  cleaned = cleaned.replace(/^.*need to keep within.*$/gim, '');
  cleaned = cleaned.replace(/^.*each paragraph.*\d+\s*chars?.*$/gim, '');
  cleaned = cleaned.replace(/^.*\d+\s*char(s)?\s*(per|each).*$/gim, '');

  // 7. 移除純指令短句 (整行)
  cleaned = cleaned.replace(/^(Count roughly|That's hook|That's about|Structure:|Format:|Note:|Remember:).*$/gim, '');

  // 8. 移除結構標籤前綴但保留內容 (Hook:, CTA:, etc.)
  cleaned = cleaned.replace(/\b(Hook:|End with question:|Personal insight:|Then story:|The challenge:|Solution:|Result:)\s*/gim, '');

  // 9. 移除行內的指令片段 (不刪除整行)
  cleaned = cleaned.replace(/\s*Paragraph breaks?:\s*\d+\s*paragraphs?\.?\s*/gi, ' ');
  cleaned = cleaned.replace(/\s*\d+-\d+\s*hashtags?\.?\s*/gi, ' ');
  cleaned = cleaned.replace(/\s*CTA:\s*["']?Share your experiences!?["']?\s*/gi, '\n\nShare your experiences!');

  // 9b. 🆕 移除行內 meta-instruction (2025-12-14 - 修復 prompt leak)
  cleaned = cleaned.replace(/Check length:.*?(\.|\n)/gi, '');
  cleaned = cleaned.replace(/Let's draft and count.*?(\.|\n)/gi, '');
  cleaned = cleaned.replace(/We'll approximate\.?\s*/gi, '');
  cleaned = cleaned.replace(/Count approximate:.*?(\.|\n)/gi, '');
  cleaned = cleaned.replace(/We'll write and then.*?(\.|\n)/gi, '');

  // 10. 移除行尾的 meta 註解
  cleaned = cleaned.replace(/\s*That's\s+(hook|about|the\s+challenge|solution|result)\.?\s*$/gim, '');

  // 11. 移除獨立的數字標記
  cleaned = cleaned.replace(/\s+\d{3,4}\.\s*/g, ' ');

  // 12. 清理重複的空格
  cleaned = cleaned.replace(/  +/g, ' ');

  // 13. 清理多餘空行
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 14. 移除開頭結尾空白
  cleaned = cleaned.trim();

  // 15. 🆕 最終驗證：如果還有 meta-instruction 就返回 null (2025-12-14 新增)
  const metaKeywords = [
    'We should produce',
    'We must ensure',
    'We need to',
    'We need a',        // 🆕 catch "We need a prediction/hook"
    'We have many facts',
    'We can say',
    'Include metrics',
    'fabricated claims',
    'verified facts',
    'exaggerated',
    'Use conservative',
    'Use allowed',
    'Format your response',
    'Output ONLY',
    'So we can write',
    'Counterintuitive observation:',
    'Avoid banned openings',
    'Core insight:',    // 🆕 catch template markers
    'Real examples:',   // 🆕
    'Call-to-action:',  // 🆕
    'e.g.,',            // 🆕 catch example markers
    'e.g.:',            // 🆕
    'Count approximate', // 🆕 catch calculation markers
    "We'll write",      // 🆕
    "We'll draft",      // 🆕
    'We will write',    // 🆕
    'We will draft',    // 🆕
    'Check length:',    // 🆕
    "Let's draft and count", // 🆕
    "We'll approximate" // 🆕
  ];

  for (const keyword of metaKeywords) {
    if (cleaned.includes(keyword)) {
      console.log(`[ERROR] Meta-instruction still present after cleaning: "${keyword}"`);
      console.log(`[DEBUG] Content preview: ${cleaned.substring(0, 200)}...`);
      return null;
    }
  }

  // 16. 🆕 長度驗證：太短的內容可能是殘留碎片
  if (cleaned.length < 100) {
    console.log(`[ERROR] Content too short after cleaning: ${cleaned.length} chars`);
    return null;
  }

  return cleaned;
}

// Step 2: 事實核查（驗證層）
async function factCheckDraft(draft) {
  const groundTruth = loadGroundTruth();

  const prompt = `你是嚴格的事實核查員。

**任務**: 檢查以下 LinkedIn 貼文中的所有具體陳述。

**貼文草稿**:
${draft}

**Ground Truth（唯一事實來源）**:
${JSON.stringify(groundTruth, null, 2)}

**檢查要求**:
1. 找出所有具體陳述（數字、案例、經歷、技術細節）
2. 對每個陳述判定:
   - VERIFIED: 在 Ground Truth 有明確證據
   - EXAGGERATED: 基於事實但誇大
   - FABRICATED: 找不到證據（幻想）
   - UNCERTAIN: 無法確定

3. 計算可信度評分 (0-100)
4. 對問題陳述提供修正建議

**輸出 JSON 格式**:
{
  "statements": [
    {
      "text": "陳述內容",
      "verdict": "VERIFIED/EXAGGERATED/FABRICATED/UNCERTAIN",
      "reasoning": "判斷理由",
      "suggestion": "修正建議（如需要）"
    }
  ],
  "score": 85,
  "summary": "總結",
  "needsReview": false
}

只輸出 JSON，不要其他文字。`;

  console.log('   呼叫 Ollama 進行事實核查...');
  const result = await callOllama(prompt);

  // 提取 JSON
  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('無法解析事實核查結果');
  }

  return JSON.parse(jsonMatch[0]);
}

// Step 3: 修正草稿（修正層）
async function correctDraft(draft, factCheck) {
  const groundTruth = loadGroundTruth();

  const prompt = `根據事實核查結果修正 LinkedIn 貼文。

**原始草稿**:
${draft}

**事實核查結果**:
${JSON.stringify(factCheck, null, 2)}

**Ground Truth**:
${JSON.stringify(groundTruth, null, 2)}

**修正要求**:
1. ❌ 移除所有 FABRICATED 陳述
2. ⚠️ 調整 EXAGGERATED 陳述（保留合理誇張）
3. ✅ 保留 VERIFIED 陳述
4. 🤷 UNCERTAIN 改為保守表述

5. Corrected version must:
   - Still be engaging and compelling
   - 100% based on verified facts
   - Natural, professional tone
   - English only (LinkedIn international audience)

Output the corrected full post directly, no other explanation.`;

  console.log('   呼叫 Ollama 進行修正...');
  const result = await callOllama(prompt);

  // ✅ 過濾掉模型的思考過程
  const cleaned = stripThinkingBlock(result);
  return cleaned;
}

// 主流程
async function generateLinkedInPost(topic, context = null) {
  console.log('🚀 LinkedIn Post Generator with Fact-Checking (Ollama)\n');
  console.log(`📦 使用模型: ${OLLAMA_MODEL}\n`);

  try {
    // Step 1: 生成草稿
    console.log('📝 Step 1: 生成創意草稿...');
    const startDraft = Date.now();
    const draft = await generateDraft(topic, context);
    const draftTime = ((Date.now() - startDraft) / 1000).toFixed(1);
    console.log(`\n✅ 草稿完成 (${draftTime}s)\n`);
    console.log('─'.repeat(60));
    console.log(draft);
    console.log('─'.repeat(60));
    console.log();

    // Step 2: 事實核查
    console.log('🔍 Step 2: 事實核查中...');
    const startCheck = Date.now();
    const factCheck = await factCheckDraft(draft);
    const checkTime = ((Date.now() - startCheck) / 1000).toFixed(1);
    console.log(`\n✅ 核查完成 (${checkTime}s)`);
    console.log(`📊 可信度評分: ${factCheck.score}/100`);
    console.log(`🔍 需要人工審查: ${factCheck.needsReview ? '是' : '否'}\n`);

    // 顯示問題陳述
    const issues = factCheck.statements.filter(s =>
      s.verdict !== 'VERIFIED'
    );

    if (issues.length > 0) {
      console.log('⚠️ 發現的問題:\n');
      issues.forEach((issue, i) => {
        const emoji = {
          'FABRICATED': '❌',
          'UNCERTAIN': '🤷',
          'EXAGGERATED': '⚠️'
        }[issue.verdict] || '⚠️';
        console.log(`${i + 1}. ${emoji} ${issue.verdict}`);
        console.log(`   陳述: "${issue.text.substring(0, 80)}..."`);
        console.log(`   理由: ${issue.reasoning}`);
        if (issue.suggestion) {
          console.log(`   建議: ${issue.suggestion}`);
        }
        console.log();
      });
    } else {
      console.log('✅ 所有陳述都經過驗證！\n');
    }

    // Step 3: 修正（如果需要）
    let finalPost = draft;
    if (factCheck.score < 100 || issues.length > 0) {
      console.log('✏️ Step 3: 修正草稿...');
      const startCorrect = Date.now();
      finalPost = await correctDraft(draft, factCheck);
      const correctTime = ((Date.now() - startCorrect) / 1000).toFixed(1);

      // 🆕 2025-12-14: 檢查修正結果是否有效
      if (!finalPost) {
        console.log(`\n❌ 修正後內容無效（可能包含 meta-instruction），放棄發布`);
        return {
          status: 'rejected',
          draft,
          factCheck,
          finalPost: null,
          requiresReview: true,
          rejectionReason: 'Content contained meta-instructions after correction'
        };
      }

      console.log(`\n✅ 修正完成 (${correctTime}s)\n`);
      console.log('─'.repeat(60));
      console.log(finalPost);
      console.log('─'.repeat(60));
    } else {
      console.log('✅ 草稿完全準確，無需修正\n');

      // 🆕 2025-12-14: 即使草稿準確，也要驗證無 meta-instruction
      finalPost = stripThinkingBlock(draft);
      if (!finalPost) {
        console.log(`\n❌ 草稿包含 meta-instruction，放棄發布`);
        return {
          status: 'rejected',
          draft,
          factCheck,
          finalPost: null,
          requiresReview: true,
          rejectionReason: 'Draft contained meta-instructions'
        };
      }
    }

    return {
      status: factCheck.score < 100 ? 'corrected' : 'approved',
      draft,
      factCheck,
      finalPost,
      requiresReview: factCheck.needsReview
    };

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    throw error;
  }
}

// CLI 介面
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
用法: node linkedin-fact-checker-ollama.js <topic> [context]

範例:
  node linkedin-fact-checker-ollama.js "MAGI 系統的最新進展"
  node linkedin-fact-checker-ollama.js "Building IrisGo" "最近完成了事實核查系統"

選項:
  --help     顯示幫助
  --test     測試模式（使用預設主題）
`);
    process.exit(0);
  }

  const topic = args[0] === '--test' ? 'MAGI 系統的最新進展' : args[0];
  const context = args[1] || null;

  const totalStart = Date.now();
  const result = await generateLinkedInPost(topic, context);
  const totalTime = ((Date.now() - totalStart) / 1000).toFixed(1);

  // 輸出結果
  console.log('\n\n' + '='.repeat(70));
  console.log('📋 最終版本（可直接複製到 LinkedIn）');
  console.log('='.repeat(70));
  console.log();
  console.log(result.finalPost);
  console.log();
  console.log('='.repeat(70));
  console.log(`\n📊 可信度評分: ${result.factCheck.score}/100`);
  console.log(`📏 字數: ${result.finalPost.length} 字符`);
  console.log(`⏱️  總耗時: ${totalTime}s`);
  console.log(`✅ 狀態: ${result.status === 'approved' ? '已通過核查' : '已修正'}`);

  if (result.requiresReview) {
    console.log('\n⚠️ 建議人工審查後再發布');
  } else {
    console.log('\n✅ 可直接發布');
  }
}

// 如果直接執行
if (require.main === module) {
  main().catch(console.error);
}

// 匯出供其他腳本使用
module.exports = {
  generateLinkedInPost,
  loadGroundTruth,
  factCheckDraft,
  correctDraft
};
