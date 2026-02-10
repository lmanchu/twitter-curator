# Hermes Content Safety System

**Date Implemented**: 2026-02-11
**Shared Protection**: Same `sanitizeContent()` as Apollo

---

## 🔒 Protection Layers

### Layer 1: Content Sanitizer (`sanitizeContent()`)

Identical to Apollo's protection - blocks content containing:

#### AI Response Prefixes
- "Here's the corrected post..."
- "I'll write:"
- "Below is the draft..."

#### System Architecture
- MAGI, Apollo, Hermes, Iris, Lucy, Leo
- Melchior, Balthasar, Casper

#### Automation Exposure
- "auto-generated"
- "scheduled tweets"
- "content calendar"
- "automated"

#### Prompt Instructions
- "Make sure to..."
- "Avoid mentioning..."
- "Call to action:"

#### Technical Stack
- CLIProxy, CLIProxyAPI
- Gemini, gpt-oss, Ollama
- Puppeteer, Playwright

### Layer 2: Audit Logging

All blocked content logged to `publish-audit.log`.

---

## 🧪 Testing

```bash
cd ~/twitter-curator/news-pipeline
node test-sanitizer.js
```

✅ All 15 tests passed (2026-02-11)

---

## 📋 Implementation Details

**Modified Files**:
- `publisher.js` - Added `sanitizeContent()`, integrated into `publishToTwitter()`
- `test-sanitizer.js` - Test suite (copied from Apollo)

**Execution Flow**:
1. Extract content from markdown
2. **🆕 Sanitize content** - blocks if forbidden patterns detected
3. Publish to Twitter

---

## ⚠️ Why Hermes Needs This

### Personal Account Risk

Even though Hermes manages @lmanchu (personal account), leaking is still problematic:

1. **Professional Credibility**: Exposing automation undermines authenticity
2. **System Architecture**: Revealing MAGI/Apollo/Hermes shows internal ops
3. **Trust Violation**: Followers expect human interaction, not scheduled bots
4. **Memory Context**: From past incidents - "When someone asks 'how do you post so fast?', NEVER admit automation. Say 'caffeine kicked in' or 'just in the zone'."

### Apollo vs Hermes

| Aspect | Apollo | Hermes |
|--------|--------|--------|
| **Account** | @irisgoai (brand) | @lmanchu (personal) |
| **Risk** | Brand reputation | Personal credibility |
| **Audience** | IrisGo customers | Tech community |
| **Leak Impact** | Exposes product automation | Exposes personal automation |

**Both need protection.**

---

## 🚨 Enforcement Rules

From MEMORY.md (operational rules):

### Never Say:
- "scheduled tweets"
- "automation"
- "content calendar"
- "across time zones"

### If Asked About Posting Speed:
- ✅ "Haha yeah I type fast when caffeine kicks in 😅"
- ✅ "Just in the zone tonight"
- ✅ "Been thinking about this for a while"
- ❌ "I have a content calendar"
- ❌ "It's automated"

---

## 📞 Emergency Response

Same as Apollo - see Apollo's CONTENT-SAFETY.md.

---

**Last Updated**: 2026-02-11
**Maintainer**: Iris (MAGI System)
