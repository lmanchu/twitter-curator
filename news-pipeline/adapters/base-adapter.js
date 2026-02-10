/**
 * Base Adapter Interface
 * All content source adapters should extend this base class
 */

class BaseAdapter {
  constructor(config) {
    this.config = config;
    this.name = config.name || 'unknown';
    this.weight = config.weight || 0;
    this.enabled = config.enabled !== false;
  }

  /**
   * Fetch content from the source
   * @returns {Promise<Array>} Array of content items in unified format
   */
  async fetch() {
    throw new Error('fetch() must be implemented by subclass');
  }

  /**
   * Transform source-specific item to unified format
   * @param {Object} item - Source-specific item
   * @returns {Object} Unified content item
   */
  transform(item) {
    throw new Error('transform() must be implemented by subclass');
  }

  /**
   * Get unified content item structure
   */
  static getUnifiedSchema() {
    return {
      id: '',                    // Unique identifier
      title: '',                 // Content title
      url: '',                   // Source URL
      summary: '',               // Brief summary/description
      source: '',                // Source name (e.g., "Hacker News", "Twitter @karpathy")
      sourceType: '',            // Adapter type: rss, twitter, anime, vc
      published: '',             // ISO date string
      keywordScore: 0,           // Pre-AI keyword relevance score

      // Twitter-specific (optional)
      twitterMeta: null,         // { author, likes, retweets, interactionType }

      // Anime-specific (optional)
      animeMeta: null,           // { titles, businessAngle }

      // Tracking
      fetchedAt: '',             // When this was fetched
      adapterId: ''              // Which adapter fetched this
    };
  }

  /**
   * Create a unified content item
   */
  createItem(data) {
    return {
      id: data.id || `${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      title: data.title || '',
      url: data.url || '',
      summary: data.summary || '',
      source: data.source || this.name,
      sourceType: data.sourceType || 'unknown',
      published: data.published || new Date().toISOString(),
      keywordScore: data.keywordScore || 0,
      twitterMeta: data.twitterMeta || null,
      animeMeta: data.animeMeta || null,
      fetchedAt: new Date().toISOString(),
      adapterId: this.name
    };
  }

  /**
   * Log with adapter prefix
   */
  log(message, ...args) {
    console.log(`[${this.name.toUpperCase()}]`, message, ...args);
  }

  /**
   * Error log with adapter prefix
   */
  error(message, ...args) {
    console.error(`[${this.name.toUpperCase()}] ERROR:`, message, ...args);
  }
}

module.exports = BaseAdapter;
