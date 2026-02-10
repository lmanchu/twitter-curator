#!/usr/bin/env node
/**
 * Test Content Sanitizer
 * Verifies that sanitizeContent() correctly blocks leaked content
 */

const { sanitizeContent } = require('./publisher.js');

// Test cases - these should all be BLOCKED
const SHOULD_BLOCK = [
  // AI response prefixes
  "Here's the corrected LinkedIn post, edited without emojis:\n\nActual content here",
  "I'll write:\n\n\"Some content here\"",
  "Below is the draft post:\n\nContent",

  // System names leaked
  "Our MAGI system includes Apollo, Hermes, and Iris agents.",
  "Apollo generated this content automatically.",

  // Automation exposure
  "This post was auto-generated using our AI system.",
  "Content generation complete. Here's the result:",

  // Prompt instructions leaked
  "Make sure to avoid mentioning company names. Use 2C perspective.",
  "Call to action: ask readers to share their experiences.",

  // Technical stack
  "Using CLIProxyAPI with Gemini 2.5 Flash for generation.",
  "Powered by Puppeteer automation"
];

// Test cases - these should PASS
const SHOULD_PASS = [
  "We at IrisGo believe in on-device AI that respects your privacy.",
  "The future of personal AI is context-aware computing.",
  "Edge AI is transforming how we think about productivity tools.",
  "Our approach focuses on understanding individual needs, not just processing data."
];

console.log('╔════════════════════════════════════════════╗');
console.log('║     Content Sanitizer Test Suite          ║');
console.log('╚════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

console.log('Testing BLOCK patterns (should be rejected):\n');

SHOULD_BLOCK.forEach((test, i) => {
  const result = sanitizeContent(test);
  const blocked = (result === null);

  if (blocked) {
    console.log(`✅ Test ${i + 1}: BLOCKED (correct)`);
    console.log(`   "${test.substring(0, 60)}..."\n`);
    passed++;
  } else {
    console.log(`❌ Test ${i + 1}: PASSED (incorrect - should be blocked!)`);
    console.log(`   "${test.substring(0, 60)}..."\n`);
    failed++;
  }
});

console.log('\nTesting PASS patterns (should be approved):\n');

SHOULD_PASS.forEach((test, i) => {
  const result = sanitizeContent(test);
  const approved = (result !== null);

  if (approved) {
    console.log(`✅ Test ${SHOULD_BLOCK.length + i + 1}: PASSED (correct)`);
    console.log(`   "${test.substring(0, 60)}..."\n`);
    passed++;
  } else {
    console.log(`❌ Test ${SHOULD_BLOCK.length + i + 1}: BLOCKED (incorrect - should pass!)`);
    console.log(`   "${test.substring(0, 60)}..."\n`);
    failed++;
  }
});

console.log('═════════════════════════════════════════════');
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed === 0) {
  console.log('\n🎉 All tests passed! Content sanitizer is working correctly.\n');
  process.exit(0);
} else {
  console.log(`\n⚠️  ${failed} test(s) failed. Review sanitizer logic.\n`);
  process.exit(1);
}
