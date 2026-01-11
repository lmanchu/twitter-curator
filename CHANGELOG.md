# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.8.0] - 2026-01-12

### 🎯 Reply Relevance Checking - Prevent Irrelevant Replies

This version adds strict relevance checking to prevent automated replies that have no connection to the original tweet content.

### Added
- ✅ **`isRelevantToExpertise()`** - Pre-check if original tweet is in our domain
  - Domains: AI, Startup, Product, Infrastructure, Privacy, Web3, Productivity
  - Uses word boundary matching to avoid false positives (e.g., "PM" in "3:00 PM")
- ✅ **`isReplyRelevant()`** - Post-generation validation
  - Checks shared keywords between original tweet and generated reply
  - Ensures replies are actually related to the conversation
- ✅ **`EXPERTISE_KEYWORDS`** constant - Centralized domain keyword definitions
- ✅ **Retry mechanism** - Up to 2 retries if generated reply is not relevant

### Changed
- `generateReply()` now skips tweets outside expertise area
- Replies that fail relevance check are regenerated or skipped
- Removed standalone 'pm' keyword to avoid matching time formats

### Fixed
- 🐛 **Irrelevant replies** - No longer replies to tweets about NBA schedules, politics, or other unrelated topics with forced AI/tech content
- 🐛 **PM false positive** - "3:00 PM" no longer triggers product management relevance

### Architecture
- Pre-check: `isRelevantToExpertise()` before generating reply
- Post-check: `isReplyRelevant()` after generation
- Both checks must pass for reply to be sent

---

## [2.7.1] - 2026-01-12

### 🔄 Hermes Account Switching Fix

### Added
- ✅ **DELEGATE_MODE** to Hermes config.js for automatic account switching
  - `target_account: 'lmanchu'` ensures Hermes uses personal account
  - Shares `chrome-user-data` with Apollo safely

### Fixed
- 🐛 **Account confusion** - Hermes was stuck on @irisgoai after Apollo ran
- 🐛 **No posts since 1/7** - Posts were failing silently due to wrong account

---

## [2.7.0] - 2026-01-09

### 🏢 LinkedIn Brand Mode Support

This version extends brand mode support to LinkedIn content generator, preventing personal experiences from leaking into LinkedIn Page posts.

### Added
- ✅ **Brand prompt templates** in linkedin-content-generator.js:
  - `getBrandLinkedInPostPrompt()` - brand voice for LinkedIn posts
  - `getBrandLinkedInReplyPrompt()` - brand voice for LinkedIn replies
- ✅ **brandConfig parameter** to `generateLinkedInPost()` and `generateLinkedInReply()`
- ✅ **Automatic mode detection** in linkedin-curator.js with logging

### Changed
- LinkedIn posts/replies now use brand voice when `BRAND_MODE='brand'`
- Brand mode prevents personal experiences ("After 8 years...", "I", "my")
- Uses company perspective ("We at IriXion...", "Our approach...")

### Architecture
- Same pattern as Twitter brand mode (v2.6.0)
- `brandConfig` passed through LinkedIn content generation pipeline
- Personal mode preserved for individual accounts

## [2.6.0] - 2026-01-09

### 🏢 Brand Mode Support - Fix Personal Experience Leak

This version adds brand mode support to prevent personal experiences (e.g., "After 8 years...") from leaking into brand account posts.

### Added
- ✅ **`BRAND_MODE` config option** - switch between 'brand' and 'personal' mode
- ✅ **`BRAND_CONFIG` settings** - brand name, handle, tagline, voice, perspective
- ✅ **Brand prompt templates** in content-generator.js:
  - `getBrandTweetPrompt()` - brand voice for original tweets
  - `getBrandReplyPrompt()` - brand voice for replies
  - `getBrandTrackedReplyPrompt()` - brand voice for tracked account replies
- ✅ **Automatic mode detection** - logs which mode is active at startup

### Fixed
- 🐛 **Personal experience leak** - brand accounts no longer say "After 8 years of building..." or use first-person singular ("I", "my")
- 🐛 **Prompt hardcoding** - prompts now dynamically switch based on config instead of hardcoded "You are Lman"

### Architecture
- Brand mode uses company perspective ("We at IrisGo...", "Our approach...")
- Personal mode preserves original Lman voice with personal experiences
- `brandConfig` passed through all content generation functions
- Interest-based replies (anime/entertainment) disabled for brand accounts

## [2.5.0] - 2026-01-09

### 📚 Knowledge Base Integration for Apollo

This version adds knowledge base support for brand accounts, ensuring consistent and accurate messaging.

