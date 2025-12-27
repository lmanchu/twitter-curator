# 🔵 LinkedIn Automation System - Complete Guide

> **Created**: 2025-11-14  
> **Status**: ✅ Ready for Testing  
> **Platform**: macOS (LaunchAgents)  
> **Tech Stack**: Puppeteer + Ollama (gpt-oss:20b)

---

## 📋 系統概覽

完整的 LinkedIn 自動化系統，每天自動發布 3 篇專業貼文並回覆 6 篇相關貼文。

### 核心功能
- ✅ **每天發 3 篇原創貼文**（隨機時間）
- ✅ **每天回覆 6 篇專業貼文**（隨機時間）
- ✅ **Persona 驅動內容生成**（基於 Deep Persona Profile）
- ✅ **本地 AI 模型**（Ollama qwen2.5vl:3b）
- ✅ **瀏覽器自動化**（Puppeteer + Stealth）
- ✅ **智能篩選與去重**
- ✅ **DRY RUN 測試模式**

### 🎯 目標受眾定位
- **主要受眾**: 消費者、知識工作者、白領專業人士
- **產品定位**: IrisGo - Personal AI Assistant for Everyone
- **內容焦點**: 個人生產力、工作生活平衡、消費者AI工具

---

## 📅 每日排程

### 發文時間（3 次）
- **09:30** - 早晨時段（工作開始）
- **14:45** - 下午時段（午休後）
- **18:20** - 傍晚時段（下班前）

### 回覆時間（6 次）
- **10:15** - 早晨活躍時段
- **11:45** - 午休前
- **13:20** - 午休後
- **15:30** - 下午茶時段
- **16:50** - 下班前
- **19:15** - 晚間時段

### 每日配額
- **貼文**: 3 / 日
- **回覆**: 6 / 日
- **總計**: 9 次互動 / 日

---

## 🏗️ 系統架構

```
linkedin-automation/
├── linkedin-config.js              # 配置文件
├── linkedin-content-generator.js   # 內容生成器（Ollama）
├── linkedin-curator.js             # 主腳本
├── setup-linkedin-launchagents-v2.sh  # LaunchAgent 設置腳本
├── test-linkedin-curator.sh        # 測試腳本
├── posted-linkedin.json            # 已發布記錄
├── replied-linkedin.json           # 已回覆記錄
├── daily-linkedin-stats.json       # 每日統計
└── linkedin-curator.log            # 日誌
```

### LaunchAgents
```
~/Library/LaunchAgents/
├── com.lman.linkedin-curator-post-0.plist   (09:30)
├── com.lman.linkedin-curator-post-1.plist   (14:45)
├── com.lman.linkedin-curator-post-2.plist   (18:20)
├── com.lman.linkedin-curator-reply-0.plist  (10:15)
├── com.lman.linkedin-curator-reply-1.plist  (11:45)
├── com.lman.linkedin-curator-reply-2.plist  (13:20)
├── com.lman.linkedin-curator-reply-3.plist  (15:30)
├── com.lman.linkedin-curator-reply-4.plist  (16:50)
└── com.lman.linkedin-curator-reply-5.plist  (19:15)
```

---

## 🚀 使用方式

### 1. 測試系統（DRY RUN）

```bash
cd /Users/lman/twitter-curator

# 測試內容生成
node linkedin-content-generator.js

# 測試發文模式
DRY_RUN=true node linkedin-curator.js --mode post

# 測試回覆模式
DRY_RUN=true node linkedin-curator.js --mode reply

# 完整測試
./test-linkedin-curator.sh
```

### 2. 手動執行

```bash
# 發布一則貼文
node linkedin-curator.js --mode post

# 回覆一則貼文
node linkedin-curator.js --mode reply
```

### 3. 啟用自動化

```bash
# LaunchAgents 已自動載入，無需手動操作

# 檢查狀態
launchctl list | grep linkedin-curator

# 查看即將執行的時間
ls -lh ~/Library/LaunchAgents/com.lman.linkedin-curator-*.plist
```

### 4. 監控系統

