#!/usr/bin/env node

/**
 * LinkedIn Fact-Checker Cross-Validation System
 *
 * 使用 Gemini + Ollama 雙重驗證以提高可信度
 *
 * 架構:
 * - Gemini 2.5 Flash: 快速事實核查
 * - Ollama (deepseek-r1): 深度邏輯驗證
 * - 交叉驗證: 比對兩者結果,標記不一致之處
 *
 * 優勢:
 * - 降低單一模型幻想風險
 * - 提供多角度驗證
 * - 自動標記需人工審查的內容
 */

const fs = require('fs');
const path = require('path');
const geminiFactChecker = require('./linkedin-fact-checker-gemini');
const geminiClient = require('../Iris/scripts/lib/gemini-client');

/**
 * 使用 Ollama 進行事實核查
 * @param {string} draft - 草稿內容
 * @returns {Promise<object>} 核查結果
 */
async function ollamaFactCheck(draft) {
  const groundTruth = geminiFactChecker.loadGroundTruth();

  const prompt = `You are a fact-checker. Analyze this LinkedIn post draft for factual accuracy.

DRAFT TO CHECK:
"""
${draft}
"""

GROUND TRUTH DATABASE (only source of verified facts):
"""
${JSON.stringify(groundTruth, null, 2)}
"""

TASK:
1. List ALL specific claims (numbers, events, timelines, technical details)
2. For each claim, determine:
   - VERIFIED: Explicitly supported by Ground Truth
   - EXAGGERATED: Based on facts but overstated
   - FABRICATED: Not found in Ground Truth
   - UNCERTAIN: Cannot determine

3. Output ONLY valid JSON in this exact format:
{
  "statements": [
    {
      "original": "the claim text",
      "verdict": "VERIFIED|EXAGGERATED|FABRICATED|UNCERTAIN",
      "reasoning": "why this verdict",
      "evidence": "ground truth evidence if any"
    }
  ],
  "overallScore": 85,
  "summary": "brief assessment",
  "requiresHumanReview": false
}

Output ONLY the JSON object, nothing else.`;

  try {
    // 使用 Ollama API
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-r1:latest',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 2048
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.response;

    // 提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Ollama response');
    }

    const result = JSON.parse(jsonMatch[0]);
    result.provider = 'Ollama (deepseek-r1)';
    return result;

  } catch (error) {
    console.error(`⚠️  Ollama fact-check failed: ${error.message}`);
    // 返回中性結果而非失敗
    return {
      statements: [],
      overallScore: 50,
      summary: `Ollama validation failed: ${error.message}`,
      requiresHumanReview: true,
      provider: 'Ollama (failed)',
      error: error.message
    };
  }
}

/**
 * 交叉驗證兩個事實核查結果
 * @param {object} geminiResult - Gemini 核查結果
 * @param {object} ollamaResult - Ollama 核查結果
 * @returns {object} 交叉驗證報告
 */
function crossValidate(geminiResult, ollamaResult) {
  const report = {
    timestamp: new Date().toISOString(),
    geminiScore: geminiResult.overallScore,
    ollamaScore: ollamaResult.overallScore,
    scoreDifference: Math.abs(geminiResult.overallScore - ollamaResult.overallScore),
    consensus: true,
    discrepancies: [],
    finalScore: 0,
    requiresHumanReview: false,
    recommendation: ''
  };

  // 1. 比對整體評分
  if (report.scoreDifference > 20) {
    report.consensus = false;
    report.requiresHumanReview = true;
    report.discrepancies.push({
      type: 'SCORE_MISMATCH',
      detail: `Gemini gave ${geminiResult.overallScore}, Ollama gave ${ollamaResult.overallScore}`,
      severity: 'HIGH'
    });
  }

  // 2. 比對關鍵陳述的判定
  const geminiStatements = geminiResult.statements || [];
  const ollamaStatements = ollamaResult.statements || [];

  // 找出重大不一致(一個說 VERIFIED,另一個說 FABRICATED)
  geminiStatements.forEach(gStmt => {
    ollamaStatements.forEach(oStmt => {
      // 簡單的文本相似度檢查(可改用更精確的方法)
      if (gStmt.original && oStmt.original &&
          gStmt.original.toLowerCase().includes(oStmt.original.toLowerCase().substring(0, 30))) {

        const gVerdict = gStmt.verdict;
        const oVerdict = oStmt.verdict;

        // 檢查嚴重衝突
        if ((gVerdict === 'VERIFIED' && oVerdict === 'FABRICATED') ||
            (gVerdict === 'FABRICATED' && oVerdict === 'VERIFIED')) {
          report.consensus = false;
          report.requiresHumanReview = true;
          report.discrepancies.push({
            type: 'VERDICT_CONFLICT',
            statement: gStmt.original,
            geminiVerdict: gVerdict,
            ollamaVerdict: oVerdict,
            severity: 'CRITICAL'
          });
        }
      }
    });
  });

  // 3. 決定最終評分(保守策略: 取較低分)
  report.finalScore = Math.min(geminiResult.overallScore, ollamaResult.overallScore);

  // 4. 如果任一方要求人工審查
  if (geminiResult.requiresHumanReview || ollamaResult.requiresHumanReview) {
    report.requiresHumanReview = true;
  }

  // 5. 生成建議
  if (report.finalScore >= 90 && report.consensus) {
    report.recommendation = 'APPROVED - Both validators agree, high confidence';
  } else if (report.finalScore >= 70 && report.consensus) {
    report.recommendation = 'APPROVED - Minor issues, but consensus achieved';
  } else if (report.finalScore >= 50 && !report.consensus) {
    report.recommendation = 'REVIEW REQUIRED - Validators disagree on key points';
  } else {
    report.recommendation = 'REJECT - Low confidence, multiple issues found';
  }

  return report;
}