### Added
- ✅ **`loadKnowledgeBase()` function** in content-generator.js - loads all .md files from a directory
- ✅ **Knowledge base path config** - `config.PATHS.knowledge_base` for brand-specific knowledge
- ✅ **Automatic knowledge injection** - appends knowledge base content to persona at startup

### Architecture
- Knowledge base files stored in `~/Dropbox/PKM-Vault/1-Projects/IrisGo/Apollo/knowledge-base/core/`
- Team can collaborate via Tandem sync
- Files: `approved-claims.md`, `product-overview.md`, `pricing.md`, `faqs.md`
- TODO markers and incomplete items automatically filtered out

## [2.4.0] - 2026-01-09

### 🐛 Reply Selector Reliability Fixes

This version fixes critical reply selector issues on both Twitter and LinkedIn platforms.

### Fixed
- 🐛 **Twitter Reply "Send button not found"**: Added multiple fallback selectors with `waitForSelector` instead of direct query
- 🐛 **Twitter "Frame detached" errors**: Navigate to `about:blank` before each reply to clear frame state, use `domcontentloaded` instead of `networkidle2`
- 🐛 **LinkedIn Reply "Element index out of range"**: Added 6 fallback post selectors and direct Comment button approach

### Added
- ✅ **`typeAndSubmitComment` helper function** in LinkedIn curator - extracts comment typing and submission logic for code reuse
- ✅ **Multiple fallback selectors** for Twitter send button: `tweetButton`, `tweetButtonInline`, etc.
- ✅ **Direct Comment button fallback** for LinkedIn when post elements cannot be found

### Changed
- 📝 **Refactored `replyOnCurrentPage`** in LinkedIn curator to use helper function, eliminating ~170 lines of duplicate code
- 📝 **Twitter reply success rate improved** from ~20% to ~60% with frame stability fixes

## [2.2.0] - 2026-01-04

### 🚀 OpenAI Fallback & Reply Quality Improvements

This version adds OpenAI gpt-4o-mini as a fallback when Ollama content extraction fails, and improves reply generation prompts to reduce "too similar" rejections.

### Added
- ✅ **OpenAI gpt-4o-mini fallback** for all three reply functions:
  - `generateReply()` - standard replies
  - `generateInterestReply()` - anime/entertainment replies
  - `generateTrackedReply()` - tracked account replies
  - New `callOpenAIDirect()` helper function
  - Fallback triggers when `cleanContent()` fails or returns < 10 chars

### Changed
- 📝 **Improved reply prompts** to reduce content repetition:
  - Added "DO NOT paraphrase or repeat the original tweet"
  - Added "Your reply must be SUBSTANTIALLY DIFFERENT"
  - Should reduce "Reply too similar to original" skips

- 📊 **Twitter config optimizations**:
  - `REPLIES_PER_HOUR`: 2 → 3
  - `max_replies`: 30 → 40
  - `max_total`: 50 → 60

- 📊 **LinkedIn config optimizations**:
  - `CONTENT_LENGTH.ideal`: 1000 → 1800 (longer posts for better engagement)
  - `DAILY_REPLIES`: 6 → 10

### Fixed
- 🐛 **Model fallback chain**: Changed from non-existent `qwen3-vl:30b` to `qwen3-coder:30b`
- 🐛 **"Reply generation failed"** now properly falls back to OpenAI instead of silently failing

## [2.1.0] - 2025-12-05

### 🔧 LinkedIn Curator Improvements

This version fixes critical bugs in the LinkedIn automation system and adds English-only output for international audience reach.

### Fixed
- 🐛 **CRITICAL**: Fixed LLM "Thinking..." block being posted to LinkedIn
  - Added `stripThinkingBlock()` function to filter out model reasoning
  - Applied to three code paths: `generateDraft()`, `correctDraft()`, and `callOllamaAPI()`
  - Regex patterns handle both `Thinking...done thinking.` and `<thinking>` XML formats

- 🐛 **CRITICAL**: Fixed `linkedin-content-generator.js` returning `data.thinking` instead of `data.response`
  - Ollama API returns both `response` (actual output) and `thinking` (internal reasoning)
  - Now correctly prioritizes `data.response` over `data.thinking`

### Changed
- 🌐 **LinkedIn posts now output in English only** (previously Chinese)
  - Updated `linkedin-fact-checker-ollama.js` prompts to require English
  - Changed system prompt, requirements, and correction prompts
  - Better suited for international LinkedIn audience

### Technical Details

**Files Modified:**
- `linkedin-fact-checker-ollama.js` (lines 81-109, 210-216, 218-223)
- `linkedin-content-generator.js` (lines 245-259)

