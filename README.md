# Twitter Curator

🤖 AI-powered Twitter automation system with persona-driven content generation and intelligent engagement.

## Features

- ✅ **Automated Tweet Posting** - Schedule and post original tweets automatically
- ✅ **URL Tracking** - Capture and record tweet URLs for analytics
- ✅ **Persona-Driven Content** - Generate authentic content based on your personal profile
- ✅ **Smart Engagement** - Auto-reply to relevant tweets in your niche
- ✅ **Anti-Detection** - Uses Puppeteer with stealth plugin to avoid platform detection
- ✅ **macOS Integration** - LaunchAgents for scheduled automation

## Tech Stack

- **Node.js** - Runtime environment
- **Puppeteer v24.27.0** - Browser automation (M2 Mac compatible)
- **Puppeteer Extra + Stealth Plugin** - Anti-detection
- **Google Gemini API** - AI content generation
- **macOS LaunchAgents** - Scheduling system

## Prerequisites

- Node.js 16+
- macOS (for LaunchAgents)
- Google Gemini API key
- Twitter account (logged in via Chrome profile)

## Installation

```bash
# Clone the repository
git clone https://github.com/lmanchu/twitter-curator.git
cd twitter-curator

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env and add your API keys
nano .env
```

## Configuration

### 1. Environment Variables

Create a `.env` file:

```env
GEMINI_API_KEY=your_gemini_api_key_here
HEADLESS=true
DRY_RUN=false
```

### 2. Persona Profile

Update `PERSONA_FILE` path in `config.js` to point to your persona profile markdown file.

### 3. Chrome Login

Run once with `HEADLESS=false` to login to Twitter:

```bash
HEADLESS=false node twitter-curator.js
```

Login manually when browser opens. Session will be saved to `chrome-user-data/`.

## Usage

### Manual Run

```bash
# Dry run (test without posting)
DRY_RUN=true node twitter-curator.js

# Live posting
node twitter-curator.js
```

## Project Structure

```
twitter-curator/
├── twitter-curator.js        # Main automation script
├── content-generator.js      # AI content generation
├── config.js                 # Configuration
├── package.json              # Dependencies
├── .env                      # Environment variables (not committed)
├── chrome-user-data/         # Saved browser session (not committed)
├── logs/                     # Execution logs
└── posted-tweets.json        # Tweet history with URLs
```

## How It Works

1. **Content Generation**: Uses Gemini AI to generate original tweets based on your persona
2. **Browser Automation**: Puppeteer navigates to Twitter and posts tweets
3. **URL Capture**: After posting, retrieves the tweet URL from your profile
4. **Engagement**: Searches for relevant tweets and generates contextual replies
5. **Logging**: Records all activities with timestamps and URLs

## Key Technical Details

### Button Selector

Uses `[data-testid="tweetButtonInline"]` for main tweet composition (not the modal `tweetButton`).

### M2 Mac Compatibility

Puppeteer v24.27.0 resolves Rosetta compatibility issues on Apple Silicon.

### Anti-Detection

- Stealth plugin to hide automation markers
- Random delays to mimic human behavior
- Persistent Chrome profile (no repeated logins)
- Custom user agent

## Troubleshooting

### "Post button not found"
- Check if Twitter UI has changed
- Try updating the selector in `twitter-curator.js`

### Rosetta errors on M2 Mac
- Ensure Puppeteer is v24+: `npm install puppeteer@^24.27.0`

### Login required every time
- Check `chrome-user-data/` directory exists
- Run once with `HEADLESS=false` to login

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

## License

MIT

## Disclaimer

⚠️ **Use responsibly**: Automated posting may violate Twitter's Terms of Service. This tool is for educational purposes. Use at your own risk.

## Author

Built with ❤️ by Lman

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
