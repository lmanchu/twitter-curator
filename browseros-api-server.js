#!/usr/bin/env node

/**
 * BrowserOS API Server
 * HTTP API 服務，作為 twitter-curator.js 和 BrowserOS 之間的橋接
 *
 * 架構：
 * 1. 接收 HTTP 請求（POST /api/twitter/post, POST /api/twitter/reply 等）
 * 2. 將任務寫入任務隊列 (tasks-queue.json)
 * 3. 返回任務 ID
 * 4. browseros-worker.js (由 Claude 執行) 會處理隊列中的任務
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.BROWSEROS_API_PORT || 3333;

// Middleware
app.use(express.json());

// 任務隊列路徑
const QUEUE_PATH = path.join(__dirname, 'tasks-queue.json');
const RESULTS_PATH = path.join(__dirname, 'tasks-results.json');

// 載入/保存 JSON
function loadJSON(filepath) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (error) {
    console.error(`Error loading ${filepath}:`, error);
  }
  return [];
}

function saveJSON(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving ${filepath}:`, error);
  }
}

// 創建任務
function createTask(type, payload) {
  const taskId = crypto.randomBytes(16).toString('hex');
  const task = {
    id: taskId,
    type: type,
    payload: payload,
    status: 'pending',
    createdAt: new Date().toISOString(),
    result: null,
    error: null
  };

  const queue = loadJSON(QUEUE_PATH);
  queue.push(task);
  saveJSON(QUEUE_PATH, queue);

  return taskId;
}

// 獲取任務結果
function getTaskResult(taskId) {
  const results = loadJSON(RESULTS_PATH);
  return results.find(r => r.id === taskId);
}

// ========================================
// API Endpoints
// ========================================

/**
 * POST /api/twitter/post
 * 發布推文
 * Body: { text: string }
 */
app.post('/api/twitter/post', (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Missing text field' });
  }

  const taskId = createTask('POST_TWEET', { text });

  res.status(202).json({
    taskId: taskId,
    status: 'accepted',
    message: 'Task queued for processing'
  });
});

/**
 * POST /api/twitter/reply
 * 回覆推文
 * Body: { tweetId: string, text: string, author: string }
 */
app.post('/api/twitter/reply', (req, res) => {
  const { tweetId, text, author } = req.body;

  if (!tweetId || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const taskId = createTask('REPLY_TWEET', { tweetId, text, author });

  res.status(202).json({
    taskId: taskId,
    status: 'accepted',
    message: 'Task queued for processing'
  });
});

/**
 * GET /api/twitter/feed
 * 讀取 Twitter feed
 */
app.get('/api/twitter/feed', (req, res) => {
  const taskId = createTask('GET_FEED', {});

  res.status(202).json({
    taskId: taskId,
    status: 'accepted',
    message: 'Task queued for processing'
  });
});

/**
 * GET /api/task/:taskId
 * 查詢任務狀態
 */
app.get('/api/task/:taskId', (req, res) => {
  const { taskId } = req.params;

  // 先檢查隊列
  const queue = loadJSON(QUEUE_PATH);
  const queueTask = queue.find(t => t.id === taskId);

  if (queueTask && queueTask.status === 'pending') {
    return res.json({
      id: taskId,
      status: 'pending',
      message: 'Task is in queue, waiting for worker'
    });
  }

  // 檢查結果
  const result = getTaskResult(taskId);

  if (!result) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json(result);
});

/**
 * GET /api/tasks/pending
 * 獲取所有待處理任務（供 worker 調用）
 */
app.get('/api/tasks/pending', (req, res) => {
  const queue = loadJSON(QUEUE_PATH);
  const pending = queue.filter(t => t.status === 'pending');
  res.json(pending);
});

/**
 * POST /api/tasks/:taskId/complete
 * 標記任務完成（供 worker 調用）
 * Body: { result: any, error: string | null }
 */
app.post('/api/tasks/:taskId/complete', (req, res) => {
  const { taskId } = req.params;
  const { result, error } = req.body;

  // 從隊列移除
  let queue = loadJSON(QUEUE_PATH);
  queue = queue.filter(t => t.id !== taskId);
  saveJSON(QUEUE_PATH, queue);

  // 添加到結果
  const results = loadJSON(RESULTS_PATH);
  results.push({
    id: taskId,
    status: error ? 'failed' : 'completed',
    result: result,
    error: error,
    completedAt: new Date().toISOString()
  });

  // 只保留最近 100 個結果
  if (results.length > 100) {
    results.shift();
  }

  saveJSON(RESULTS_PATH, results);

  res.json({ success: true });
});

/**
 * GET /api/health
 * 健康檢查
 */
app.get('/api/health', (req, res) => {
  const queue = loadJSON(QUEUE_PATH);
  const results = loadJSON(RESULTS_PATH);

  res.json({
    status: 'ok',
    queueSize: queue.length,
    resultsSize: results.length,
    uptime: process.uptime()
  });
});

// 啟動服務器
app.listen(PORT, () => {
  console.log(`✅ BrowserOS API Server running on http://localhost:${PORT}`);
  console.log(`📋 Queue: ${QUEUE_PATH}`);
  console.log(`📊 Results: ${RESULTS_PATH}`);
});

// 優雅關閉
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});
