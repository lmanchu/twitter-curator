#!/usr/bin/env node
/**
 * Anime/SciFi Adapter - Fetch anime and sci-fi news for personal interest content
 *
 * Strategy: Post anime/sci-fi content as a GENUINE FAN, not connecting to tech.
 * This shows Lman's personality and appeals to anime Twitter community.
 *
 * Favorite anime: My Hero Academia, One Punch Man, Frieren, Attack on Titan,
 *                 Chainsaw Man, Jujutsu Kaisen, Dandadan, Kaiju No. 8
 * Favorite sci-fi: Star Wars, Matrix, Interstellar, Dune, Foundation
 */

const BaseAdapter = require('./base-adapter');
const Parser = require('rss-parser');
const path = require('path');
const fs = require('fs');

// Cache to avoid duplicate articles
const CACHE_FILE = path.join(__dirname, '..', 'anime-cache.json');

class AnimeAdapter extends BaseAdapter {
  constructor(config) {
    super({ ...config, name: 'anime_scifi' });
    this.feeds = config.feeds || [];
    this.keywords = config.keywords || {};
    this.strategy = config.strategy || 'standalone_post';

    // Flatten all keywords for matching
    this.allAnimeKeywords = this.keywords.anime || [];
    this.allSciFiKeywords = this.keywords.scifi || [];
    // Note: business_angles removed - anime content should be posted as a fan

    this.parser = new Parser({
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Anime News Monitor/1.0'
      }
    });
  }

  /**
   * Load seen articles cache
   */
  loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return new Set(data.filter(a => a.timestamp > cutoff).map(a => a.url));
      }
    } catch (err) {
      this.error('Failed to load cache:', err.message);
    }
    return new Set();
  }

  /**
   * Save to cache
   */
  saveCache(urls) {
    try {
      let existing = [];
      if (fs.existsSync(CACHE_FILE)) {
        existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      }

      const now = Date.now();
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;

      const merged = [
        ...existing.filter(a => a.timestamp > cutoff),
        ...urls.map(url => ({ url, timestamp: now }))
      ];

      // Dedupe
      const seen = new Set();
      const deduped = merged.filter(a => {
        if (seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      });

      fs.writeFileSync(CACHE_FILE, JSON.stringify(deduped, null, 2));
    } catch (err) {
      this.error('Failed to save cache:', err.message);
    }
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
        priority: feedConfig.priority
      }));
    } catch (err) {
      this.error(`Failed to fetch ${feedConfig.name}:`, err.message);
      return [];
    }
  }

  /**
   * Calculate relevance score based on favorite anime/scifi titles
   */
  calculateRelevanceScore(article) {
    const text = `${article.title} ${article.summary}`.toLowerCase();
    let score = 0;
    const matchedTitles = [];

    // Check anime keywords (+3 each) - favorites get higher score
    for (const keyword of this.allAnimeKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 3;
        matchedTitles.push(keyword);
      }
    }

    // Check sci-fi keywords (+2 each)
    for (const keyword of this.allSciFiKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 2;
        matchedTitles.push(keyword);
      }
    }

    // Bonus for high-priority feeds
    if (article.priority === 'high') {
      score += 1;
    }

    return { score, matchedTitles };
  }

  /**
   * Transform to unified format
   */
  transform(article, relevance) {
    return this.createItem({
      id: this.generateId(article.url),
      title: article.title,
      url: article.url,
      summary: article.summary,
      source: article.source,
      sourceType: 'anime',
      published: article.pubDate,
      keywordScore: relevance.score,
      animeMeta: {
        titles: relevance.matchedTitles,
        isSciFi: relevance.matchedTitles.some(t =>
          this.allSciFiKeywords.some(kw => kw.toLowerCase() === t.toLowerCase())
        )
      }
    });
  }

  /**
   * Generate consistent ID from URL
   */
  generateId(url) {
    const hash = url.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return `anime_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Main fetch function
   */
  async fetch() {
    if (!this.enabled) {
      this.log('Adapter disabled, skipping');
      return [];
    }

    this.log('Starting Anime/SciFi fetch...');

    const seenUrls = this.loadCache();
    const allArticles = [];

    // Fetch from all feeds
    for (const feed of this.feeds) {
      const articles = await this.fetchFeed(feed);
      allArticles.push(...articles);

      // Small delay between feeds
      await new Promise(r => setTimeout(r, 500));
    }

    this.log(`Fetched ${allArticles.length} total articles`);

    // Filter new articles and calculate relevance
    const scoredArticles = [];

    for (const article of allArticles) {
      // Skip seen articles
      if (seenUrls.has(article.url)) continue;

      const relevance = this.calculateRelevanceScore(article);

      // Only include articles with persona keyword matches
      if (relevance.score >= 2) {
        scoredArticles.push({ article, relevance });
      }
    }

    // Sort by relevance score
    scoredArticles.sort((a, b) => b.relevance.score - a.relevance.score);

    // Take top 5
    const topArticles = scoredArticles.slice(0, 5);

    // Save to cache
    this.saveCache(topArticles.map(a => a.article.url));

    // Transform to unified format
    const results = topArticles.map(({ article, relevance }) =>
      this.transform(article, relevance)
    );

    this.log(`Found ${results.length} relevant anime/sci-fi articles`);

    // Log matched titles for debugging
    results.forEach(r => {
      if (r.animeMeta?.titles.length > 0) {
        this.log(`  - ${r.title.substring(0, 50)}... [${r.animeMeta.titles.join(', ')}]`);
      }
    });

    return results;
  }
}

// CLI mode
if (require.main === module) {
  const sourcesPath = path.join(__dirname, '..', 'sources.json');
  const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
  const config = sources.sources.anime_scifi;

  const adapter = new AnimeAdapter(config);
  adapter.fetch()
    .then(results => {
      console.log('\n=== Anime Adapter Results ===');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch(console.error);
}

module.exports = AnimeAdapter;