```bash
# 即時查看日誌
tail -f linkedin-curator.log

# 查看統計
cat daily-linkedin-stats.json | jq '.'

# 查看已發布貼文
cat posted-linkedin.json | jq '.[] | {timestamp, preview: .text[0:100]}'

# 查看已回覆
cat replied-linkedin.json | jq '.[] | {timestamp, author: .postAuthor, reply: .reply[0:80]}'
```

---

## 🎯 內容策略

### LinkedIn 主題領域（面向消費者與知識工作者）

#### 個人 AI 助理與生產力
- Personal AI Assistants for Everyone
- AI-Powered Personal Productivity
- Managing Information Overload
- Personal Knowledge Management
- Workflow Automation for Individuals
- AI Tools for Daily Life
- Privacy-First Personal AI
- On-Device AI for Consumers

#### 知識工作者痛點
- Future of Knowledge Work
- Remote Work Productivity
- Managing Multiple Projects
- Information Organization Tips
- Fighting Digital Distraction
- Work-Life Balance with AI
- Personal Efficiency Hacks
- Lifelong Learning Strategies

#### 消費者科技趨勢
- AI PC for Regular Users
- Consumer AI Trends
- Local-First Software
- Privacy in Consumer Tech
- Accessible AI Tools
- User-Friendly AI
- AI for Non-Technical People

#### 創業與產品洞察
- Building Products for Everyone
- Consumer vs Enterprise Products
- Lessons from Product Launches
- Understanding User Needs
- Founder Journey Insights
- Product-Led Growth

### 內容風格
- **語氣**: Professional yet conversational
- **長度**: 600-1000 字符（貼文），150-300 字符（回覆）
- **結構**: Hook → Insight → CTA
- **Hashtags**: 3-5 個相關標籤
- **語言**: 100% English
- **焦點**: 分享專業洞察、個人經驗、建設性討論

### 搜尋關鍵詞（面向消費者）
```javascript
[
  'personal ai assistant', 'ai productivity',
  'knowledge worker', 'personal productivity',
  'ai tools', 'consumer ai',
  'work life balance', 'remote work',
  'personal knowledge management', 'ai for everyone'
]
```

---

## ⚙️ 配置選項

### linkedin-config.js

```javascript
// 每日限制
DAILY_LIMITS: {
  max_posts: 3,
  max_replies: 6,
  max_total: 10
}

// 延遲設定（LinkedIn 需要更長延遲）
DELAYS: {
  min: 5000,          // 5 秒
  max: 15000,         // 15 秒
  between_actions: 10000,
  after_post: 30000,
  after_reply: 20000
}

// 測試模式
DRY_RUN: false,      // 設為 true 測試
HEADLESS: true       // 無頭模式
```

---

## 🔍 故障排查

### 問題 1: "Login Required"

**原因**: LinkedIn session 過期

**解決**:
```bash
# 以非無頭模式執行一次，手動登入
HEADLESS=false node linkedin-curator.js --mode post
# 登入後，session 會保存在 chrome-user-data/
```

### 問題 2: "Daily limit reached"

**原因**: 已達每日配額

**解決**:
```bash
# 查看今日統計
cat daily-linkedin-stats.json

# 重置統計（小心使用）
echo '{}' > daily-linkedin-stats.json
```

### 問題 3: Ollama 模型錯誤

**原因**: Ollama 未運行或模型未安裝

**解決**:
```bash
# 檢查 Ollama
curl -s http://localhost:11434/api/tags | jq '.models[].name'

# 安裝模型
ollama pull gpt-oss:20b
```

### 問題 4: Puppeteer 錯誤

**原因**: LinkedIn UI 更新

**解決**:
```bash
# 以非無頭模式查看實際 UI
HEADLESS=false DRY_RUN=true node linkedin-curator.js --mode post

# 如需更新 selectors，編輯 linkedin-config.js 的 SELECTORS 部分
```

---

## 📊 效能與限制

### API 限制
- **LinkedIn**: 無官方限制，但建議保守（9次/日 很安全）
- **Ollama**: 本地運行，無限制
- **成本**: **完全免費** ✅

