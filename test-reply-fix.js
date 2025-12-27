#!/usr/bin/env node

/**
 * Test script for Twitter Curator reply fix
 * Tests the new cleanContent and cleanAndValidate functions
 */

// Mock test cases
const testCases = [
  {
    name: "Meta-instruction leak (should be rejected)",
    input: "We need to reply as Lman, startup builder, AI/tech expert. The tweet gives specs: Arc Pro B60...",
    expectedResult: null
  },
  {
    name: "Valid reply with FINAL REPLY marker",
    input: "FINAL REPLY: Interesting approach! I've seen similar patterns work well in production. How does it handle edge cases?",
    expectedResult: "Interesting approach! I've seen similar patterns work well in production. How does it handle edge cases?"
  },
  {
    name: "Valid reply in quotes",
    input: '"Great insight! This resonates with what we\'re building at IrisGo. The key is balancing performance with user experience."',
    expectedResult: "Great insight! This resonates with what we're building at IrisGo. The key is balancing performance with user experience."
  },
  {
    name: "Meta-instruction with Step markers (should be rejected)",
    input: "Step 1: We need to reply as Lman, a startup builder. Step 2: The reply should be max 280 chars.",
    expectedResult: null
  }
];

// Import the functions (simplified for testing)
function cleanContent(content) {
  console.log(`[DEBUG] Cleaning content, length: ${content.length}`);

  const metaInstructionKeywords = [
    'We need to reply as',
    'We need to respond as',
    'We should reply',
    'Let me analyze',
    'Step 1:',
    'Step 2:',
    'Requirements:',
    'Format your response',
    'Output ONLY'
  ];

  // Extract "FINAL REPLY:" content
  const finalReplyMatch = content.match(/FINAL REPLY:\s*(.+?)(?:\n|$)/i);
  if (finalReplyMatch) {
    const extracted = finalReplyMatch[1].trim();
    console.log(`[INFO] Extracted from FINAL REPLY marker`);
    return cleanAndValidate(extracted, metaInstructionKeywords);
  }

  // Extract quoted content
  const allQuotes = content.match(/"([^"]+)"/g);
  if (allQuotes && allQuotes.length > 0) {
    const promptKeywords = ['Topic:', 'Requirements:', 'Max 280', 'Style:', 'Write a tweet'];

    const validQuotes = allQuotes
      .map(q => q.replace(/"/g, '').trim())
      .filter(q => {
        if (q.length < 20) return false;
        if (promptKeywords.some(kw => q.includes(kw))) return false;
        if (metaInstructionKeywords.some(kw => q.includes(kw))) return false;
        return true;
      });

    if (validQuotes.length > 0) {
      const longest = validQuotes.reduce((a, b) => a.length > b.length ? a : b);
      console.log(`[INFO] Extracted from quotes`);
      return cleanAndValidate(longest, metaInstructionKeywords);
    }
  }

  // Fallback
  console.log('[WARN] Using fallback cleaning');
  const cleaned = content
    .replace(/^["']|["']$/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanAndValidate(cleaned, metaInstructionKeywords);
}

function cleanAndValidate(text, metaInstructionKeywords) {
  const cleaned = text
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 280);

  // Validate: reject if contains meta-instructions
  for (const keyword of metaInstructionKeywords) {
    if (cleaned.includes(keyword)) {
      console.log(`[ERROR] Meta-instruction detected: "${keyword}"`);
      return null;
    }
  }

  // Validate: reject if too short
  if (cleaned.length < 10) {
    console.log('[ERROR] Content too short');
    return null;
  }

  console.log(`[SUCCESS] Valid content extracted`);
  return cleaned;
}

// Run tests
console.log('🧪 Testing Twitter Reply Fix\n');
console.log('=' .repeat(80));

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name}`);
  console.log('-'.repeat(80));
  console.log(`Input: ${testCase.input.substring(0, 100)}...`);

  const result = cleanContent(testCase.input);

  const testPassed = result === testCase.expectedResult;

  if (testPassed) {
    console.log('✅ PASS');
    passed++;
  } else {
    console.log('❌ FAIL');
    console.log(`Expected: ${testCase.expectedResult}`);
    console.log(`Got: ${result}`);
    failed++;
  }
});

console.log('\n' + '='.repeat(80));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
  console.log('\n🎉 All tests passed! The fix is working correctly.\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the implementation.\n');
  process.exit(1);
}
