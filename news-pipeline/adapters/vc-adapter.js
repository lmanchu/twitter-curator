#!/usr/bin/env node
/**
 * VC/Startup Adapter - Fetch investment and startup news
 *
 * Focuses on funding rounds, startup ecosystem news,
 * with special attention to Asia/Taiwan region.
 */

const RSSAdapter = require('./rss-adapter');
const path = require('path');
const fs = require('fs');

class VCAdapter extends RSSAdapter {
  constructor(config) {
    super(config, 'startup_investment');
  }

  /**
   * Override to add funding-specific analysis
   */
  transform(article, scoring) {
    const item = super.transform(article, scoring);

    // Extract funding details if present
    const fundingInfo = this.extractFundingInfo(article);
    if (fundingInfo) {
      item.fundingMeta = fundingInfo;
    }

    return item;
  }

  /**
   * Extract funding round details from text
   */
  extractFundingInfo(article) {
    const text = `${article.title} ${article.summary}`;

    // Common funding patterns
    const patterns = {
      amount: /\$(\d+(?:\.\d+)?)\s*(million|billion|M|B)/i,
      series: /(seed|series\s+[a-e]|pre-seed|bridge)/i,
      investor: /(led by|from|by)\s+([A-Z][a-zA-Z\s&]+)/
    };

    const info = {};

    const amountMatch = text.match(patterns.amount);
    if (amountMatch) {
      let amount = parseFloat(amountMatch[1]);
      const unit = amountMatch[2].toLowerCase();
      if (unit === 'billion' || unit === 'b') {
        amount *= 1000;
      }
      info.amountMillions = amount;
    }

    const seriesMatch = text.match(patterns.series);
    if (seriesMatch) {
      info.round = seriesMatch[1].toLowerCase().replace(/\s+/g, '-');
    }

    // Check for Taiwan/Asia relevance
    const taiwanKeywords = ['taiwan', 'taipei', '台灣', '台北'];
    const asiaKeywords = ['asia', 'singapore', 'japan', 'korea', 'southeast asia'];

    info.isTaiwan = taiwanKeywords.some(k => text.toLowerCase().includes(k));
    info.isAsia = asiaKeywords.some(k => text.toLowerCase().includes(k)) || info.isTaiwan;

    return Object.keys(info).length > 0 ? info : null;
  }
}

// CLI mode
if (require.main === module) {
  const sourcesPath = path.join(__dirname, '..', 'sources.json');
  const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
  const config = sources.sources.startup_investment;

  const adapter = new VCAdapter(config);
  adapter.fetch()
    .then(results => {
      console.log('\n=== VC Adapter Results ===');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch(console.error);
}

module.exports = VCAdapter;
