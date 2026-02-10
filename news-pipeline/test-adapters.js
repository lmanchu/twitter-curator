#!/usr/bin/env node
/**
 * Test script for content adapters
 * Run: node test-adapters.js [adapter]
 *
 * Examples:
 *   node test-adapters.js rss
 *   node test-adapters.js anime
 *   node test-adapters.js vc
 *   node test-adapters.js all
 */

const fs = require('fs');
const path = require('path');

// Load sources config
const sourcesPath = path.join(__dirname, 'sources.json');
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));

async function testAdapter(name) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(50));

  try {
    let adapter;
    let config;

    switch (name) {
      case 'rss':
      case 'tech_rss':
        const RSSAdapter = require('./adapters/rss-adapter.js');
        config = sources.sources.tech_rss;
        adapter = new RSSAdapter(config, 'tech_rss');
        break;

      case 'anime':
      case 'anime_scifi':
        const AnimeAdapter = require('./adapters/anime-adapter.js');
        config = sources.sources.anime_scifi;
        adapter = new AnimeAdapter(config);
        break;

      case 'vc':
      case 'startup_investment':
        const VCAdapter = require('./adapters/vc-adapter.js');
        config = sources.sources.startup_investment;
        adapter = new VCAdapter(config);
        break;

      default:
        console.log(`Unknown adapter: ${name}`);
        return null;
    }

    console.log(`Config: weight=${config.weight}, enabled=${config.enabled}`);

    const startTime = Date.now();
    const results = await adapter.fetch();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\nResults: ${results.length} items (${elapsed}s)`);

    // Show top 3
    results.slice(0, 3).forEach((item, i) => {
      console.log(`\n${i + 1}. ${item.title?.substring(0, 60)}...`);
      console.log(`   Source: ${item.source}`);
      console.log(`   Score: ${item.keywordScore || 'N/A'}`);
      if (item.animeMeta) {
        console.log(`   Anime: ${item.animeMeta.titles?.join(', ') || 'None'}`);
      }
    });

    return results;
  } catch (err) {
    console.error(`Error testing ${name}:`, err.message);
    return null;
  }
}

async function main() {
  const arg = process.argv[2] || 'all';

  if (arg === 'all') {
    // Test all adapters
    const results = {};

    for (const name of ['rss', 'anime', 'vc']) {
      results[name] = await testAdapter(name);
    }

    console.log('\n' + '='.repeat(50));
    console.log('Summary');
    console.log('='.repeat(50));

    let total = 0;
    for (const [name, items] of Object.entries(results)) {
      const count = items?.length || 0;
      total += count;
      console.log(`${name}: ${count} items`);
    }
    console.log(`Total: ${total} items`);

  } else {
    await testAdapter(arg);
  }

  console.log('\nDone.');
}

main().catch(console.error);
