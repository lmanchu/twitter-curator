#!/usr/bin/env node

/**
 * BrowserOS Worker
 * 處理任務隊列中的 BrowserOS 操作
 *
 * ⚠️ 這個腳本必須由 Claude 在對話中執行，因為只有 Claude 可以訪問 BrowserOS MCP 工具
 *
 * 用法：
 * 1. 由 Claude Code 執行：node browseros-worker.js
 * 2. 或通過 Happy CLI 觸發 Claude 執行
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 配置
const API_BASE_URL = process.env.BROWSEROS_API_URL || 'http://localhost:3333';
const TWITTER_TAB_ID = parseInt(process.env.TWITTER_TAB_ID || '519391672');
const QUEUE_PATH = path.join(__dirname, 'tasks-queue.json');

// ========================================
// BrowserOS 操作函數（需要由 Claude 執行）
// ========================================

/**
 * ⚠️ 這些函數使用 BrowserOS MCP 工具，只能在 Claude 上下文中運行
 * 在實際執行時，這些會被替換為真正的 MCP 調用
 */

async function postTweetViaBrowserOS(text) {
  console.log('🐦 Posting tweet via BrowserOS...');

  try {
    // 這裡需要由 Claude 手動執行 BrowserOS MCP 操作
    // 因為無法在 Node.js 中直接調用 MCP 工具

    console.log('❌ This function must be executed by Claude with BrowserOS MCP access');
    console.log('📝 Tweet text:', text);

    // 返回模擬結果（實際需要由 Claude 執行）
    return {
      success: false,
      error: 'This function requires Claude execution with BrowserOS MCP'
    };

  } catch (error) {
    console.error('Error posting tweet:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function replyToTweetViaBrowserOS(tweetId, text, author) {
  console.log(`💬 Replying to @${author}...`);

  try {
    console.log('❌ This function must be executed by Claude with BrowserOS MCP access');
    console.log('📝 Reply text:', text);

    return {
      success: false,
      error: 'This function requires Claude execution with BrowserOS MCP'
    };

  } catch (error) {
    console.error('Error replying:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function getFeedViaBrowserOS() {
  console.log('📰 Getting Twitter feed via BrowserOS...');

  try {
    console.log('❌ This function must be executed by Claude with BrowserOS MCP access');

    return {
      success: false,
      error: 'This function requires Claude execution with BrowserOS MCP'
    };

  } catch (error) {
    console.error('Error getting feed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ========================================
// 任務處理
// ========================================

async function processTask(task) {
  console.log(`\n📋 Processing task ${task.id} (${task.type})...`);

  let result;

  switch (task.type) {
    case 'POST_TWEET':
      result = await postTweetViaBrowserOS(task.payload.text);
      break;

    case 'REPLY_TWEET':
      result = await replyToTweetViaBrowserOS(
        task.payload.tweetId,
        task.payload.text,
        task.payload.author
      );
      break;

    case 'GET_FEED':
      result = await getFeedViaBrowserOS();
      break;

    default:
      result = {
        success: false,
        error: `Unknown task type: ${task.type}`
      };
  }

  return result;
}

async function completeTask(taskId, result, error = null) {
  try {
    await axios.post(`${API_BASE_URL}/api/tasks/${taskId}/complete`, {
      result: result,
      error: error
    });
    console.log(`✅ Task ${taskId} completed`);
  } catch (err) {
    console.error(`Error completing task ${taskId}:`, err.message);
  }
}

// ========================================
// 主函數
// ========================================

async function main() {
  console.log('🤖 BrowserOS Worker Started');
  console.log('='.repeat(60));

  try {
    // 1. 獲取待處理任務
    const response = await axios.get(`${API_BASE_URL}/api/tasks/pending`);
    const tasks = response.data;

    if (tasks.length === 0) {
      console.log('📭 No pending tasks');
      return;
    }

    console.log(`📬 Found ${tasks.length} pending task(s)`);

    // 2. 處理每個任務
    for (const task of tasks) {
      const result = await processTask(task);

      // 3. 回報結果
      await completeTask(
        task.id,
        result.success ? result : null,
        result.success ? null : result.error
      );

      // 延遲避免過快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n✅ All tasks processed');

  } catch (error) {
    console.error('\n❌ Worker error:', error.message);
    process.exit(1);
  }
}

// 執行
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { main, processTask };
