#!/usr/bin/env node
/**
 * News Intelligence Pipeline - Main Runner
 *
 * Orchestrates the complete pipeline:
 * 1. Fetch news from RSS feeds
 * 2. Score articles with AI
 * 3. Route to review queue or archive
 *
 * Usage:
 *   node run-pipeline.js          # Run complete pipeline
 *   node run-pipeline.js --fetch  # Only fetch news
 *   node run-pipeline.js --score  # Only score (requires fetch first)
 *   node run-pipeline.js --route  # Only route (requires score first)
 *   node run-pipeline.js --check  # Check for approved articles
 */

const path = require('path');
const fs = require('fs');

// Notification helper (macOS)
function notify(title, message) {
  const { execSync } = require('child_process');
  try {
    execSync(`osascript -e 'display notification "${message}" with title "${title}"'`);
  } catch (err) {
    // Ignore notification errors
  }
}

// Main pipeline function
async function runPipeline(options = {}) {
  const startTime = Date.now();
  console.log('╔════════════════════════════════════════════╗');
  console.log('║     News Intelligence Pipeline v1.0        ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`\nStarted: ${new Date().toISOString()}\n`);

  let results = {
    fetched: 0,
    scored: 0,
    queued: 0,
    archived: 0
  };

  try {
    // Step 1: Fetch news
    if (!options.skipFetch) {
      console.log('━━━ STEP 1: Fetching News ━━━\n');
      const { fetchAllFeeds } = require('./news-monitor');
      const articles = await fetchAllFeeds();
      results.fetched = articles.length;
    }

    // Step 2: Score articles
    if (!options.skipScore) {
      console.log('━━━ STEP 2: Scoring Articles ━━━\n');
      const { scoreAllArticles } = require('./news-scorer');
      const scored = await scoreAllArticles();
      results.scored = scored.length;
    }

    // Step 3: Route to queue
    if (!options.skipRoute) {
      console.log('━━━ STEP 3: Routing Articles ━━━\n');
      const { routeArticles } = require('./content-router');
      const routing = await routeArticles();
      results.queued = routing.queued;
      results.archived = routing.archived;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('╔════════════════════════════════════════════╗');
    console.log('║              Pipeline Complete             ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log(`\nSummary:`);
    console.log(`  - Articles fetched: ${results.fetched}`);
    console.log(`  - Articles scored: ${results.scored}`);
    console.log(`  - Queued for review: ${results.queued}`);
    console.log(`  - Archived: ${results.archived}`);
    console.log(`  - Time elapsed: ${elapsed}s`);
    console.log(`\nReview queue: ~/Dropbox/PKM-Vault/0-Inbox/content-queue/`);

    // Send notification if articles were queued
    if (results.queued > 0) {
      notify('News Pipeline', `${results.queued} articles ready for review`);
    }

    return results;

  } catch (err) {
    console.error('\n❌ Pipeline Error:', err.message);
    notify('News Pipeline Error', err.message);
    throw err;
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    skipFetch: false,
    skipScore: false,
    skipRoute: false,
    checkOnly: false
  };

  if (args.includes('--fetch')) {
    options.skipScore = true;
    options.skipRoute = true;
  } else if (args.includes('--score')) {
    options.skipFetch = true;
    options.skipRoute = true;
  } else if (args.includes('--route')) {
    options.skipFetch = true;
    options.skipScore = true;
  } else if (args.includes('--check')) {
    options.checkOnly = true;
  }

  return options;
}

// Run
if (require.main === module) {
  const options = parseArgs();

  if (options.checkOnly) {
    const { checkApproved } = require('./content-router');
    checkApproved().catch(console.error);
  } else {
    runPipeline(options).catch(err => {
      console.error(err);
      process.exit(1);
    });
  }
}

module.exports = { runPipeline };
