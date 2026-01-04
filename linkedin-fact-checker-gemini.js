#!/usr/bin/env node

/**
 * LinkedIn Fact Checker
 *
 * 用途: 確保 LinkedIn 貼文基於真實事實，消除幻想內容
 * 架構: Draft → Fact-Check → Correct
 * API: CLIProxyAPI (unified AI proxy - OAuth-based, no quota limits)
 */

const fs = require('fs');
const path = require('path');

// CLIProxyAPI configuration (unified AI proxy)
const CLIPROXY_URL = process.env.CLIPROXY_URL || 'http://127.0.0.1:8317';
const CLIPROXY_API_KEY = process.env.CLIPROXY_API_KEY || 'magi-proxy-key-2026';
const CLIPROXY_MODEL = process.env.CLIPROXY_MODEL || 'gemini-2.5-flash';

// Helper function to call CLIProxyAPI
async function callAI(prompt, maxTokens = 2048) {
  const response = await fetch(`${CLIPROXY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CLIPROXY_API_KEY}`
    },
    body: JSON.stringify({
      model: CLIPROXY_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: maxTokens
    })
  });

  const data = await response.json();

  if (!data.choices || !data.choices[0].message.content) {
    throw new Error('Invalid response from CLIProxyAPI');
  }

  return data.choices[0].message.content;
}

