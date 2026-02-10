#!/usr/bin/env node
/**
 * Content Router - Queue management and routing
 *
 * Routes scored articles to review queue or archive.
 * Creates markdown files for human review in PKM Inbox.
 * Part of the News Intelligence Pipeline.
 */

const fs = require('fs');
const path = require('path');

// Load configuration
const CONFIG_PATH = path.join(__dirname, 'feeds.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Ensure directories exist
function ensureDirectories() {
  const dirs = [
    config.paths.queueDir,
    config.paths.archiveDir
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// Generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

// Create markdown file for review queue
function createQueueFile(article) {
  const date = new Date().toISOString().split('T')[0];
  const slug = generateSlug(article.title);
  const filename = `${date}-${slug}.md`;
  const filepath = path.join(config.paths.queueDir, filename);

  // Check if file already exists
  if (fs.existsSync(filepath)) {
    console.log(`  → Skip (already exists): ${filename}`);
    return null;
  }

  const isHighlight = article.aiScore >= config.scoring.highlightThreshold;

  // Generate publish time options
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  const tomorrow9am = new Date(now);
  tomorrow9am.setDate(tomorrow9am.getDate() + 1);
  tomorrow9am.setHours(9, 0, 0, 0);

  // 🆕 2026-02-02: Check if article has long-form content
  const hasLongForm = article.longFormContent && article.longFormContent.twitterThread;
  const contentType = hasLongForm ? 'long_form' : 'short';

  // Build Twitter thread section
  let twitterSection = '';
  if (hasLongForm) {
    const thread = article.longFormContent.twitterThread;
    twitterSection = `### Twitter Thread (${thread.length} tweets)
\`\`\`
${thread.join('\n\n')}
\`\`\``;
  } else {
    twitterSection = `### Twitter Draft (single tweet)
\`\`\`
${article.draftTweet || '_No draft generated_'}
\`\`\``;
  }

  // Build LinkedIn section
  let linkedinSection = '';
  if (hasLongForm && article.longFormContent.linkedinPost) {
    linkedinSection = `### LinkedIn Post (${article.longFormContent.linkedinPost.length} chars)
\`\`\`
${article.longFormContent.linkedinPost}
\`\`\``;
  } else {
    linkedinSection = `### LinkedIn Draft
\`\`\`
${article.draftTweet || '_No draft generated_'}
\`\`\``;
  }

  const content = `---
title: "${article.title.replace(/"/g, '\\"')}"
source: ${article.source || article.feedName}
url: ${article.link}
score: ${article.aiScore}
highlight: ${isHighlight}
content_type: ${contentType}
reason: "${(article.aiReason || '').replace(/"/g, '\\"')}"
suggested_angle: "${(article.suggestedAngle || article.longFormContent?.keyAngle || '').replace(/"/g, '\\"')}"
created: ${new Date().toISOString()}
platforms:
  - twitter
  - linkedin
status: pending
publish_at:
---

# ${article.title}

> **Score**: ${article.aiScore}/10 ${isHighlight ? '⭐ HIGHLIGHT' : ''} ${hasLongForm ? '📝 LONG-FORM' : ''} | **Source**: [${article.source || article.feedName}](${article.link})

## AI Analysis
- **Why this matters**: ${article.aiReason}
- **Suggested angle**: ${article.suggestedAngle || article.longFormContent?.keyAngle || '_No angle_'}

## Summary
${article.summary || '_No summary available_'}

---

## 🐦 Twitter Content

${twitterSection}

### Your Edit (Twitter)
\`\`\`

\`\`\`

---

## 💼 LinkedIn Content

${linkedinSection}

### Your Edit (LinkedIn)
\`\`\`

\`\`\`

---

## ⚡ Quick Actions

### Status (choose one)
- [x] \`pending\` - 還沒決定
- [ ] \`approved\` - 確認發布 ✅
- [ ] \`rejected\` - 不發布 ❌

### Publish Time (choose one, or leave empty for immediate)
- [ ] \`now\` - 立即發布
- [ ] \`${nextHour.toISOString()}\` - 下一個整點
- [ ] \`${tomorrow9am.toISOString()}\` - 明天早上 9:00
- [ ] Custom: \`YYYY-MM-DDTHH:MM:00\`

### Instructions
1. Review AI-generated content for both Twitter and LinkedIn
2. Edit in "Your Edit" sections if needed
3. Change \`status: pending\` to \`status: approved\` in frontmatter
4. Set \`publish_at:\` time (leave empty = next batch)
5. Save file - Publisher will handle the rest

`;

  fs.writeFileSync(filepath, content);
  return filename;
}

// Archive low-score articles
function archiveArticle(article) {
  const date = new Date().toISOString().split('T')[0];
  const slug = generateSlug(article.title);
  const filename = `${date}-${slug}.json`;
  const filepath = path.join(config.paths.archiveDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(article, null, 2));
  return filename;
}

// Main routing function
async function routeArticles() {
  console.log('=== Content Router Starting ===');
  console.log(`Time: ${new Date().toISOString()}`);

  ensureDirectories();

  // Load scored articles
  const scoredPath = path.join(__dirname, 'scored-articles.json');
  if (!fs.existsSync(scoredPath)) {
    console.log('No scored articles found. Run news-scorer.js first.');
    return { queued: 0, archived: 0 };
  }

  const articles = JSON.parse(fs.readFileSync(scoredPath, 'utf8'));
  console.log(`Articles to route: ${articles.length}`);

  let queued = 0;
  let archived = 0;
  let skipped = 0;

  for (const article of articles) {
    if (article.aiScore >= config.scoring.minScoreForQueue) {
      // Route to review queue
      const filename = createQueueFile(article);
      if (filename) {
        // 🆕 2026-02-02: Show long-form vs short status
        const hasLongForm = article.longFormContent && article.longFormContent.twitterThread;
        const status = hasLongForm ? '📝' : (article.aiScore >= config.scoring.highlightThreshold ? '⭐' : '📋');
        const typeLabel = hasLongForm ? ' [LONG-FORM]' : '';
        console.log(`${status} Queued: ${article.title.substring(0, 45)}...${typeLabel} (${article.aiScore}/10)`);
        queued++;
      } else {
        skipped++;
      }
    } else {
      // Archive low-score articles
      archiveArticle(article);
      console.log(`📦 Archived: ${article.title.substring(0, 50)}... (${article.aiScore}/10)`);
      archived++;
    }
  }

  console.log(`\n=== Routing Summary ===`);
  console.log(`Queued for review: ${queued}`);
  console.log(`Skipped (duplicate): ${skipped}`);
  console.log(`Archived: ${archived}`);
  console.log(`Queue location: ${config.paths.queueDir}`);
  console.log('=== Content Router Complete ===\n');

  return { queued, archived, skipped };
}

// Check for approved articles and prepare for publishing
async function checkApproved() {
  console.log('=== Checking Approved Articles ===');

  const queueDir = config.paths.queueDir;
  const files = fs.readdirSync(queueDir).filter(f => f.endsWith('.md'));

  const approved = [];

  for (const file of files) {
    const filepath = path.join(queueDir, file);
    const content = fs.readFileSync(filepath, 'utf8');

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) continue;

    const frontmatter = frontmatterMatch[1];

    // Check status
    if (frontmatter.includes('status: approved')) {
      // Extract edit content
      const editMatch = content.match(/## Your Edit[^`]*```\n([\s\S]*?)\n```/);
      const editedContent = editMatch ? editMatch[1].trim() : null;

      // Extract draft tweet
      const draftMatch = content.match(/## Draft Tweet[^`]*```\n([\s\S]*?)\n```/);
      const draftContent = draftMatch ? draftMatch[1].trim() : null;

      // Extract metadata
      const urlMatch = frontmatter.match(/url: (.+)/);
      const titleMatch = frontmatter.match(/title: "(.+)"/);

      approved.push({
        file,
        filepath,
        title: titleMatch ? titleMatch[1] : file,
        url: urlMatch ? urlMatch[1] : null,
        content: editedContent || draftContent || '',
        platforms: frontmatter.includes('twitter') ? ['twitter'] : []
      });

      console.log(`✅ Found approved: ${file}`);
    }
  }

  console.log(`\nApproved articles: ${approved.length}`);

  // Save approved list for publisher
  if (approved.length > 0) {
    const outputPath = path.join(__dirname, 'approved-for-publish.json');
    fs.writeFileSync(outputPath, JSON.stringify(approved, null, 2));
    console.log(`Saved to: approved-for-publish.json`);
  }

  return approved;
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--check-approved')) {
    checkApproved().catch(console.error);
  } else {
    routeArticles().catch(console.error);
  }
}

module.exports = { routeArticles, checkApproved, createQueueFile };
