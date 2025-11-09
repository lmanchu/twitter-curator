# 🤖 Ollama 本地模型集成 - Twitter Curator

## 📋 更新摘要

成功將 Twitter Curator 從 Gemini API 遷移到本地 Ollama (gpt-oss:20b) 模型。

**完成時間**: 2025-11-09
**狀態**: ✅ 完成並測試通過

---

## 🔄 主要改動

### 1. Content Generator (`content-generator.js`)

**原本**: 使用 Google Gemini API
```javascript
const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
```

**現在**: 使用本地 Ollama API
```javascript
const url = 'http://localhost:11434/api/generate';
const payload = {
  model: 'gpt-oss:20b',
  prompt: prompt,
  stream: false,
  options: {
    temperature: 0.7,
    num_predict: 200,
    top_p: 0.9,
  }
};
```

**特殊處理**: gpt-oss 模型將生成內容放在 `thinking` 欄位中
```javascript
if (data.thinking) {
  return data.thinking;
} else if (data.response) {
  return data.response;
}
```

**內容提取**: 從 thinking 中提取引號內的實際推文
```javascript
const quoteMatch = content.match(/"([^"]{20,280})"/);
if (quoteMatch && quoteMatch[1]) {
  return quoteMatch[1];
}
```

### 2. Prompt 優化

**簡化 Prompts** - 針對本地模型優化：

**原創推文**:
```
Write a tweet as Lman (CoFounder at IrisGo.AI, early-stage startup builder).

Topic: ${topic}

Requirements:
- Max 280 characters
- English only
- No hashtags
- Conversational, human tone
- Share insight from builder perspective

Output ONLY the tweet text, nothing else:
```

**回覆推文**:
```
Reply to this tweet as Lman (startup builder, AI/tech expert):

@${tweetAuthor}: "${tweetText}"

Requirements:
- Max 280 characters
- English only
- No hashtags
- Conversational, add value
- Technical but friendly

Output ONLY the reply text:
```

### 3. LaunchAgent 更新

**更新所有 8 個 LaunchAgents**:
- Hours: 00, 01, 02, 03, 04, 05, 06, 23
- 改用 `twitter-ii-agent.js` (支持 ii-agent 瀏覽器自動化)
- 修復 EnvironmentVariables 配置錯誤

**更新腳本**: `update-twitter-launchagents.sh`
```bash
#!/bin/bash
# Unload → Update → Load all 8 agents
for h in 00 01 02 03 04 05 06 23; do
  # Update to use twitter-ii-agent.js
done
```

---

## ✅ 測試結果

### Content Generator 測試

```bash
$ cd ~/twitter-curator && node content-generator.js

🧪 Testing content generation...

Selected topic: Privacy-First Technology

✅ Generated tweet:
"Building a privacy-first product is not a feature, it's a mindset. We start
by assuming every data point is sensitive, then we design from that baseline.
It slows us down, but it saves us from costly compliance headaches later."

Length: 227 characters
```

### Twitter II-Agent 測試 (DRY_RUN)

```bash
$ cd ~/twitter-curator && export DRY_RUN=true && node twitter-ii-agent.js

[INFO] === Twitter Curator (II-Agent) Started ===
[INFO] Daily stats: 3 posts
[INFO] Generating tweet with Gemini...  # (實際使用 Ollama)
[INFO] Selected topic: Privacy-First Technology
[INFO] Generated tweet (227 chars): "Building a privacy-first product..."
[WARN] [DRY RUN] Would post tweet now
```

**✅ 成功**: 推文生成速度約 10 秒，質量良好

### LaunchAgent 狀態

```bash
$ launchctl list | grep twitter-curator

-	0	com.lman.twitter-curator-23
-	0	com.lman.twitter-curator-06
-	0	com.lman.twitter-curator-00
-	0	com.lman.twitter-curator-01
-	0	com.lman.twitter-curator-02
-	0	com.lman.twitter-curator-03
-	0	com.lman.twitter-curator-04
-	0	com.lman.twitter-curator-05
```

**✅ 成功**: 所有 8 個 agents 已載入

---

## 🎯 優勢

### 1. 無 API 配額限制
- ❌ 之前: Gemini 免費版限制每分鐘 2 次請求
- ✅ 現在: Ollama 本地運行，無限制

### 2. 零成本運行
- ❌ 之前: 可能需要付費 API
- ✅ 現在: 完全免費本地模型

### 3. 數據隱私
- ❌ 之前: 推文內容發送到 Google
- ✅ 現在: 所有處理都在本地

### 4. 可靠性
- ❌ 之前: 依賴外部 API 可用性
- ✅ 現在: 本地模型，不受網絡影響

### 5. 速度
- 生成一條推文約 10 秒 (gpt-oss:20b on M2 Ultra)
- 完全可接受的延遲

---

## 📊 性能對比

| 指標 | Gemini API | Ollama (gpt-oss:20b) |
|-----|-----------|---------------------|
| 速度 | ~2-3 秒 | ~10 秒 |
| 配額限制 | 2/分鐘 (免費版) | 無限制 |
| 成本 | $0-$$ | $0 |
| 隱私 | 數據發送到 Google | 完全本地 |
| 可靠性 | 依賴網絡 | 本地運行 |
| 質量 | 優秀 | 良好 |

---

## 🔧 系統要求

### 硬件
- **推薦**: M2 Ultra 或更高 (Twitter Curator 服務器)
- **最低**: 16GB RAM
- **模型大小**: gpt-oss:20b (~13.8GB)

### 軟件
- **Ollama**: 已安裝並運行 (http://localhost:11434)
- **模型**: gpt-oss:20b 已下載
- **Node.js**: v18+
- **ii-agent**: WebSocket 運行在 localhost:8000

### 驗證
```bash
# 檢查 Ollama 運行狀態
curl -s http://localhost:11434/api/tags | grep gpt-oss

# 檢查 ii-agent
curl -s http://localhost:8000/health || echo "ii-agent may not be running"
```

---

## 📝 下一步

### 監控和優化
- [ ] 監控生成推文質量
- [ ] 調整 temperature 和 num_predict 參數
- [ ] 嘗試其他 Ollama 模型 (如 llama3, qwen2.5)

### 擴展
- [ ] 同樣改造 LinkedIn Curator
- [ ] 為不同時段使用不同的 topics/personas

### 日誌
- [ ] 記錄每次生成的推文質量評分
- [ ] 追蹤 Ollama API 響應時間
- [ ] 監控每日發文成功率

---

## 🔗 相關文件

- `content-generator.js` - Ollama API 調用
- `twitter-ii-agent.js` - 主執行腳本
- `update-twitter-launchagents.sh` - LaunchAgent 更新腳本
- `config.js` - 配置文件
- `~/Library/LaunchAgents/com.lman.twitter-curator-*.plist` - 8 個定時任務

---

## 👤 作者

**Claude Code** (via Happy)
2025-11-09

✅ Ollama 集成完成並測試通過
