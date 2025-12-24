# Twitter Algorithm Insights

> Analysis of [twitter/the-algorithm](https://github.com/twitter/the-algorithm) and practical optimizations for Twitter Curator.

## Overview

Twitter's recommendation algorithm uses ~6000 features to rank content. Understanding these signals helps optimize our automated engagement strategy.

---

## Key Algorithm Components

### 1. Interaction Graph (Real-Graph)

Twitter predicts user-to-user interaction likelihood using ML.

**Signals Used:**
- **Public engagements:** likes, retweets, follows, replies
- **Private engagements:** profile views, tweet clicks

**Implication for Curator:**
- Consistently replying to the same accounts strengthens the "edge weight"
- Stronger edges = higher visibility in their feed
- Track accounts we've replied to and maintain relationships

### 2. SimClusters (Community Detection)

Twitter groups users into ~145,000 overlapping communities based on follow patterns.

**How it works:**
- Your follows determine which communities you belong to
- Content is recommended to users in matching communities
- "InterestedIn" embeddings = your inferred interests

**Implication for Curator:**
- Follow accounts in target communities (VCs, AI, startups)
- Engage with community leaders to strengthen community signals
- Replies to same-community users have higher visibility

### 3. Heavy Ranker (Neural Network)

Predicts whether users will:
- Click to expand
- Like / Retweet / Reply
- Spend time reading

**Implication for Curator:**
- Write "hooks" that encourage engagement (questions, hot takes)
- Avoid generic replies that don't invite response
- Statements > Agreements

### 4. Feedback Fatigue Penalty

Too much activity from one account triggers fatigue signals.

**Implication for Curator:**
- Rate limit replies to same account (max 2-3 per day per person)
- Spread engagement across diverse authors
- Cooldown periods between bursts

---

## Practical Optimizations

### Anti-Fatigue Strategy

```
Per Account Limits:
- Max 2 replies per account per day
- 4+ hour gap between replies to same person
- Rotate through tracked accounts evenly

Global Limits:
- Max 30 replies per day total
- Spread across 15+ unique authors
- No more than 3 replies per hour
```

### Author Diversity Score

Track diversity of engagement targets:

```javascript
diversityScore = uniqueAuthorsReplied / totalReplies
// Target: > 0.7 (70%+ unique authors)
```

### Engagement Hook Patterns

Replies that invite engagement rank higher:

| Pattern | Example | Why it works |
|---------|---------|--------------|
| Question | "Have you tried X approach?" | Invites response |
| Hot take | "Disagree - here's why..." | Creates discussion |
| Personal exp | "We faced this at IrisGo..." | Adds unique value |
| Build on | "Adding to this - X also matters" | Extends conversation |

**Avoid:**
- "Great point!" (generic, no engagement hook)
- "Agree 100%" (doesn't add value)
- Pure self-promotion (filtered by algorithm)

---

## Implementation Checklist

- [x] Rate limiting per account (config: `ANTI_FATIGUE`)
- [x] Author diversity tracking (daily-stats.json)
- [x] Engagement hook prompts (content-generator.js)
- [ ] SimClusters-aware targeting (future)
- [ ] Interaction history weighting (future)

---

## References

- [twitter/the-algorithm](https://github.com/twitter/the-algorithm)
- [SimClusters README](https://github.com/twitter/the-algorithm/blob/main/src/scala/com/twitter/simclusters_v2/README.md)
- [Interaction Graph](https://github.com/twitter/the-algorithm/blob/main/src/scala/com/twitter/interaction_graph/README.md)
- [Home Mixer](https://github.com/twitter/the-algorithm/tree/main/home-mixer)

---

*Last updated: 2025-12-24*
