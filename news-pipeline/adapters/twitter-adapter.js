#!/usr/bin/env node
/**
 * Twitter Adapter - Fetch interesting tweets via Clawd browser automation
 *
 * Uses Clawdbot's browser tool to search Twitter for high-engagement content
 * from tracked accounts and trending topics.
 *
 * Interaction types:
 * - quote: Quote tweet with commentary
 * - reply: Reply to start conversation
 * - bookmark: Save for reference without posting
 */

const BaseAdapter = require('./base-adapter');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Cache to avoid duplicate tweets
const CACHE_FILE = path.join(__dirname, '..', 'twitter-cache.json');

class TwitterAdapter extends BaseAdapter {
  constructor(config) {
    super({ ...config, name: 'twitter' });
    this.searchQueries = config.config?.searchQueries || [];
    this.trackedAccounts = config.config?.trackedAccounts || [];
    this.minEngagement = config.config?.minEngagement || { likes: 100, retweets: 20 };
    this.maxPerRun = config.config?.maxPerRun || 5;
    this.interactionType = config.config?.interactionType || 'ai_decide';
  }

  /**
   * Load seen tweets cache
   */
  loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
        return new Set(data.filter(t => t.timestamp > cutoff).map(t => t.id));
      }
    } catch (err) {
      this.error('Failed to load cache:', err.message);
    }
    return new Set();
  }

  /**
   * Save to cache
   */
  saveCache(tweetIds) {
    try {
      let existing = [];
      if (fs.existsSync(CACHE_FILE)) {
        existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      }

      const now = Date.now();
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;

      const merged = [
        ...existing.filter(t => t.timestamp > cutoff),
        ...tweetIds.map(id => ({ id, timestamp: now }))
      ];

      // Dedupe
      const seen = new Set();
      const deduped = merged.filter(t => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      fs.writeFileSync(CACHE_FILE, JSON.stringify(deduped, null, 2));
    } catch (err) {
      this.error('Failed to save cache:', err.message);
    }
  }

  /**
   * Execute Clawd browser command to fetch tweets
   * Uses Clawdbot's browser profile with persistent Twitter login
   */
  async fetchViaClawdbot(query, isAccountSearch = false) {
    return new Promise((resolve, reject) => {
      const taskDescription = isAccountSearch
        ? `Search Twitter for recent tweets from ${query} with high engagement. Return up to 3 tweets with: url, text, author, likes, retweets.`
        : `Search Twitter for "${query}" tweets with likes > ${this.minEngagement.likes}. Return up to 3 tweets with: url, text, author, likes, retweets.`;

      const prompt = `
Use browser tool with profile=clawd to search Twitter.

Task: ${taskDescription}

Steps:
1. Navigate to Twitter search
2. Search for: ${isAccountSearch ? `from:${query.replace('@', '')}` : query}
3. Filter by Top tweets
4. Find tweets with good engagement (likes > ${this.minEngagement.likes})
5. Extract and return as JSON array

Return format (JSON only):
[
  {
    "url": "https://twitter.com/...",
    "text": "Tweet content...",
    "author": "@username",
    "likes": 1234,
    "retweets": 56
  }
]

If no good tweets found, return empty array: []
`;

      // Use clawdbot CLI to execute
      const proc = spawn('clawdbot', ['ask', '--json', prompt], {
        cwd: process.env.HOME,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => { stdout += data.toString(); });
      proc.stderr.on('data', data => { stderr += data.toString(); });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('Clawdbot timeout'));
      }, 120000); // 2 minute timeout

      proc.on('close', code => {
        clearTimeout(timeout);

        if (code !== 0) {
          this.error('Clawdbot failed:', stderr);
          resolve([]); // Return empty on error, don't fail entire pipeline
          return;
        }

        try {
          // Extract JSON from response
          const jsonMatch = stdout.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const tweets = JSON.parse(jsonMatch[0]);
            resolve(tweets);
          } else {
            this.log('No tweets found in response');
            resolve([]);
          }
        } catch (err) {
          this.error('Failed to parse response:', err.message);
          resolve([]);
        }
      });
    });
  }

  /**
   * Determine interaction type based on tweet content
   */
  determineInteractionType(tweet) {
    if (this.interactionType !== 'ai_decide') {
      return this.interactionType;
    }

    // Simple heuristics - can be enhanced with AI
    const text = tweet.text?.toLowerCase() || '';

    // Quote for insights/hot takes
    if (tweet.likes > 500 || text.includes('thread') || text.includes('unpopular opinion')) {
      return 'quote';
    }

    // Reply for questions or discussions
    if (text.includes('?') || text.includes('what do you think') || text.includes('discuss')) {
      return 'reply';
    }

    // Bookmark for reference
    if (text.includes('resource') || text.includes('guide') || text.includes('list of')) {
      return 'bookmark';
    }

    // Default to quote for high engagement
    return tweet.likes > 200 ? 'quote' : 'reply';
  }

  /**
   * Transform Twitter data to unified format
   */
  transform(tweet) {
    const interactionType = this.determineInteractionType(tweet);

    return this.createItem({
      id: this.extractTweetId(tweet.url),
      title: this.createTitle(tweet),
      url: tweet.url,
      summary: tweet.text || '',
      source: `Twitter ${tweet.author}`,
      sourceType: 'twitter',
      published: new Date().toISOString(),
      twitterMeta: {
        author: tweet.author,
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        interactionType: interactionType
      }
    });
  }

  /**
   * Extract tweet ID from URL
   */
  extractTweetId(url) {
    const match = url?.match(/status\/(\d+)/);
    return match ? match[1] : `twitter_${Date.now()}`;
  }

  /**
   * Create title from tweet
   */
  createTitle(tweet) {
    const text = tweet.text || '';
    const truncated = text.length > 100 ? text.substring(0, 97) + '...' : text;
    return `${tweet.author}: ${truncated}`;
  }

  /**
   * Main fetch function
   */
  async fetch() {
    if (!this.enabled) {
      this.log('Adapter disabled, skipping');
      return [];
    }

    this.log('Starting Twitter fetch...');

    const seenTweets = this.loadCache();
    const allTweets = [];

    // Search by tracked accounts
    for (const account of this.trackedAccounts.slice(0, 3)) {
      this.log(`Searching tweets from ${account}...`);
      try {
        const tweets = await this.fetchViaClawdbot(account, true);
        allTweets.push(...tweets);
      } catch (err) {
        this.error(`Failed to fetch from ${account}:`, err.message);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 2000));
    }

    // Search by queries
    for (const query of this.searchQueries.slice(0, 2)) {
      this.log(`Searching for "${query}"...`);
      try {
        const tweets = await this.fetchViaClawdbot(query, false);
        allTweets.push(...tweets);
      } catch (err) {
        this.error(`Failed to search "${query}":`, err.message);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    // Filter and dedupe
    const newTweets = allTweets.filter(tweet => {
      const id = this.extractTweetId(tweet.url);
      if (seenTweets.has(id)) {
        return false;
      }
      if ((tweet.likes || 0) < this.minEngagement.likes) {
        return false;
      }
      return true;
    });

    // Sort by engagement
    newTweets.sort((a, b) => (b.likes || 0) - (a.likes || 0));

    // Take top N
    const topTweets = newTweets.slice(0, this.maxPerRun);

    // Save to cache
    this.saveCache(topTweets.map(t => this.extractTweetId(t.url)));

    // Transform to unified format
    const results = topTweets.map(t => this.transform(t));

    this.log(`Found ${results.length} interesting tweets`);
    return results;
  }
}

// CLI mode
if (require.main === module) {
  const sourcesPath = path.join(__dirname, '..', 'sources.json');
  const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
  const config = sources.sources.twitter_interesting;

  const adapter = new TwitterAdapter(config);
  adapter.fetch()
    .then(results => {
      console.log('\n=== Twitter Adapter Results ===');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch(console.error);
}

module.exports = TwitterAdapter;
