#!/usr/bin/env node

/**
 * 測試回覆驗證機制
 * 模擬之前發生的兩個 bug 情境
 */

const { generateLinkedInReply } = require('./linkedin-content-generator');
const fs = require('fs');
const os = require('os');
const path = require('path');

const personaPath = path.join(os.homedir(), 'Dropbox', 'PKM-Vault', '.ai-butler-system', 'personas', 'lman-writing-style.json');
const persona = fs.readFileSync(personaPath, 'utf-8');

console.log('🧪 Testing LinkedIn Reply Validation\n');
console.log('='.repeat(60));

// ========================================
// Test Case 1: Intel CEO 貼文（可能會複製原文）
// ========================================
console.log('\n📝 Test 1: Intel CEO Post (Potential Duplication)');
console.log('-'.repeat(60));

const intelPost = `I am honored to meet Prime Minister Modi in New Delhi yesterday. We had a wide-ranging discussion on a variety of topics related to technology, computing and the tremendous potential for India.`;

(async () => {
  try {
    const reply1 = await generateLinkedInReply(intelPost, 'Pat Gelsinger', persona);

    if (reply1) {
      console.log('✅ Reply generated:');
      console.log(reply1);
      console.log(`\nLength: ${reply1.length} characters`);

      // 驗證不是原文複製
      if (reply1.includes('honored to meet') || reply1.includes('New Delhi yesterday')) {
        console.log('❌ FAILED: Reply contains duplicated content from original post');
      } else {
        console.log('✅ PASSED: Reply is original content');
      }
    } else {
      console.log('⚠️  Reply rejected by validation (this is GOOD if it was a duplicate)');
    }

    // ========================================
    // Test Case 2: 思考過程洩漏測試
    // ========================================
    console.log('\n\n📝 Test 2: Meta-instruction Leakage Prevention');
    console.log('-'.repeat(60));

    const testPost = `AI agents are transforming how we build software. What's your experience?`;
    const reply2 = await generateLinkedInReply(testPost, 'Test User', persona);

    if (reply2) {
      console.log('✅ Reply generated:');
      console.log(reply2);
      console.log(`\nLength: ${reply2.length} characters`);

      // 驗證沒有思考過程洩漏
      const leakagePatterns = [
        'Let\'s',
        'We need',
        'Count characters',
        'wonder(',
        'space=',
        '150-250 characters',
        'Use 2-3 sentences'
      ];

      const hasLeakage = leakagePatterns.some(pattern => reply2.includes(pattern));

      if (hasLeakage) {
        console.log('❌ FAILED: Reply contains meta-instruction leakage');
      } else {
        console.log('✅ PASSED: No meta-instruction leakage detected');
      }
    } else {
      console.log('⚠️  Reply rejected by validation');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎯 Validation tests completed\n');

  } catch (error) {
    console.error('❌ Test error:', error.message);
    process.exit(1);
  }
})();