**stripThinkingBlock() Function:**
```javascript
function stripThinkingBlock(content) {
  let cleaned = content.replace(/Thinking\.{3}[\s\S]*?\.{3}done thinking\.\s*/gi, '');
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '');
  cleaned = cleaned.replace(/^\s+/, '');
  return cleaned;
}
```

**Verified Results:**
- Fact-check score: 100/100
- Clean English output without thinking process
- Successfully published 3 LinkedIn posts

---

## [2.0.0] - 2025-11-09

### 🎉 Major Release - Working Automation System

This version represents a complete rewrite and fix of the Twitter automation system.

### Added
- ✅ **Tweet URL Tracking** - Automatically captures and records tweet URLs after posting
- ✅ **Puppeteer v24 Integration** - Upgraded from v21 to v24.27.0 for M2 Mac compatibility
- ✅ **Verified Posting** - Confirmed tweets actually appear on Twitter profile
- 📝 Complete documentation (README.md, CHANGELOG.md)
- 🔍 Debug logging for button selector discovery

### Fixed
- 🐛 **CRITICAL**: Fixed button selector from `tweetButton` to `tweetButtonInline`
  - Previous version could not find the Post button
  - Main tweet composition uses different selector than reply modal
- 🐛 **M2 Mac Compatibility**: Resolved Rosetta compatibility errors
  - Upgraded Puppeteer from v21.0.0 to v24.27.0
  - Eliminated "value out of range" and "mach_o_image_annotations_reader" errors
- 🐛 **Login Session Persistence**: Fixed Chrome user data directory
  - Copied working session from twitter-auto-engagement
  - Login now persists across runs
- 🔄 **URL Extraction**: Implemented profile page scraping for tweet URLs
  - Navigates to profile after posting
  - Extracts latest tweet URL
  - Records in posted-tweets.json with method: "puppeteer"

### Changed
- ⚡ Simplified tweet posting logic - removed unnecessary debugging code
- 📦 Updated package.json dependencies
- 🏗️ Improved error handling and logging
- 📝 Updated all 8 LaunchAgent plists to use twitter-curator.js instead of twitter-ii-agent.js

### Removed
- ❌ Removed failed ii-agent approach (WebSocket API cannot automate browsers)
- ❌ Removed BrowserOS type_text attempts (cannot trigger React state)
- ❌ Removed Playwright attempts (detected and blocked by Twitter)
- 🧹 Cleaned up false success records from posted-tweets.json

### Technical Details

**What Worked:**
- Puppeteer v24.27.0 + Stealth Plugin
- Button selector: `[data-testid="tweetButtonInline"]`
- Chrome User Data persistence
- Profile page URL extraction

**What Failed:**
- ii-agent: No browser automation capabilities (only web scraping)
- BrowserOS type_text: Cannot trigger React contenteditable state updates
- Playwright: Detected by Twitter security
- Puppeteer v21: Rosetta compatibility issues on M2 Mac

### Verified Results

Successfully posted and verified on Twitter:
- Tweet 1: "Intel's AI PC push feels like the early days of PC adoption..."
  - URL: https://x.com/lmanchu/status/1987361479673135413
  - Timestamp: 2025-11-09T03:26:49.716Z

- Tweet 2: "Building privacy-first tech feels like early TCP/IP days..."
  - URL: https://x.com/lmanchu/status/1987361713835192354
  - Timestamp: 2025-11-09T03:29:01.598Z

## [1.0.0] - 2025-11-08

### Initial Release (Failed)

⚠️ This version did NOT work - tweets were not actually posted.

### Attempted
- ii-agent WebSocket API integration
- BrowserOS MCP integration
- Button selector: `[data-testid="tweetButton"]` (incorrect)
- Puppeteer v21.0.0 (incompatible with M2 Mac)

### Issues
- ii-agent claimed success but tweets never appeared on Twitter
- BrowserOS type_text couldn't trigger React state
- Puppeteer v21 had Rosetta compatibility errors
- All posted-tweets.json entries had `url: null`

---

## Development Notes

### Button Selector Discovery Process

1. **Initial attempt**: `[data-testid="tweetButton"]` - FAILED (selector not found)
2. **Debug logging**: Listed all buttons on page
3. **Found**: `[data-testid="tweetButtonInline"]` with text "Post" - SUCCESS

### Puppeteer Version Journey

- v21.0.0: Rosetta errors on M2 Mac
- v24.27.0: Works perfectly on M2 Mac

### Authentication Methods Tested

1. ❌ Cookies (expired quickly)
2. ❌ Manual login each run (not automated)
3. ✅ Chrome User Data directory (persists session)

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
