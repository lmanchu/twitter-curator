#!/usr/bin/env node
/**
 * News Monitor - RSS Feed Aggregator
 *
 * Fetches news from configured RSS feeds and filters for relevance.
 * Part of the News Intelligence Pipeline.
 */

const fs = require('fs');
const path = require('path');

// Load configuration
const CONFIG_PATH = path.join(__dirname, 'feeds.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Cache for seen articles (avoid duplicates)
let seenArticles = new Set();
const CACHE_FILE = config.paths.cacheFile;

// Load seen articles cache
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      // Keep only last 7 days
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      seenArticles = new Set(
        data.filter(item => item.timestamp > cutoff).map(item => item.url)
      );
      console.log(`Loaded ${seenArticles.size} cached articles`);
    }
  } catch (err) {
    console.error('Error loading cache:', err.message);
    seenArticles = new Set();
  }
}

// Save seen articles cache
function saveCache(newArticles) {
  try {
    let existing = [];
    if (fs.existsSync(CACHE_FILE)) {
      existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }

    const now = Date.now();
    const cutoff = now - 7 * 24 * 60 * 60 * 1000;

    // Merge and filter old entries
    const merged = [
      ...existing.filter(item => item.timestamp > cutoff),
      ...newArticles.map(url => ({ url, timestamp: now }))
    ];

    // Dedupe
    const seen = new Set();
    const deduped = merged.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });

    fs.writeFileSync(CACHE_FILE, JSON.stringify(deduped, null, 2));
  } catch (err) {
    console.error('Error saving cache:', err.message);
  }
}

// Parse RSS/Atom feed
async function parseFeed(feedUrl) {
  const Parser = require('rss-parser');
  const parser = new Parser({
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) News Monitor/1.0'
    }
  });

  try {
    const feed = await parser.parseURL(feedUrl);
    return feed.items.map(item => ({
      title: item.title || '',
      link: item.link || '',
      summary: item.contentSnippet || item.content || '',
      pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
      source: feed.title || feedUrl
    }));
  } catch (err) {
    console.error(`Error parsing feed ${feedUrl}:`, err.message);
    return [];
  }
}

// Calculate keyword relevance score
function calculateKeywordScore(article) {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  let score = 0;

  // High priority keywords (+3)
  for (const keyword of config.keywords.high) {
    if (text.includes(keyword.toLowerCase())) {
      score += 3;
    }
  }

  // Medium priority keywords (+2)
  for (const keyword of config.keywords.medium) {
    if (text.includes(keyword.toLowerCase())) {
      score += 2;
    }
  }

  // Low priority keywords (+1)
  for (const keyword of config.keywords.low) {
    if (text.includes(keyword.toLowerCase())) {
      score += 1;
    }
  }

  return score;
}

// Main fetch function
async function fetchAllFeeds() {
  console.log('=== News Monitor Starting ===');
  console.log(`Time: ${new Date().toISOString()}`);

  loadCache();

  const allArticles = [];

  for (const feed of config.feeds) {
    if (!feed.enabled) continue;

    console.log(`Fetching: ${feed.name}...`);
    const articles = await parseFeed(feed.url);

    // Add source metadata
    articles.forEach(article => {
      article.feedName = feed.name;
      article.feedPriority = feed.priority;
    });

    allArticles.push(...articles);
  }

  console.log(`Total articles fetched: ${allArticles.length}`);

  // Filter out seen articles
  const newArticles = allArticles.filter(article => !seenArticles.has(article.link));
  console.log(`New articles: ${newArticles.length}`);

  // Calculate keyword scores
  newArticles.forEach(article => {
    article.keywordScore = calculateKeywordScore(article);
  });

  // Sort by keyword score (descending)
  newArticles.sort((a, b) => b.keywordScore - a.keywordScore);

  // Take top 20 for scoring
  const topArticles = newArticles.slice(0, 20);

  // Save to cache
  saveCache(newArticles.map(a => a.link));

  // Output for next stage
  const outputPath = path.join(__dirname, 'pending-articles.json');
  fs.writeFileSync(outputPath, JSON.stringify(topArticles, null, 2));

  console.log(`\nTop ${topArticles.length} articles saved to pending-articles.json`);
  console.log('=== News Monitor Complete ===\n');

  return topArticles;
}

// Run if called directly
if (require.main === module) {
  fetchAllFeeds().catch(console.error);
}

module.exports = { fetchAllFeeds, calculateKeywordScore };
