# 🐦 Twitter Curator - BrowserOS 版本

## ✅ 測試結果

**成功！** 已驗證可以透過 BrowserOS MCP 操作 Twitter：
- ✅ 切換 tab
- ✅ 輸入推文內容
- ✅ 清空輸入框
- ✅ Gemini AI 內容生成（基於 Persona）

## 📋 完整執行流程

### 方式 1：手動執行（當前可用）

每次想要發推文時，在 Claude Code 對話中說：

```
請執行 Twitter Curator 發一則推文
```

我會：
1. 讀取你的 Persona
2. 使用 Gemini 生成推文內容
3. 透過 BrowserOS 輸入到 Twitter
4. 點擊 Post 按鈕發布
5. 記錄到 `posted-tweets.json`

### 方式 2：定時提醒（推薦）

**設置 LaunchAgent 提醒你**：

創建 `~/Library/LaunchAgents/com.lman.twitter-curator-reminder.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lman.twitter-curator-reminder</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/osascript</string>
        <string>-e</string>
        <string>display notification "Twitter Curator 需要執行 - 請在 Claude 對話中說：'請執行 Twitter Curator'" with title "Iris Automation" sound name "Glass"</string>
    </array>

    <!-- 每天 23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00 -->
    <key>StartCalendarInterval</key>
    <array>
        <dict><key>Hour</key><integer>23</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>0</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>1</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>5</integer><key>Minute</key><integer>0</integer></dict>
        <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
    </array>
</dict>
</plist>
```

載入：
```bash
launchctl load ~/Library/LaunchAgents/com.lman.twitter-curator-reminder.plist
```

每小時你會收到 macOS 通知，提醒你在 Claude 對話中執行 Twitter Curator。

### 方式 3：完全自動化（需要 Happy CLI）

安裝 Happy 後：
```bash
npm install -g happy
```

創建 LaunchAgent 直接調用 Happy 觸發 Claude：
```xml
<key>ProgramArguments</key>
<array>
    <string>/usr/local/bin/happy</string>
    <string>請執行 Twitter Curator 發一則推文</string>
</array>
```

## 🎯 我如何執行 Twitter Curator

當你在對話中說「請執行 Twitter Curator」，我會：

### 步驟 1：生成內容
```javascript
const persona = loadPersona();
const topic = selectRandomTopic(config.TOPICS);
const tweetText = await generateOriginalTweet(persona, topic, GEMINI_API_KEY);
```

### 步驟 2：使用 BrowserOS 發布
```javascript
// 切換到 Twitter tab
mcp__browseros__browser_switch_tab(519391672)

// 輸入推文
mcp__browseros__browser_type_text(519391672, 35, tweetText)

// 點擊 Post 按鈕
mcp__browseros__browser_click_element(519391672, 52)
```

### 步驟 3：記錄活動
```javascript
{
  "text": "推文內容...",
  "timestamp": "2025-11-09T01:00:00.000Z",
  "url": null
}
```

## 📊 查看活動記錄

### 方式 1：Daily Brief（每天 07:00）
打開：`~/Dropbox/PKM-Vault/0-Inbox/YYYY-MM-DD-Daily-Brief.md`

會看到：
```markdown
## 📱 Your Social Media Activity (Last 24h)

**📊 Activity Summary:**
- Twitter: 8 posts + 0 replies = 8 total

### 🐦 Twitter Posts (8)
1. [23:05] "Building IrisGo, I'm reminded of..."
   - 🔗 [View on Twitter →](https://x.com/...)
```

### 方式 2：查看 JSON
```bash
cat ~/twitter-curator/posted-tweets.json | jq
cat ~/twitter-curator/daily-stats.json | jq
```

## ⚙️ 配置

### 環境變數（.env）
```bash
# Twitter Tab ID（在 BrowserOS 中查看）
TWITTER_TAB_ID=519391672

# Gemini API Key
GEMINI_API_KEY=your_key_here

# Persona 文件
PERSONA_FILE=/Users/lman/Dropbox/PKM-Vault/0-Inbox/Lman-Deep-Persona-Profile.md

# 測試模式
DRY_RUN=false  # true = 不實際發文
```

### 主題配置（config.js）
```javascript
TOPICS: [
  'AI/LLM Applications',
  'On-Premise AI',
  'Privacy-First Technology',
  'IrisGo.AI',
  'Building in Bear Markets'
  // ... 可自行修改
]
```

### 發文頻率
```javascript
POSTS_PER_HOUR: 1,       // 每小時發文數
REPLIES_PER_HOUR: 2,     // 每小時回文數

DAILY_LIMITS: {
  max_posts: 10,         // 每日最多發文
  max_replies: 20,       // 每日最多回文
}
```

## 🛡️ 安全機制

1. **每日限制**：自動追蹤每日發文數，達到上限後停止
2. **活動時段**：只在 23:00-07:00 運行
3. **DRY_RUN 模式**：測試時不實際發文
4. **Persona 驅動**：所有內容符合你的風格
5. **語言過濾**：只發英文內容

## 🔄 回覆推文功能（規劃中）

未來會支援：
1. 讀取 Twitter feed
2. 篩選值得回覆的推文
3. 生成符合 Persona 的回覆
4. 自動發送回覆

## 📱 未來：iOS APP

根據你的 wish list，未來會有 iOS app：
- 遠端監控 Claude 運作
- 手機上控制自動化任務
- 推送通知（任務完成、錯誤警告）
- 隨時隨地觸發 Twitter Curator

## 🆘 故障排除

### BrowserOS Chrome 需要保持開啟
確保：
- ✅ BrowserOS Extension 運行中
- ✅ Twitter tab 已開啟且登入
- ✅ Tab ID 正確（可能會變動）

### 查看 Tab ID
在 Claude 對話中：
```
mcp__browseros__browser_list_tabs
```

找到 Twitter tab，記錄 ID，更新 `.env`。

### Gemini API 錯誤
檢查：
```bash
grep GEMINI_API_KEY ~/.env
```

確保 API key 正確且有效。

## 📈 效果追蹤

系統會自動記錄：
- ✅ 每則推文的內容和時間
- ✅ 每日發文統計
- ✅ 整合到 Daily Brief

你可以：
- 查看每日摘要
- 分析哪些主題效果好
- 調整 Persona 和配置

---

**🎉 恭喜！Twitter Curator (BrowserOS 版本) 已經準備就緒！**

**下次要發推文時，只需在 Claude 對話中說：**
> "請執行 Twitter Curator 發一則推文"

我會幫你完成所有步驟！🤖
