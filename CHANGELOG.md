# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
