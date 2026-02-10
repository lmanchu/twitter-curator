# News Intelligence Pipeline

AI-powered news curation system with human-in-the-loop approval.

## Architecture

```
RSS Feeds → AI Scorer (Gemini) → Review Queue → Human Approval → Publish
                                      ↓
                              PKM Inbox (Obsidian)
```

## Components

| File | Purpose |
|------|---------|
| `feeds.json` | RSS feed configuration & keywords |
| `news-monitor.js` | Fetches and filters news |
| `news-scorer.js` | AI scoring with Gemini |
| `content-router.js` | Routes to queue or archive |
| `run-pipeline.js` | Main orchestrator |

## Usage

```bash
# Run complete pipeline
node run-pipeline.js

# Run individual steps
node run-pipeline.js --fetch   # Only fetch
node run-pipeline.js --score   # Only score
node run-pipeline.js --route   # Only route
node run-pipeline.js --check   # Check approved articles
```

## Schedule

LaunchAgent: `com.lman.news-pipeline`

| Time | Action |
|------|--------|
| 08:00 | Morning run |
| 12:00 | Midday run |
| 18:00 | Evening run |

## Review Queue

Location: `~/Dropbox/PKM-Vault/0-Inbox/content-queue/`

### Workflow

1. Open queue files in Obsidian
2. Review AI-generated draft
3. Edit "Your Edit" section if needed
4. Change `status: pending` to `status: approved`
5. Publisher will pick up approved articles

### File Format

```markdown
---
title: "Article Title"
score: 8
status: pending  # pending | approved | rejected
---

## Draft Tweet
[AI generated draft]

## Your Edit
[Your modifications here]
```

## Logs

- Pipeline: `~/.logs/news-pipeline.log`
- Cache: `./seen-articles.json`
- Archive: `./archive/`

## Manual Commands

```bash
# Manually trigger pipeline
launchctl start com.lman.news-pipeline

# Check status
launchctl list | grep news-pipeline

# View logs
tail -f ~/.logs/news-pipeline.log
```
