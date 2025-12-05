#!/usr/bin/env node

/**
 * LinkedIn Fact Checker - Ollama Version
 *
 * 用途: 確保 LinkedIn 貼文基於真實事實，消除幻想內容
 * 架構: Draft → Fact-Check → Correct
 * API: Ollama (本地 LLM)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Ollama 配置
const OLLAMA_MODEL = 'gpt-oss:20b'; // 使用你現有的模型

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

// 調用 Ollama
async function callOllama(prompt) {
  return new Promise((resolve, reject) => {
    const ollama = spawn('ollama', ['run', OLLAMA_MODEL]);

    let output = '';
    let errorOutput = '';

    ollama.stdout.on('data', (data) => {
      output += data.toString();
    });

    ollama.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ollama.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Ollama exited with code ${code}: ${errorOutput}`));
      } else {
        resolve(output.trim());
      }
    });

    // 發送 prompt
    ollama.stdin.write(prompt);
    ollama.stdin.end();
  });
}

// Step 1: 生成草稿（創意層）
async function generateDraft(topic, context) {
  const groundTruth = loadGroundTruth();
  const guidelines = loadContentGuidelines();

  const prompt = `You are Lman's LinkedIn content assistant at IrisGo.AI.

**CRITICAL RULES** (Must follow):
1. ❌ Never fabricate numbers, case studies, or experiences
2. ❌ Never create fictional clients, partners, or projects
3. ✅ Only use facts explicitly documented in the "Ground Truth Database" below
4. ✅ You may use emphatic language for emotional impact (without changing facts)
5. ✅ You may discuss future vision (but clearly label as "vision" or "goal")

**Ground Truth Database (the only source of truth)**:
${JSON.stringify(groundTruth, null, 2)}

${guidelines ? `**Content Guidelines**:\n${guidelines}\n` : ''}

**Topic**: ${topic}

**Additional Context**: ${context ? JSON.stringify(context, null, 2) : 'None'}

**Requirements**:
- Language: English only (LinkedIn is an international platform)
- Tone: Passionate but honest, professional yet authentic
- Length: 600-1000 characters
- Structure: Hook → Core insight → Real examples → Call-to-action
- If Ground Truth data is insufficient, use conservative phrasing:
  - "We're exploring..." instead of "We've completed..."
  - "Early tests show..." instead of "Proven..."
  - "Our goal is..." instead of "We've achieved..."

Generate the LinkedIn post directly, no additional explanation.`;

  console.log('   呼叫 Ollama (gpt-oss:20b)...');
  const result = await callOllama(prompt);

  // ✅ 過濾掉模型的思考過程 (Thinking... 到 ...done thinking.)
  const cleaned = stripThinkingBlock(result);
  return cleaned;
}

/**
 * 過濾掉 LLM 的思考過程區塊
 */
function stripThinkingBlock(content) {
  // 移除 "Thinking..." 到 "...done thinking." 的區塊
  let cleaned = content.replace(/Thinking\.{3}[\s\S]*?\.{3}done thinking\.\s*/gi, '');

  // 也移除 "<thinking>" 到 "</thinking>" 的 XML 標籤形式
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '');

  // 移除開頭的空白
  cleaned = cleaned.replace(/^\s+/, '');

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
      console.log(`\n✅ 修正完成 (${correctTime}s)\n`);
      console.log('─'.repeat(60));
      console.log(finalPost);
      console.log('─'.repeat(60));
    } else {
      console.log('✅ 草稿完全準確，無需修正\n');
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
