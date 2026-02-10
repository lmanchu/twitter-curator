#!/usr/bin/env node
/**
 * RSS Adapter - General RSS feed aggregator
 *
 * Handles tech RSS feeds with keyword-based relevance scoring.
 * Used for tech_rss and other RSS-based sources.
 */

const BaseAdapter = require('./base-adapter');
const Parser = require('rss-parser');
const path = require('path');
const fs = require('fs');

class RSSAdapter extends BaseAdapter {
  constructor(config, sourceKey = 'tech_rss') {
    super({ ...config, name: sourceKey });
    this.feeds = config.feeds || [];
    this.keywords = config.keywords || {};
    this.sourceKey = sourceKey;

    this.parser = new Parser({
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) News Monitor/1.0'
      }
    });
  }

  /**
   * Fetch from a single RSS feed
   */
  async fetchFeed(feedConfig) {
    try {
      this.log(`Fetching ${feedConfig.name}...`);
      const feed = await this.parser.parseURL(feedConfig.url);

      return feed.items.map(item => ({
        title: item.title || '',
        url: item.link || '',
        summary: item.contentSnippet || item.content || '',
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
        source: feedConfig.name,
        feedName: feedConfig.name,
        priority: feedConfig.priority
      }));
    } catch (err) {
      this.error(`Failed to fetch ${feedConfig.name}:`, err.message);
      return [];
    }
  }

  /**
   * Calculate keyword relevance score
   */
  calculateKeywordScore(article) {
    const text = `${article.title} ${article.summary}`.toLowerCase();
    let score = 0;
    const matchedKeywords = [];

    // High priority keywords (+3)
    const highKeywords = this.keywords.high || [];
    for (const keyword of highKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 3;
        matchedKeywords.push(keyword);
      }
    }

    // Medium priority keywords (+2)
    const mediumKeywords = this.keywords.medium || [];
    for (const keyword of mediumKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 2;
        matchedKeywords.push(keyword);
      }
    }

    // Low priority keywords (+1)
    const lowKeywords = this.keywords.low || [];
    for (const keyword of lowKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
        matchedKeywords.push(keyword);
      }
    }

    // Region keywords (for VC adapter)
    const regionKeywords = this.keywords.regions || [];
    for (const keyword of regionKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 2;
        matchedKeywords.push(keyword);
      }
    }

    // Feed priority bonus
    if (article.priority === 'high') {
      score += 1;
    }

    return { score, matchedKeywords };
  }

  /**
   * Transform to unified format
   */
  transform(article, scoring) {
    return this.createItem({
      id: this.generateId(article.url),
      title: article.title,
      url: article.url,
      summary: (article.summary || '').substring(0, 500),
      source: article.source,
      sourceType: 'rss',
      published: article.pubDate,
      keywordScore: scoring.score
    });
  }

  /**
   * Generate consistent ID from URL
   */
  generateId(url) {
    const hash = url.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return `${this.sourceKey}_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Main fetch function
   */
  async fetch() {
    if (!this.enabled) {
      this.log('Adapter disabled, skipping');
      return [];
    }

    this.log('Starting RSS fetch...');

    const allArticles = [];

    // Fetch from all feeds
    for (const feed of this.feeds) {
      const articles = await this.fetchFeed(feed);
      allArticles.push(...articles);

      // Small delay between feeds
      await new Promise(r => setTimeout(r, 300));
    }

    this.log(`Fetched ${allArticles.length} total articles`);

    // Score all articles
    const scoredArticles = allArticles.map(article => {
      const scoring = this.calculateKeywordScore(article);
      return { article, scoring };
    });

    // Sort by score
    scoredArticles.sort((a, b) => b.scoring.score - a.scoring.score);

    // Take top 20
    const topArticles = scoredArticles.slice(0, 20);

    // Transform to unified format
    const results = topArticles.map(({ article, scoring }) =>
      this.transform(article, scoring)
    );

    this.log(`Returning ${results.length} top-scoring articles`);

    return results;
  }
}

// CLI mode
if (require.main === module) {
  const sourcesPath = path.join(__dirname, '..', 'sources.json');
  const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
  const config = sources.sources.tech_rss;

  const adapter = new RSSAdapter(config, 'tech_rss');
  adapter.fetch()
    .then(results => {
      console.log('\n=== RSS Adapter Results ===');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch(console.error);
}

module.exports = RSSAdapter;