// 載入 Ground Truth 資料庫
function loadGroundTruth() {
  const groundTruthPath = path.join(
    process.env.HOME,
    'Dropbox/PKM-Vault/.ai-butler-system/ground-truth/lman-public-facts.json'
  );

  if (!fs.existsSync(groundTruthPath)) {
    throw new Error('Ground Truth 資料庫不存在，請先執行 Step 1');
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

// Step 1: 生成草稿（創意層）
async function generateDraft(topic, context) {
  const groundTruth = loadGroundTruth();
  const guidelines = loadContentGuidelines();

  const prompt = `你是 Lman 的 LinkedIn 內容創作助理。

**CRITICAL RULES**（絕對遵守）:
1. ❌ 不要編造任何數字、案例、或經歷
2. ❌ 不要創造不存在的客戶、合作夥伴、或項目
3. ✅ 只使用以下「Ground Truth 資料庫」中明確記載的事實
4. ✅ 可以用誇張的語氣強調情感和影響（但不改變事實）
5. ✅ 可以展望未來願景（但要明確標記為「願景」或「目標」）

**Ground Truth 資料庫（唯一的事實來源）**:
\`\`\`json
${JSON.stringify(groundTruth, null, 2)}
\`\`\`

${guidelines ? `**內容準則**:\n${guidelines}\n` : ''}

**主題**: ${topic}

**額外 Context** (如果有):
${context ? JSON.stringify(context, null, 2) : '無'}

**要求**:
- 語氣: 熱情但誠實，專業但真實
- 長度: 1200-1500 字符
- 結構: 開場 → 洞察 → 故事/案例 → 結論/行動呼籲
- 如果 Ground Truth 資料不足，使用更保守的表述:
  - "我們正在探索..." 而非 "我們已經完成..."
  - "初步測試顯示..." 而非 "經過驗證..."
  - "目標是..." 而非 "已經實現..."

請生成 LinkedIn 貼文草稿。`;

  return await callAI(prompt);
}

// Step 2: 事實核查（驗證層）
async function factCheckDraft(draft) {
  const groundTruth = loadGroundTruth();

  const prompt = `你是一個嚴格的事實核查員。

**任務**: 檢查以下 LinkedIn 貼文草稿中的每一個陳述。

**草稿**:
\`\`\`
${draft}
\`\`\`

**Ground Truth 資料庫（唯一的事實來源）**:
\`\`\`json
${JSON.stringify(groundTruth, null, 2)}
\`\`\`

**要求**:
1. 列出所有「具體陳述」（數字、案例、經歷、時間線、技術細節）
2. 對每個陳述標記:
   - ✅ VERIFIED: 在 Ground Truth 中有明確證據
   - ⚠️ EXAGGERATED: 基於事實但誇大程度過高
   - ❌ FABRICATED: 在 Ground Truth 中找不到證據（幻想）
   - 🤷 UNCERTAIN: 無法確定（需要人工確認）

3. 對於 FABRICATED 和 UNCERTAIN 的陳述，建議替代表述

**輸出 JSON 格式**:
\`\`\`json
{
  "statements": [
    {
      "original": "原始陳述",
      "verdict": "VERIFIED | EXAGGERATED | FABRICATED | UNCERTAIN",
      "reasoning": "判斷理由",
      "evidence": "在 Ground Truth 中的證據（如果有）",
      "suggestion": "建議修正（如果需要）"
    }
  ],
  "overallScore": 85,
  "summary": "簡短總結",
  "requiresHumanReview": false
}
\`\`\`

請嚴格輸出 JSON，不要其他文字。`;

  const text = await callAI(prompt);

  // 提取 JSON（處理可能的 markdown code block）
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  return JSON.parse(jsonStr);
}

// Step 3: 修正草稿（修正層）
async function correctDraft(draft, factCheck) {
  const groundTruth = loadGroundTruth();

  const prompt = `根據事實核查結果修正 LinkedIn 貼文草稿。

**原始草稿**:
\`\`\`
${draft}
\`\`\`

**事實核查結果**:
\`\`\`json
${JSON.stringify(factCheck, null, 2)}
\`\`\`

**Ground Truth 資料庫**:
\`\`\`json
${JSON.stringify(groundTruth, null, 2)}
\`\`\`

**要求**:
1. ❌ 移除所有 FABRICATED 陳述，用建議的替代表述
2. ⚠️ 調整 EXAGGERATED 陳述（但保留合理誇張）
3. ✅ 保留所有 VERIFIED 陳述
4. 🤷 對於 UNCERTAIN 陳述，改為更保守的表述

5. 修正後的貼文必須:
   - ✅ 仍然吸引人、有感染力
   - ✅ 100% 基於 Ground Truth 的真實事實
   - ✅ 可以有合理誇張（情感強度、影響範圍）
   - ✅ 語氣保持一致、自然流暢

6. 如果刪除內容後貼文變短，用基於事實的新內容補充

輸出修正後的完整貼文（純文字，不要 markdown）。`;

  const text = await callAI(prompt);
  return text.trim();
}

// 主流程
async function generateLinkedInPost(topic, context = null) {
  console.log('🚀 LinkedIn Post Generator with Fact-Checking (CLIProxyAPI)\n');
  console.log(`   Model: ${CLIPROXY_MODEL}\n`);

  try {
    // Step 1: 生成草稿
    console.log('📝 Step 1: 生成創意草稿...');
    const draft = await generateDraft(topic, context);
    console.log('\n✅ 草稿完成\n');
    console.log('─'.repeat(60));
    console.log(draft);
    console.log('─'.repeat(60));
    console.log();

    // Step 2: 事實核查
    console.log('🔍 Step 2: 事實核查中...');
    const factCheck = await factCheckDraft(draft);
    console.log('\n✅ 核查完成');
    console.log(`可信度評分: ${factCheck.overallScore}/100`);
    console.log(`需要人工審查: ${factCheck.requiresHumanReview ? '是' : '否'}\n`);

    // 顯示問題陳述
    const issues = factCheck.statements.filter(s =>
      s.verdict === 'FABRICATED' || s.verdict === 'UNCERTAIN' || s.verdict === 'EXAGGERATED'
    );

    if (issues.length > 0) {
      console.log('⚠️ 發現的問題:\n');
      issues.forEach((issue, i) => {
        const emoji = {
          'FABRICATED': '❌',
          'UNCERTAIN': '🤷',
          'EXAGGERATED': '⚠️'
        }[issue.verdict];
        console.log(`${i + 1}. ${emoji} ${issue.verdict}`);
        console.log(`   原文: "${issue.original}"`);
        if (issue.evidence) {
          console.log(`   證據: ${issue.evidence}`);
        }
        if (issue.suggestion) {
          console.log(`   建議: ${issue.suggestion}`);
        }
        console.log();
      });
    }

    // Step 3: 修正
    if (factCheck.overallScore < 100 || issues.length > 0) {
      console.log('✏️ Step 3: 修正草稿...');
      const finalPost = await correctDraft(draft, factCheck);
      console.log('\n✅ 修正完成\n');
      console.log('─'.repeat(60));
      console.log(finalPost);
      console.log('─'.repeat(60));

      return {
        status: 'corrected',
        draft,
        factCheck,
        finalPost,
        requiresReview: factCheck.requiresHumanReview
      };
    } else {
      console.log('✅ 草稿完全準確，無需修正');
      return {
        status: 'approved',
        draft,
        factCheck,
        finalPost: draft,
        requiresReview: false
      };
    }

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
用法: linkedin-fact-checker-gemini.js <topic> [context]

範例:
  node linkedin-fact-checker-gemini.js "MAGI 系統的最新進展"
  node linkedin-fact-checker-gemini.js "Building IrisGo" "最近完成了事實核查系統"

選項:
  --help     顯示幫助
  --test     測試模式（使用預設主題）
`);
    process.exit(0);
  }

  const topic = args[0] === '--test' ? 'MAGI 系統的最新進展' : args[0];
  const context = args[1] || null;

  const result = await generateLinkedInPost(topic, context);

  // 輸出結果給 BrowserOS 使用
  console.log('\n\n' + '='.repeat(70));
  console.log('📋 最終版本（可直接複製到 LinkedIn）');
  console.log('='.repeat(70));
  console.log();
  console.log(result.finalPost);
  console.log();
  console.log('='.repeat(70));
  console.log(`\n可信度評分: ${result.factCheck.overallScore}/100`);
  console.log(`字數: ${result.finalPost.length} 字符`);
  console.log(`狀態: ${result.status === 'approved' ? '✅ 已通過核查' : '✏️ 已修正'}`);

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
