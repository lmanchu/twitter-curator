#!/usr/bin/env node
/**
 * News Scorer - AI-powered relevance scoring
 *
 * Uses CLIProxyAPI (unified AI proxy) to evaluate news articles for posting potential.
 * Part of the News Intelligence Pipeline.
 *
 * Enhanced to support multi-source content (RSS, Twitter, Anime, VC)
 * with persona-aware evaluation.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');

// 🆕 2026-02-07: Humanizer integration - remove AI writing patterns
const { humanize } = require(path.join(process.env.HOME, 'bin', 'humanizer.js'));

// Load configuration
const CONFIG_PATH = path.join(__dirname, 'feeds.json');
const SOURCES_PATH = path.join(__dirname, 'sources.json');

const feedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
let sourcesConfig = null;
try {
  sourcesConfig = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));
} catch (e) {
  console.log('[SCORER] sources.json not found, using legacy mode');
}

// CLIProxyAPI configuration (unified AI proxy - OAuth-based, no quota limits)
const CLIPROXY_URL = process.env.CLIPROXY_URL || 'http://127.0.0.1:8317';
const CLIPROXY_API_KEY = process.env.CLIPROXY_API_KEY || 'magi-proxy-key-2026';
const CLIPROXY_MODEL = process.env.CLIPROXY_MODEL || 'glm-4.7';
// 🔄 2026-02-08: Fallback chain: GLM-4.7 (primary, purchased) → Gemini → GLM-4.6
const CLIPROXY_FALLBACK_MODEL_1 = process.env.CLIPROXY_FALLBACK_MODEL_1 || 'gemini-2.5-flash';
const CLIPROXY_FALLBACK_MODEL_2 = process.env.CLIPROXY_FALLBACK_MODEL_2 || 'glm-4.6';

// Base Scoring prompt - enhanced with persona and multi-content support
const getScorincPrompt = (article) => {
  const sourceType = article.sourceType || 'rss';
  const isAnime = sourceType === 'anime' || (article.animeMeta);
  const isTwitter = sourceType === 'twitter' || (article.twitterMeta);

  let additionalContext = '';

  if (isAnime) {
    additionalContext = `
## Anime/Sci-Fi Context
This is anime or sci-fi content. Lman's favorites:
- Anime: My Hero Academia (Plus Ultra!), One Punch Man, Frieren, Attack on Titan, Chainsaw Man, Jujutsu Kaisen, Dandadan, Kaiju No. 8
- Sci-Fi: Star Wars, Matrix, Interstellar, Dune, Foundation

Strategy: Post directly showing personal interests. Look for:
1. News about favorite titles
2. Business angles (streaming, IP licensing, industry trends)
3. Connections to tech/startup mindset (Plus Ultra = going beyond limits)
`;
  }

  if (isTwitter) {
    const meta = article.twitterMeta || {};
    additionalContext = `
## Twitter Content Context
Original author: ${meta.author || 'Unknown'}
Engagement: ${meta.likes || 0} likes, ${meta.retweets || 0} retweets
Suggested interaction: ${meta.interactionType || 'quote'}

Consider:
- Should Lman quote (add commentary) or reply (join conversation)?
- What unique perspective can Lman add?
- Is this a good conversation to join for visibility?
`;
  }

  // Different prompts for different content types
  const isAnimeContent = sourceType === 'anime';

  if (isAnimeContent) {
    return `You are evaluating ANIME/SCIFI content for Lman's Twitter.

## About Lman's Anime Interest
- Genuine anime fan, not using it for "business angles"
- Favorite anime: My Hero Academia, One Punch Man, Frieren, Attack on Titan, Chainsaw Man, Jujutsu Kaisen, Dandadan, Kaiju No. 8
- Favorite sci-fi: Star Wars, Matrix, Interstellar, Dune, Foundation
- Posts about anime as a FAN, not connecting it to tech

## Scoring Criteria (0-10 scale)
- **Favorite match** (50%): Is this about one of Lman's favorite anime/series?
- **Newsworthiness** (30%): Is this a significant announcement (new season, finale, etc.)?
- **Discussion potential** (20%): Will fans want to discuss this?

## Score Guidelines
- 9-10: About a favorite anime + major news (new season, awards, etc.)
- 7-8: About a favorite anime OR major anime industry news
- 5-6: General anime news, might interest fans
- 0-4: Not interesting for casual anime fan

## Content to Evaluate
**Title**: {title}
**Source**: {source}
**Summary**: {summary}

## Response Format (JSON only)
{
  "score": 8,
  "reason": "Brief explanation",
  "suggested_angle": "Fan perspective for the post",
  "draft_tweet": "Tweet as a fan, max 280 chars, no hashtags",
  "interaction_type": "post"
}

IMPORTANT: Write draft_tweet as a genuine anime fan, not as a tech influencer.`;
  }

  return `You are Lman's content curation assistant. Evaluate this TECH/STARTUP content.

## About Lman
- Tech entrepreneur, IrisGo.AI co-founder
- Expertise: AI/LLM, Web3/Blockchain, Startup ecosystem, Privacy tech
- Writing style: Direct, critical thinking, connects tech with business value
- Based in Taiwan, interested in Asia tech scene
${additionalContext}
## Scoring Criteria (0-10 scale)
- **Relevance** (40%): How relevant to Lman's expertise and audience?
- **Timeliness** (20%): Is this breaking news or timely?
- **Commentary potential** (20%): Can Lman add unique perspective?
- **Engagement potential** (20%): Will this spark discussion?

## Content Diversity Note
- We already have many AI posts. Prefer: Startup funding, Asia tech, Privacy, Web3, Infrastructure
- Generic "AI company raises money" is less interesting than unique takes

## Score Guidelines
- 9-10: Must post! Directly relevant, unique angle, high engagement
- 7-8: Strong candidate, Lman can add real value
- 5-6: Decent but generic, needs review
- 3-4: Marginal, too similar to other content
- 0-2: Not relevant or low quality

## Content to Evaluate
**Type**: ${sourceType}
**Title**: {title}
**Source**: {source}
**Summary**: {summary}

## Response Format (JSON only, no markdown)
{
  "score": 8,
  "reason": "Brief explanation why this score",
  "suggested_angle": "Suggested perspective or hook for the post",
  "draft_tweet": "A draft tweet in Lman's voice (280 chars max, no hashtags)",
  "interaction_type": "${isTwitter ? 'quote_or_reply' : 'post'}"
}

IMPORTANT:
- Response must be valid JSON only
- draft_tweet must be in Lman's authentic voice
- NO phrases like "I think", "As an AI", "Let me explain"
- Start with a strong hook, be direct and opinionated
- draft_tweet should be in English`;
};

// 🆕 2026-02-02: Long-form content prompt for high-scoring articles
const LONG_FORM_PROMPT = `You are Lman's content writer. Create in-depth social media content for this high-value article.

## About Lman
- Tech entrepreneur, IrisGo.AI co-founder
- Expertise: AI/LLM, Web3/Blockchain, Startup ecosystem, Privacy tech
- Writing style: Direct, critical thinking, connects tech with business value
- Based in Taiwan, interested in Asia tech scene

## Content Requirements

### Twitter Thread (3-5 tweets)
- Tweet 1: Strong hook that grabs attention
- Tweet 2-4: Key insights, analysis, or implications
- Tweet 5: Takeaway or call to discussion
- Each tweet: 260 chars max (leave room for thread numbering)
- NO hashtags in thread

### LinkedIn Post (800-1500 words)
- Opening hook (1-2 sentences)
- Context and background
- Your analysis/perspective (this is the meat)
- Implications for the industry
- Call to action / discussion prompt
- 3-5 relevant hashtags at the end

## Article to Expand
**Title**: {title}
**Source**: {source}
**Summary**: {summary}

## Response Format (JSON only)
{
  "twitter_thread": [
    "1/ Hook tweet here...",
    "2/ Second insight...",
    "3/ Third point...",
    "4/ Fourth point...",
    "5/ Takeaway and question"
  ],
  "linkedin_post": "Full LinkedIn post with paragraphs...",
  "key_angle": "The main perspective or hook"
}

IMPORTANT:
- Write in Lman's authentic voice - direct, analytical, slightly contrarian
- Add genuine insights, not just summary
- Make it worth reading - add VALUE beyond the original article
- LinkedIn post should be substantive, not fluff`;

// Legacy prompt for backward compatibility
const SCORING_PROMPT = `You are Lman's content curation assistant. Evaluate this news article for social media posting potential.

## About Lman
- Tech entrepreneur, IrisGo.AI co-founder
- Expertise: AI/LLM, Web3/Blockchain, Startup ecosystem, Privacy tech
- Writing style: Direct, critical thinking, connects tech with business value
- Based in Taiwan, interested in Asia tech scene

## Scoring Criteria (0-10 scale)
- **Relevance** (40%): How relevant to Lman's expertise and audience?
- **Timeliness** (20%): Is this breaking news or timely?
- **Commentary potential** (20%): Can Lman add unique perspective?
- **Engagement potential** (20%): Will this spark discussion?

## Score Guidelines
- 9-10: Must post! Directly relevant, high engagement potential
- 7-8: Strong candidate, worth posting with good angle
- 5-6: Decent, needs review for right angle
- 3-4: Marginal, archive for reference
- 0-2: Not relevant or low quality

## Article to Evaluate
**Title**: {title}
**Source**: {source}
**Summary**: {summary}

## Response Format (JSON only, no markdown)
{
  "score": 8,
  "reason": "Brief explanation why this score",
  "suggested_angle": "Suggested perspective or hook for the post",
  "draft_tweet": "A draft tweet in Lman's voice (280 chars max, no hashtags)"
}

IMPORTANT:
- Response must be valid JSON only
- draft_tweet must be in Lman's authentic voice
- NO phrases like "I think", "As an AI", "Let me explain"
- Start with a strong hook, be direct and opinionated
- draft_tweet should be in English (Lman posts in English on Twitter)`;

// Call CLIProxyAPI with model
async function callCLIProxyAPI(prompt, model, isLongForm = false) {
  // 🆕 2026-02-02: 調整 token limits
  // - Long-form: 需要生成 thread + LinkedIn post，用更多 tokens
  // - GLM: 有 reasoning_content 佔用 tokens
  let maxTokens = 600;
  if (isLongForm) {
    maxTokens = 3000;  // Long-form 需要更多空間
  } else if (model.startsWith('glm')) {
    maxTokens = 1200;  // GLM scoring
  }

  const response = await fetch(`${CLIPROXY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CLIPROXY_API_KEY}`
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: maxTokens
    })
  });

  if (!response.ok) {
    const error = new Error(`API error: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return await response.json();
}

// Score a single article using CLIProxyAPI (with fallback)
async function scoreArticle(article, useEnhanced = true) {
  // Use enhanced prompt for multi-source content
  const promptTemplate = useEnhanced ? getScorincPrompt(article) : SCORING_PROMPT;
  const prompt = promptTemplate
    .replace('{title}', article.title)
    .replace('{source}', article.source || article.feedName)
    .replace('{summary}', (article.summary || '').substring(0, 500));

  let data;
  let usedModel = CLIPROXY_MODEL;

  try {
    // Try primary model first
    data = await callCLIProxyAPI(prompt, CLIPROXY_MODEL);
  } catch (err) {
    // 🆕 2026-02-02: Fallback chain: GLM → Claude
    console.log(`[SCORER] Primary model ${CLIPROXY_MODEL} failed (${err.status || err.message}), trying GLM fallback...`);
    try {
      data = await callCLIProxyAPI(prompt, CLIPROXY_FALLBACK_MODEL_1);
      usedModel = CLIPROXY_FALLBACK_MODEL_1;
      console.log(`[SCORER] GLM fallback ${CLIPROXY_FALLBACK_MODEL_1} succeeded`);
    } catch (glmErr) {
      console.log(`[SCORER] GLM fallback failed (${glmErr.status || glmErr.message}), trying Claude fallback...`);
      try {
        data = await callCLIProxyAPI(prompt, CLIPROXY_FALLBACK_MODEL_2);
        usedModel = CLIPROXY_FALLBACK_MODEL_2;
        console.log(`[SCORER] Claude fallback ${CLIPROXY_FALLBACK_MODEL_2} succeeded`);
      } catch (claudeErr) {
        console.error(`[SCORER] All fallbacks failed:`, claudeErr.message);
        return null;
      }
    }
  }

  try {
    if (!data.choices || !data.choices[0].message.content) {
      // 🆕 2026-02-02: 更好的 debug
      console.error(`[SCORER] Invalid response structure from ${usedModel}:`, JSON.stringify(data).substring(0, 200));
      return null;
    }

    const responseText = data.choices[0].message.content;

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // 🆕 2026-02-02: 顯示實際回應內容幫助 debug
      console.error(`[SCORER] No JSON found in ${usedModel} response:`, responseText.substring(0, 200));
      return null;
    }

    let scoring;
    try {
      scoring = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error(`[SCORER] JSON parse failed for ${usedModel}:`, jsonMatch[0].substring(0, 200));
      return null;
    }

    // 🆕 2026-02-07: Humanize the draft tweet to remove AI patterns
    let humanizedTweet = scoring.draft_tweet;
    try {
      humanizedTweet = await humanize(scoring.draft_tweet, { skip: false });
      console.log(`  → Humanized draft tweet`);
    } catch (humErr) {
      console.error(`[HUMANIZER] Failed, using original:`, humErr.message);
    }

    // Build enhanced result
    const result = {
      ...article,
      aiScore: scoring.score,
      aiReason: scoring.reason,
      suggestedAngle: scoring.suggested_angle,
      draftTweet: humanizedTweet,
      scoredAt: new Date().toISOString(),
      scoredBy: usedModel
    };

    // Add anime connection if present
    // anime_connection removed - anime content is now scored independently

    // Add interaction type for Twitter content
    if (scoring.interaction_type && article.sourceType === 'twitter') {
      result.interactionType = scoring.interaction_type;
    }

    return result;
  } catch (err) {
    console.error(`Error scoring article "${article.title}":`, err.message);
    return null;
  }
}

// 🆕 2026-02-02: Generate long-form content for high-scoring articles
async function generateLongFormContent(article) {
  const prompt = LONG_FORM_PROMPT
    .replace('{title}', article.title)
    .replace('{source}', article.source || article.feedName)
    .replace('{summary}', (article.summary || '').substring(0, 1000));

  let data;
  let usedModel = CLIPROXY_MODEL;

  try {
    data = await callCLIProxyAPI(prompt, CLIPROXY_MODEL, true);  // isLongForm = true
  } catch (err) {
    // 🆕 2026-02-02: Fallback chain: GLM → Claude
    console.log(`[LONG-FORM] Primary model failed, trying GLM fallback...`);
    try {
      data = await callCLIProxyAPI(prompt, CLIPROXY_FALLBACK_MODEL_1, true);
      usedModel = CLIPROXY_FALLBACK_MODEL_1;
    } catch (glmErr) {
      console.log(`[LONG-FORM] GLM fallback failed, trying Claude fallback...`);
      try {
        data = await callCLIProxyAPI(prompt, CLIPROXY_FALLBACK_MODEL_2, true);
        usedModel = CLIPROXY_FALLBACK_MODEL_2;
      } catch (claudeErr) {
        console.error(`[LONG-FORM] All fallbacks failed:`, claudeErr.message);
        return null;
      }
    }
  }

  try {
    if (!data.choices || !data.choices[0].message.content) {
      console.error(`[LONG-FORM] Invalid response from ${usedModel}:`, JSON.stringify(data).substring(0, 200));
      return null;
    }

    const responseText = data.choices[0].message.content;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[LONG-FORM] No JSON found in ${usedModel} response:`, responseText.substring(0, 200));
      return null;
    }

    let content;
    try {
      content = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error(`[LONG-FORM] JSON parse failed for ${usedModel}:`, jsonMatch[0].substring(0, 200));
      return null;
    }
    // 🆕 2026-02-07: Humanize thread tweets and LinkedIn post
    let humanizedThread = content.twitter_thread;
    let humanizedLinkedIn = content.linkedin_post;

    try {
      // Humanize each tweet in the thread
      if (content.twitter_thread && Array.isArray(content.twitter_thread)) {
        humanizedThread = await Promise.all(
          content.twitter_thread.map(tweet => humanize(tweet, { skip: false }))
        );
        console.log(`    → Humanized ${humanizedThread.length} thread tweets`);
      }

      // Humanize LinkedIn post
      if (content.linkedin_post) {
        humanizedLinkedIn = await humanize(content.linkedin_post, { skip: false });
        console.log(`    → Humanized LinkedIn post`);
      }
    } catch (humErr) {
      console.error(`[HUMANIZER] Failed in long-form, using original:`, humErr.message);
    }

    return {
      twitterThread: humanizedThread,
      linkedinPost: humanizedLinkedIn,
      keyAngle: content.key_angle,
      generatedBy: usedModel,
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.error(`[LONG-FORM] Error parsing response:`, err.message);
    return null;
  }
}

// Score content from multiple sources
async function scoreMultiSourceContent(articles) {
  console.log('=== Multi-Source Scorer Starting ===');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Articles to score: ${articles.length}`);

  // Group by source type for logging
  const byType = {};
  articles.forEach(a => {
    const type = a.sourceType || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  });
  console.log('By source type:', byType);

  const scoredArticles = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const typeIcon = {
      'rss': '📰',
      'twitter': '🐦',
      'anime': '🌸',
      'vc': '💰'
    }[article.sourceType] || '📄';

    console.log(`[${i + 1}/${articles.length}] ${typeIcon} Scoring: ${article.title.substring(0, 50)}...`);

    const scored = await scoreArticle(article, true);
    if (scored) {
      scoredArticles.push(scored);
      const animeTag = article.sourceType === 'anime' ? ' 🌸' : '';
      console.log(`  → Score: ${scored.aiScore}/10${animeTag} - ${scored.aiReason?.substring(0, 50)}...`);
    }

    // Rate limiting - 1 second between requests
    if (i < articles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Sort by AI score
  scoredArticles.sort((a, b) => b.aiScore - a.aiScore);

  // 🆕 2026-02-02: Generate long-form content for high-scoring articles
  const longFormThreshold = sourcesConfig?.scoring?.highlightThreshold || 8;
  const highScoreArticles = scoredArticles.filter(a => a.aiScore >= longFormThreshold);

  if (highScoreArticles.length > 0) {
    console.log(`\n📝 Generating long-form content for ${highScoreArticles.length} high-score articles...`);

    for (const article of highScoreArticles) {
      console.log(`  → Long-form: ${article.title.substring(0, 40)}...`);
      const longForm = await generateLongFormContent(article);
      if (longForm) {
        article.longFormContent = longForm;
        console.log(`    ✓ Thread: ${longForm.twitterThread?.length || 0} tweets, LinkedIn: ${(longForm.linkedinPost?.length || 0)} chars`);
      }
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  console.log(`\nScored ${scoredArticles.length} articles`);
  console.log(`High score (>=8): ${scoredArticles.filter(a => a.aiScore >= 8).length} (with long-form)`);
  console.log(`Anime content: ${scoredArticles.filter(a => a.sourceType === 'anime').length}`);
  console.log('=== Multi-Source Scorer Complete ===\n');

  return scoredArticles;
}

// Main scoring function
async function scoreAllArticles() {
  console.log('=== News Scorer Starting ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Load pending articles
  const pendingPath = path.join(__dirname, 'pending-articles.json');
  if (!fs.existsSync(pendingPath)) {
    console.log('No pending articles found. Run news-monitor.js first.');
    return [];
  }

  const articles = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  console.log(`Articles to score: ${articles.length}`);

  const scoredArticles = [];

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`[${i + 1}/${articles.length}] Scoring: ${article.title.substring(0, 50)}...`);

    const scored = await scoreArticle(article);
    if (scored) {
      scoredArticles.push(scored);
      console.log(`  → Score: ${scored.aiScore}/10 - ${scored.aiReason?.substring(0, 50)}...`);
    }

    // Rate limiting - 1 second between requests
    if (i < articles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Sort by AI score
  scoredArticles.sort((a, b) => b.aiScore - a.aiScore);

  // 🆕 2026-02-02: Generate long-form content for high-scoring articles
  const longFormThreshold = feedConfig.scoring?.longFormThreshold || 8;
  const highScoreArticles = scoredArticles.filter(a => a.aiScore >= longFormThreshold);

  if (highScoreArticles.length > 0) {
    console.log(`\n📝 Generating long-form content for ${highScoreArticles.length} high-score articles...`);

    for (const article of highScoreArticles) {
      console.log(`  → Long-form: ${article.title.substring(0, 40)}...`);
      const longForm = await generateLongFormContent(article);
      if (longForm) {
        article.longFormContent = longForm;
        console.log(`    ✓ Thread: ${longForm.twitterThread?.length || 0} tweets, LinkedIn: ${(longForm.linkedinPost?.length || 0)} chars`);
      }
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // Save scored articles
  const outputPath = path.join(__dirname, 'scored-articles.json');
  fs.writeFileSync(outputPath, JSON.stringify(scoredArticles, null, 2));

  console.log(`\nScored ${scoredArticles.length} articles`);
  console.log(`High score (>=8): ${scoredArticles.filter(a => a.aiScore >= 8).length} (with long-form)`);
  console.log(`Medium score (7): ${scoredArticles.filter(a => a.aiScore === 7).length}`);
  console.log(`Low score (<7): ${scoredArticles.filter(a => a.aiScore < 7).length} (archived)`);
  console.log('=== News Scorer Complete ===\n');

  return scoredArticles;
}

// Run if called directly
if (require.main === module) {
  scoreAllArticles().catch(console.error);
}

module.exports = { scoreArticle, scoreAllArticles, scoreMultiSourceContent, generateLongFormContent };
