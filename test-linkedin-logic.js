#!/usr/bin/env node

/**
 * LinkedIn Curator Logic Test
 * 測試核心邏輯而不需要實際瀏覽器
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 LinkedIn Curator Logic Test');
console.log('===============================\n');

// Test 1: 配置載入
console.log('Test 1: Config Loading');
console.log('----------------------');
try {
  const config = require('./linkedin-config');
  console.log('✅ Config loaded successfully');
  console.log(`  - Daily posts limit: ${config.DAILY_LIMITS.max_posts}`);
  console.log(`  - Daily replies limit: ${config.DAILY_LIMITS.max_replies}`);
  console.log(`  - Topics count: ${config.TOPICS.length}`);
  console.log(`  - DRY_RUN: ${config.DRY_RUN}`);
  console.log(`  - HEADLESS: ${config.HEADLESS}`);
} catch (error) {
  console.log('❌ Config loading failed:', error.message);
}

console.log('');

// Test 2: Content Generator
console.log('Test 2: Content Generator Functions');
console.log('-----------------------------------');
try {
  const generator = require('./linkedin-content-generator');
  console.log('✅ Content generator loaded');
  console.log(`  - generateLinkedInPost: ${typeof generator.generateLinkedInPost}`);
  console.log(`  - generateLinkedInReply: ${typeof generator.generateLinkedInReply}`);
  console.log(`  - selectRandomTopic: ${typeof generator.selectRandomTopic}`);
  console.log(`  - generateHashtags: ${typeof generator.generateHashtags}`);
  
  // Test topic selection
  const config = require('./linkedin-config');
  const topic = generator.selectRandomTopic(config.TOPICS);
  console.log(`  - Random topic selected: "${topic}"`);
  
  // Test hashtag generation
  const hashtags = generator.generateHashtags('Enterprise AI');
  console.log(`  - Hashtags for "Enterprise AI": ${hashtags.join(', ')}`);
} catch (error) {
  console.log('❌ Content generator test failed:', error.message);
}

console.log('');

// Test 3: 每日統計檢查
console.log('Test 3: Daily Stats Logic');
console.log('-------------------------');
try {
  const config = require('./linkedin-config');
  const today = new Date().toISOString().split('T')[0];
  
  // 讀取或創建統計
  let stats = {};
  if (fs.existsSync(config.PATHS.daily_stats)) {
    stats = JSON.parse(fs.readFileSync(config.PATHS.daily_stats, 'utf-8'));
  }
  
  if (!stats[today]) {
    stats[today] = { posts: 0, replies: 0, total: 0 };
  }
  
  console.log(`✅ Daily stats for ${today}:`);
  console.log(`  - Posts: ${stats[today].posts}/${config.DAILY_LIMITS.max_posts}`);
  console.log(`  - Replies: ${stats[today].replies}/${config.DAILY_LIMITS.max_replies}`);
  console.log(`  - Total: ${stats[today].total}/${config.DAILY_LIMITS.max_total}`);
  
  const canPost = stats[today].posts < config.DAILY_LIMITS.max_posts;
  const canReply = stats[today].replies < config.DAILY_LIMITS.max_replies;
  
  console.log(`  - Can post: ${canPost ? '✅' : '❌'}`);
  console.log(`  - Can reply: ${canReply ? '✅' : '❌'}`);
} catch (error) {
  console.log('❌ Daily stats test failed:', error.message);
}

console.log('');

// Test 4: 文件路徑檢查
console.log('Test 4: File Paths');
console.log('------------------');
try {
  const config = require('./linkedin-config');
  console.log('Checking file paths:');
  console.log(`  - Persona file: ${fs.existsSync(config.PERSONA_FILE) ? '✅' : '❌'} ${config.PERSONA_FILE}`);
  console.log(`  - Posted file: ${fs.existsSync(config.PATHS.posted) ? '✅ (exists)' : '📝 (will be created)'}`);
  console.log(`  - Replied file: ${fs.existsSync(config.PATHS.replied) ? '✅ (exists)' : '📝 (will be created)'}`);
  console.log(`  - Stats file: ${fs.existsSync(config.PATHS.daily_stats) ? '✅ (exists)' : '📝 (will be created)'}`);
  console.log(`  - Log file: ${fs.existsSync(config.PATHS.logs) ? '✅ (exists)' : '📝 (will be created)'}`);
} catch (error) {
  console.log('❌ File paths test failed:', error.message);
}

console.log('');

// Test 5: Ollama 連接
console.log('Test 5: Ollama Connection');
console.log('-------------------------');
const { execSync } = require('child_process');
try {
  const result = execSync('curl -s http://localhost:11434/api/tags', { timeout: 5000 });
  const data = JSON.parse(result.toString());
  console.log('✅ Ollama is running');
  console.log(`  - Available models: ${data.models.length}`);
  
  const hasGptOss = data.models.some(m => m.name.includes('gpt-oss'));
  const hasQwen = data.models.some(m => m.name.includes('qwen'));
  
  console.log(`  - gpt-oss:20b: ${hasGptOss ? '✅' : '❌'}`);
  console.log(`  - qwen models: ${hasQwen ? '✅' : '❌'}`);
} catch (error) {
  console.log('❌ Ollama connection failed:', error.message);
  console.log('  Make sure Ollama is running: ollama serve');
}

console.log('');

// Test 6: LaunchAgents 檢查
console.log('Test 6: LaunchAgents Status');
console.log('----------------------------');
try {
  const result = execSync('launchctl list | grep linkedin-curator', { timeout: 5000 });
  const lines = result.toString().trim().split('\n');
  console.log(`✅ ${lines.length} LinkedIn LaunchAgents loaded:`);
  
  const posts = lines.filter(l => l.includes('post')).length;
  const replies = lines.filter(l => l.includes('reply')).length;
  
  console.log(`  - POST agents: ${posts}/3 ${posts === 3 ? '✅' : '⚠️'}`);
  console.log(`  - REPLY agents: ${replies}/6 ${replies === 6 ? '✅' : '⚠️'}`);
} catch (error) {
  console.log('❌ No LaunchAgents loaded yet');
  console.log('  Run: ./setup-linkedin-launchagents-v2.sh');
}

console.log('');
console.log('=================================');
console.log('✅ Logic tests complete!');
console.log('=================================');
console.log('');
console.log('Next steps:');
console.log('1. Test content generation: node linkedin-content-generator.js');
console.log('2. Manual login once: HEADLESS=false node linkedin-curator.js --mode post');
console.log('3. Test dry run: DRY_RUN=true node linkedin-curator.js --mode post');
console.log('4. Enable automation: Update LaunchAgents DRY_RUN to false');
console.log('');
