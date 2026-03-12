# Twitter Curator

AI-powered Twitter automation system. Runs as a scheduled pipeline on macOS, generates persona-driven content, and posts through browser automation.

> **Version 2.11.0** — Production system powering [@lmanchu](https://twitter.com/lmanchu)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  PIPELINE (every 4h)                                │
│  hermes-auto-pipeline.js                            │
│  • Fetch RSS / Anime / VC sources                   │
│  • Score relevance with AI                          │
│  • Send review cards → Discord #review channel      │
└─────────────────────┬───────────────────────────────┘
                      │  Approve / Reject buttons
                      ▼
┌─────────────────────────────────────────────────────┐
│  POSTING (11 LaunchAgents, hourly schedule)         │
│  twitter-curator.js                                 │
│  • Pull approved content from queue                 │
│  • Generate tweet via CLIProxyAPI                   │
│  • Post via Puppeteer + Stealth                     │
│  • Reply to tracked accounts                        │
└─────────────────────────────────────────────────────┘
```

Two decoupled subsystems:
1. **Content pipeline** — discovers and scores content, routes to Discord for human review
2. **Posting agents** — run on schedule, pull from approved queue, post to Twitter

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Browser automation | Puppeteer v24+ + puppeteer-extra-plugin-stealth |
| AI content generation | CLIProxyAPI (unified proxy → Gemini / GLM / Ollama) |
| Humanizer | Local Ollama `qwen3.5:35b-a3b` — removes AI writing patterns |
| Review workflow | Discord embeds + interactive Approve/Reject buttons |
| Scheduling | macOS LaunchAgents |
| Runtime | Node.js 18+ |

---

## AI Model Stack

```
CLIProxyAPI (http://localhost:8317)
  ├── Primary:  gemini-2.5-flash   (Google OAuth subscription)
  ├── Fallback: glm-4.7            (GLM purchased plan)
  └── Fallback: glm-4.5-air        (lighter fallback)

Humanizer (runs locally, no API call):
  └── Ollama: qwen3.5:35b-a3b      (strips AI writing signatures)
```

CLIProxyAPI is a local reverse proxy that routes to subscribed AI services. No per-call billing for primary models.

---

## Project Structure

```
twitter-curator/
├── twitter-curator.js          # Main posting agent
├── content-generator.js        # AI tweet generation (persona-aware)
├── post-one-tweet.js           # Manual posting (--reply, --quote support)
├── hermes-optimizer.js         # Score-based content optimization
├── quality-guards.js           # Content safety (v2.11.0)
├── config.js                   # All configuration
│
├── news-pipeline/
│   ├── news-monitor.js         # RSS + source fetcher
│   ├── news-scorer.js          # AI relevance scoring + humanizer
│   ├── feeds.json              # Feed configuration
│   └── sources.json            # Source profiles
│
├── knowledge-base/             # Context files for content generation
├── chrome-user-data/           # Saved browser session (not committed)
├── chrome-user-data-hermes/    # Account-specific Chrome profile
└── posted-tweets.json          # Tweet history
```

The pipeline runner and Discord bot live separately (not in this repo):
```
~/tachikoma/hermes/
├── hermes-auto-pipeline.js     # Scheduled pipeline (every 4h)
├── discord-bot.js              # Handles Approve/Reject button interactions
└── storage/
    ├── database.js             # SQLite state
    └── workflows.js            # Workflow run tracking
```

---

## Prerequisites

- macOS (LaunchAgents for scheduling)
- Node.js 18+
- CLIProxyAPI running locally — or substitute with direct API keys (see config below)
- Ollama with `qwen3.5:35b-a3b` pulled (for humanizer)
- Discord bot token (for review workflow)
- Twitter account logged in via Chrome profile

---

## Installation

```bash
git clone https://github.com/lmanchu/twitter-curator.git
cd twitter-curator
npm install
cp .env.example .env
nano .env
```

### Environment Variables

```env
# AI — option A: CLIProxyAPI (recommended)
CLIPROXY_URL=http://127.0.0.1:8317
CLIPROXY_API_KEY=your-proxy-key

# AI — option B: direct Gemini
GEMINI_API_KEY=your_gemini_api_key

# Discord review workflow
DISCORD_BOT_TOKEN=your_discord_bot_token
HERMES_REVIEW_CHANNEL=your_discord_channel_id

# Behavior
HEADLESS=true
DRY_RUN=false
```

### Persona Profile

Point `PERSONA_FILE` in `config.js` to your persona markdown file. This drives all content generation — writing style, interests, topics to engage with.

### Chrome Login

Run once to log in manually:

```bash
HEADLESS=false node twitter-curator.js
```

Session saves to `chrome-user-data/`. Subsequent runs are headless.

---

## Usage

### Scheduled (LaunchAgents)

The system uses two types of LaunchAgents:

**Pipeline** — runs every 4 hours, fetches and scores content:
```
com.lman.hermes-pipeline → tachikoma/hermes/hermes-auto-pipeline.js
```

**Posting agents** — 11 agents spread across daylight hours:
```
com.lman.hermesforx-twitter-00 through -10  → twitter-curator.js
com.lman.twitter-reply-XX                   → reply-only agents
```

Set up with:
```bash
bash create-twitter-launchagents.sh
```

### Manual Posting

Post a single tweet from any account without going through the pipeline:

```bash
# Original tweet
node post-one-tweet.js \
  --profile /absolute/path/to/chrome-user-data-hermes \
  --text "your tweet text"

# Reply to a tweet
node post-one-tweet.js \
  --profile /absolute/path/to/chrome-user-data-hermes \
  --text "your reply" \
  --reply https://x.com/user/status/123456

# Quote tweet
node post-one-tweet.js \
  --profile /absolute/path/to/chrome-user-data-hermes \
  --text "your comment" \
  --quote https://x.com/user/status/123456
```

Note: `--profile` must be an **absolute path**.

### Dry Run

```bash
DRY_RUN=true node twitter-curator.js
```

---

## How the Pipeline Works

```
1. hermes-auto-pipeline.js runs (every 4h via LaunchAgent)
   ├── Fetch from RSS feeds, anime sources, VC blogs
   ├── Score each item: adjustedScore = 0.65×aiScore + 0.35×interestMatch×10
   ├── Jaccard dedup — items >0.4 similarity to recent posts get downranked
   └── Send Discord embed with [Approve] [Reject] buttons to #review channel

2. Human reviews in Discord
   ├── Approve → item enters posting queue
   └── Reject  → archived

3. hermesforx-twitter-XX agents run (hourly)
   ├── Pull next approved item from queue
   ├── Generate tweet via content-generator.js
   ├── Humanize output (Ollama qwen3.5:35b-a3b)
   ├── Run quality-guards.js safety checks
   └── Post via Puppeteer stealth browser
```

---

## Content Generation

`content-generator.js` builds each tweet from:

- **Persona profile** — markdown file with background, writing style, interests
- **Writing style analysis** — derived from 200+ past Medium articles (signature phrases, hooks, voice examples)
- **Knowledge base** — topic-specific context files in `knowledge-base/`
- **Humanizer** — post-processes through local Ollama to remove AI writing signatures (avoidance of "delve", "tapestry", "underscore", "serves as", etc.)

---

## Content Safety (v2.11.0)

`quality-guards.js` runs before every post:

- **Automation exposure check** — flags phrases that reveal the system is automated
- **Bot pattern detection** — catches common AI writing tells
- **Duplicate detection** — prevents posting near-identical content
- **Reply relevance check** — ensures replies are topically relevant before sending

---

## Tracked Accounts

`tracked-accounts.md` lists Twitter accounts to monitor for engagement opportunities:

```markdown
## Twitter Accounts

### ai-researchers
karpathy
sama

### founders
paulg
```

The posting agent finds recent posts from tracked accounts and generates contextual replies.

---

## Troubleshooting

**"Post button not found"**
Twitter UI changes break selectors. Check `twitter-curator.js` for `[data-testid="tweetButtonInline"]` and update if needed.

**Rosetta errors on Apple Silicon**
Ensure Puppeteer v24+: `npm install puppeteer@^24`

**Reply sent but not visible**
Twitter silently spam-filters some automated replies. Verify by checking the reply count on the original tweet — if unchanged, it was filtered. Manual posting via Chrome is the only reliable workaround.

**Pipeline running but nothing gets posted**
Check if posting agents hit platform daily limits. Logs: `~/hermesforx-curator/logs/hermesforx-twitter-XX.log`

**Humanizer timing out**
Ollama can hang on slow hardware. Check `ollama ps` for stuck requests. Restart: `launchctl kickstart -k gui/$(id -u)/com.lman.ollama`

---

## License

MIT

## Disclaimer

Automated posting may violate Twitter's Terms of Service. Use responsibly and at your own risk.

---

*Built by Lman*