/**
 * 完整的交叉驗證流程
 * @param {string} topic - 主題
 * @param {object} context - 額外 context
 * @returns {Promise<object>} 完整驗證結果
 */
async function generateWithCrossValidation(topic, context = null) {
  console.log('🔍 LinkedIn Post Generation with Cross-Validation\n');
  console.log('─'.repeat(70));

  try {
    // Step 1: 使用 Gemini fact-checker 生成初稿並核查
    console.log('Step 1: Gemini fact-checking (Draft → Check → Correct)...');
    const geminiResult = await geminiFactChecker.generateLinkedInPost(topic, context);

    if (!geminiResult || !geminiResult.finalPost) {
      throw new Error('Gemini fact-checker failed to generate content');
    }

    console.log(`✅ Gemini complete (Score: ${geminiResult.factCheck.overallScore}/100)\n`);

    // Step 2: 對最終版本再用 Ollama 驗證
    console.log('Step 2: Ollama cross-validation...');
    const ollamaResult = await ollamaFactCheck(geminiResult.finalPost);
    console.log(`✅ Ollama complete (Score: ${ollamaResult.overallScore}/100)\n`);

    // Step 3: 交叉驗證
    console.log('Step 3: Cross-validation analysis...');
    const validation = crossValidate(geminiResult.factCheck, ollamaResult);
    console.log(`✅ Validation complete\n`);

    // 顯示結果
    console.log('─'.repeat(70));
    console.log('📊 CROSS-VALIDATION REPORT');
    console.log('─'.repeat(70));
    console.log(`Gemini Score:     ${validation.geminiScore}/100`);
    console.log(`Ollama Score:     ${validation.ollamaScore}/100`);
    console.log(`Final Score:      ${validation.finalScore}/100`);
    console.log(`Consensus:        ${validation.consensus ? '✅ YES' : '⚠️  NO'}`);
    console.log(`Human Review:     ${validation.requiresHumanReview ? '⚠️  REQUIRED' : '✅ Not needed'}`);
    console.log(`Recommendation:   ${validation.recommendation}`);

    if (validation.discrepancies.length > 0) {
      console.log('\n⚠️  DISCREPANCIES FOUND:');
      validation.discrepancies.forEach((disc, i) => {
        console.log(`\n${i + 1}. ${disc.type} [${disc.severity}]`);
        console.log(`   ${disc.detail || disc.statement}`);
        if (disc.geminiVerdict) {
          console.log(`   - Gemini: ${disc.geminiVerdict}`);
          console.log(`   - Ollama: ${disc.ollamaVerdict}`);
        }
      });
    }

    console.log('\n' + '─'.repeat(70));
    console.log('📝 FINAL POST');
    console.log('─'.repeat(70));
    console.log(geminiResult.finalPost);
    console.log('─'.repeat(70));

    // 如果需要人工審查,保存到審查隊列
    if (validation.requiresHumanReview) {
      const reviewPath = path.join(__dirname, 'linkedin-cross-validation-review.json');
      let reviews = [];
      try {
        if (fs.existsSync(reviewPath)) {
          reviews = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
        }
      } catch (error) {
        console.error(`Warning: Could not load review queue: ${error.message}`);
      }

      reviews.push({
        timestamp: validation.timestamp,
        topic: topic,
        finalPost: geminiResult.finalPost,
        geminiResult: geminiResult.factCheck,
        ollamaResult: ollamaResult,
        validation: validation
      });

      fs.writeFileSync(reviewPath, JSON.stringify(reviews, null, 2));
      console.log('\n⚠️  Saved to review queue: linkedin-cross-validation-review.json');
    }

    return {
      success: true,
      finalPost: geminiResult.finalPost,
      geminiResult: geminiResult,
      ollamaResult: ollamaResult,
      validation: validation
    };

  } catch (error) {
    console.error(`\n❌ Cross-validation error: ${error.message}`);
    throw error;
  }
}

// CLI 介面
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
LinkedIn Fact-Checker with Cross-Validation

用法:
  node linkedin-fact-checker-cross-validate.js <topic> [context]

範例:
  node linkedin-fact-checker-cross-validate.js "Building IrisGo Platform"
  node linkedin-fact-checker-cross-validate.js "AI Privacy Solutions" "Recent progress"

說明:
  - 使用 Gemini 2.5 Flash 生成並核查內容
  - 使用 Ollama (deepseek-r1) 交叉驗證
  - 自動標記需要人工審查的內容
  - 保守策略: 有疑問就要求審查
`);
    process.exit(0);
  }

  const topic = args[0];
  const context = args[1] || null;

  try {
    const result = await generateWithCrossValidation(topic, context);

    if (result.success) {
      console.log('\n✅ Cross-validation complete');
      process.exit(0);
    } else {
      console.log('\n⚠️  Cross-validation completed with warnings');
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// 執行
if (require.main === module) {
  main().catch(console.error);
}

// 匯出供其他腳本使用
module.exports = {
  generateWithCrossValidation,
  ollamaFactCheck,
  crossValidate
};