### 系統要求
- **RAM**: 最少 4GB（瀏覽器自動化）
- **Storage**: 約 200MB（chrome-user-data）
- **Network**: 穩定網路連接
- **Ollama**: gpt-oss:20b 或其他模型

### 執行時間
- **發文**: 平均 30-60 秒
- **回覆**: 平均 20-40 秒
- **內容生成**: 5-15 秒

---

## 🔐 安全性考量

### 數據保護
```bash
# 確保敏感文件權限
chmod 600 posted-linkedin.json
chmod 600 replied-linkedin.json
chmod 700 chrome-user-data/
```

### .gitignore
```
# LinkedIn automation data
posted-linkedin.json
replied-linkedin.json
daily-linkedin-stats.json
linkedin-curator.log
linkedin-curator.error.log
chrome-user-data/
.env
```

### 避免封號
- ✅ 使用真實 User-Agent
- ✅ 隨機延遲（5-15秒）
- ✅ 保守配額（9次/日）
- ✅ Stealth Plugin（反偵測）
- ✅ 持久化 Session（chrome-user-data）

---

## 📈 進階功能

### 自訂主題

編輯 `linkedin-config.js`:

```javascript
TOPICS: [
  // 添加你的主題
  'Your Custom Topic',
  '...'
]
```

### 自訂搜尋關鍵詞

```javascript
SEARCH_KEYWORDS: [
  // 添加你想搜尋的關鍵詞
  'your keyword',
  '...'
]
```

### 調整排程

編輯 `setup-linkedin-launchagents-v2.sh` 中的時間：

```bash
POST_TIMES=(
  "YOUR:TIME"
  "..."
)
```

然後重新執行：
```bash
./setup-linkedin-launchagents-v2.sh
```

---

## ✅ 測試清單

在啟用自動化前，完成以下測試：

- [ ] Ollama 運行中 (`curl http://localhost:11434/api/tags`)
- [ ] 模型已安裝 (`ollama list | grep gpt-oss`)
- [ ] Persona 文件存在 (`cat ~/Dropbox/PKM-Vault/0-Inbox/Lman-Deep-Persona-Profile.md`)
- [ ] 內容生成測試 (`node linkedin-content-generator.js`)
- [ ] POST 模式測試 (`DRY_RUN=true node linkedin-curator.js --mode post`)
- [ ] REPLY 模式測試 (`DRY_RUN=true node linkedin-curator.js --mode reply`)
- [ ] LinkedIn 登入正常 (`HEADLESS=false node linkedin-curator.js --mode post`)
- [ ] LaunchAgents 已載入 (`launchctl list | grep linkedin-curator`)

---

## 🎓 與 Twitter Curator 比較

| Feature | Twitter | LinkedIn |
|---------|---------|----------|
| **頻率** | 1 post + 2 replies / 2小時 | 3 posts + 6 replies / 日 |
| **總量** | ~40 次 / 日 | 9 次 / 日 |
| **內容長度** | 280 字符 | 600-1000 字符 |
| **風格** | Casual, conversational | Professional, insightful |
| **Hashtags** | 不使用 | 3-5 個 |
| **延遲** | 3-10 秒 | 5-15 秒 |
| **平台特性** | 快速互動 | 深度討論 |

---

## 📝 總結

你現在擁有一個完整的 LinkedIn 自動化系統：

- ✅ **自動發文** - 每天 3 篇專業貼文
- ✅ **自動回覆** - 每天 6 次建設性互動
- ✅ **AI 驅動** - Persona 導向內容生成
- ✅ **完全免費** - 本地 Ollama 模型
- ✅ **安全可靠** - 保守配額 + 反偵測
- ✅ **易於監控** - 完整日誌與統計

**下次執行時**：
```bash
cd /Users/lman/twitter-curator
node linkedin-curator.js --mode post
```

**開始自動化**：
```bash
# LaunchAgents 已自動載入！
# 系統將在設定的時間自動執行
# 監控: tail -f linkedin-curator.log
```

就這麼簡單！🎉

---

**系統管理者**: Iris (Melchior)  
**創建日期**: 2025-11-14  
**狀態**: ✅ Production Ready  
**文檔版本**: v1.0.0
