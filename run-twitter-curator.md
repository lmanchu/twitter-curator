# Twitter Curator 執行指南

## 🎯 當前架構（方案 A - 實際可行版本）

```
LaunchAgent (hourly)
    ↓
觸發文件：~/twitter-curator/trigger.txt
    ↓
[用戶看到通知] 或 [Happy CLI 自動觸發]
    ↓
Claude 在對話中執行 Twitter Curator
    ↓
使用 BrowserOS MCP 操作 Twitter
    ↓
記錄到 JSON 文件
```

## 📋 執行步驟（當前手動版本）

### 步驟 1：生成內容
```bash
cd ~/twitter-curator
node twitter-curator-claude.js
```

這會：
- 生成推文內容（使用 Gemini + Persona）
- 顯示需要執行的 BrowserOS MCP 指令

### 步驟 2：Claude 執行 BrowserOS 操作

在 Claude Code 對話中執行：
```javascript
// 1. 切換到 Twitter tab
mcp__browseros__browser_switch_tab(519391672)

// 2. 輸入推文
mcp__browseros__browser_type_text(519391672, 35, "推文內容")

// 3. 點擊 Post 按鈕
mcp__browseros__browser_click_element(519391672, 52)
```

### 步驟 3：保存記錄
```bash
node twitter-curator-claude.js --save-record
```

## 🤖 自動化選項

### 選項 A：透過 Happy CLI（推薦 - 需安裝 Happy）
```bash
# LaunchAgent 執行
happy "請執行 Twitter Curator：讀取 ~/twitter-curator/trigger.txt 並執行"
```

### 選項 B：通知觸發（當前可用）
```bash
# LaunchAgent 創建觸發文件並發送通知
echo "$(date)" > ~/twitter-curator/trigger.txt
osascript -e 'display notification "Twitter Curator 需要執行" with title "Iris Automation"'
```

用戶看到通知後，在 Claude 對話中說："請執行 Twitter Curator"

### 選項 C：完全自動（未來 - 需要 MCP Server 或 Happy integration）
等待 Happy CLI 安裝後，可以實現完全自動化。

## 🔧 配置檔案

### .env
```bash
# Twitter Tab ID（在 BrowserOS 中查看）
TWITTER_TAB_ID=519391672

# Gemini API Key
GEMINI_API_KEY=your_key_here

# Persona 文件
PERSONA_FILE=/Users/lman/Dropbox/PKM-Vault/0-Inbox/Lman-Deep-Persona-Profile.md

# 模式
DRY_RUN=false  # 設為 true 則不實際發文
```

## 📊 查看活動記錄

所有活動會記錄到：
- `~/twitter-curator/posted-tweets.json` - 發文記錄
- `~/twitter-curator/replied-tweets.json` - 回文記錄
- `~/twitter-curator/daily-stats.json` - 每日統計

並會在每天早上 07:00 的 Daily Brief 中顯示摘要。

## 🚀 下一步（完全自動化）

1. **安裝 Happy CLI**
   ```bash
   npm install -g @slopus/happy
   ```

2. **設置 LaunchAgent 使用 Happy**
   - LaunchAgent 每小時調用 Happy
   - Happy 觸發 Claude 執行 Twitter Curator
   - 完全自動，無需手動干預

3. **或者等待 iOS APP**
   - 根據你的 wish list，未來會有 iOS app
   - 可以遠端觸發 Claude 執行任務
