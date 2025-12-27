# 🚀 Twitter/LinkedIn Curator - 快速開始

## ✅ 已完成設置

你的社交媒體自動化系統已經設置完成！

### 📅 自動排程

**Twitter** (每天 8 次):
- 23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00

**LinkedIn** (每天 4 次):
- 09:00, 13:00, 17:00, 21:00

### 🔄 運作方式

```
LaunchAgent (定時) 
    ↓
Happy CLI 觸發
    ↓
Claude 執行 /twitter-curator 或 /linkedin-curator
    ↓
生成高品質內容 (Gemini + Persona)
    ↓
【你需要】複製內容並在瀏覽器中貼上發布
    ↓
告訴 Claude "已發布"
    ↓
自動記錄到 JSON 和 Daily Brief
```

## 📝 使用方法

### 方法 1：等待自動觸發

LaunchAgent 會在設定的時間自動：
1. 打開 Happy CLI
2. Happy 觸發 Claude
3. Claude 顯示生成的推文/貼文
4. **你複製並發布**
5. 告訴 Claude "已發布"

### 方法 2：手動執行

在 Claude Code 對話中輸入：

```
/twitter-curator
```

或

```
/linkedin-curator
```

## 🎯 今天生成的測試內容

**Twitter 推文範例**:
> "Building IrisGo, our on-premise AI, feels a bit like the early days of the internet - bringing powerful tools directly to the user, securely. What are the killer apps we haven't even imagined yet?"

**特點**:
- ✅ 符合你的 Persona (builder perspective + historical analogy)
- ✅ 英文內容
- ✅ 無 hashtags
- ✅ 提出思考問題

## 📊 查看活動記錄

### 每日摘要（推薦）
每天早上 07:00 的 Daily Brief 會自動包含昨天的社交媒體活動摘要。

### 手動查看
```bash
# 查看已發推文
cat ~/twitter-curator/posted-tweets.json | jq

# 查看每日統計
cat ~/twitter-curator/daily-stats.json | jq

# 查看 LinkedIn 活動
cat ~/twitter-curator/linkedin-posted.json | jq
```

## ⚙️ 必要條件

為了讓自動化正常運作，請確保：

1. ✅ **BrowserOS Chrome Extension 運行中**
2. ✅ **Twitter tab 保持開啟並登入** (https://x.com/home)
3. ✅ **LinkedIn tab 保持開啟並登入** (https://linkedin.com/feed)
4. ✅ **Happy CLI 可用** (`/usr/local/bin/happy`)

## 🔍 檢查系統狀態

```bash
# 查看 LaunchAgents 狀態
launchctl list | grep com.lman | grep curator

# 應該看到 12 個 (8 Twitter + 4 LinkedIn)，狀態碼都是 0
```

## ⚠️ 限制說明

**為何需要手動貼上？**

Twitter 使用 React-based 的編輯框，無法透過 BrowserOS 直接輸入文字。已嘗試多種方法但都被 React 狀態管理攔截。

**未來改進方向**:
- Twitter API (如果可用)
- 專用 Chrome Extension
- Playwright/Puppeteer (需解決 Rosetta 問題)

## 📈 每日限制

系統自動追蹤並遵守以下限制：

**Twitter**:
- 最多 10 posts/天
- 最多 20 replies/天

**LinkedIn**:
- 最多 4 posts/天
- 最多 4 comments/天

達到限制後會自動停止。

## 🎉 總結

雖然不是 100% 全自動（因為 BrowserOS 限制），但系統已經可以：

✅ 自動生成高品質內容（基於你的 Persona）  
✅ 按照排程提醒你發文  
✅ 自動記錄所有活動  
✅ 整合到 Daily Brief  
✅ 遵守每日限制  

你只需要：
1. 保持 BrowserOS Chrome 開啟
2. 在收到通知時，複製 Claude 生成的內容並發布
3. 告訴 Claude "已發布"

---

**下一次執行**: 今晚 23:00
**文檔**: `~/twitter-curator/AUTOMATION-STATUS.md`
**日誌**: `~/twitter-curator/logs/`
