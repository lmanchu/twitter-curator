# Twitter Automation 完整時程表

> Updated: 2025-11-16

---

## 📋 總覽

### 功能分離
- **Post（發文）**: `twitter-curator.js` - 夜間發布原創內容
- **Reply（回文）**: `twitter-reply-only.js` - 白天回覆相關推文

---

## 🌙 夜間發文時段（Post）

### 時間
- **23:00 - 07:00**（隔天）
- 每 **2 小時** 執行一次
- 每次發布 **1 則**原創推文

### 執行時間點
```
23:00 (com.lman.twitter-curator-23) - 晚上 11 點
01:00 (com.lman.twitter-curator-01) - 凌晨 1 點
03:00 (com.lman.twitter-curator-03) - 凌晨 3 點
05:00 (com.lman.twitter-curator-05) - 凌晨 5 點
```

### 每日總計
- **4 則** 原創推文（8 小時 / 2 小時間隔）

### 腳本
- `/Users/lman/twitter-curator/twitter-curator.js`

### LaunchAgents
- `~/Library/LaunchAgents/com.lman.twitter-curator-23.plist`
- `~/Library/LaunchAgents/com.lman.twitter-curator-01.plist`
- `~/Library/LaunchAgents/com.lman.twitter-curator-03.plist`
- `~/Library/LaunchAgents/com.lman.twitter-curator-05.plist`

---

## ☀️ 白天回文時段（Reply）

### 時間
- **07:00 - 22:00**
- **每小時** 執行一次
- 每次回覆 **至少 1 則**相關推文

### 執行時間點
```
07:00, 08:00, 09:00, 10:00, 11:00, 12:00, 13:00, 14:00,
15:00, 16:00, 17:00, 18:00, 19:00, 20:00, 21:00, 22:00
```

### 每日總計
- **16 則** 回覆（16 小時 x 1 則/小時）

### 腳本
- `/Users/lman/twitter-curator/twitter-reply-only.js`

### LaunchAgents
- `~/Library/LaunchAgents/com.lman.twitter-reply-07.plist`
- `~/Library/LaunchAgents/com.lman.twitter-reply-08.plist`
- ... (共 16 個，07-22)
- `~/Library/LaunchAgents/com.lman.twitter-reply-22.plist`

---

## 📊 每日統計

### 理論上限
- **Post**: 4 則原創推文
- **Reply**: 16 則回覆
- **Total**: 20 則互動

### 實際限制（config.js + twitter-reply-only.js）
```javascript
// Post 限制
DAILY_LIMITS.max_posts: 10

// Reply 限制（twitter-reply-only.js）
MAX_DAILY_REPLIES: 20

// 總限制
DAILY_LIMITS.max_total: 50
```

---

## 🎯 內容策略

### Post（原創推文）
- **來源**: Persona-driven AI 生成
- **主題**: 30+ 主題（AI/Tech, Startup, Web3, IrisGo, etc.）
- **風格**: Conversational, 中等技術深度, 使用歷史類比
- **語言**: 純英文
- **長度**: 50-280 字符，理想 180

### Reply（回覆推文）
- **搜尋關鍵詞**: ai, llm, claude, gpt, startup, product, web3, privacy, etc.
- **篩選條件**:
  - ❌ 已回覆過
  - ❌ 包含中文
  - ❌ 垃圾關鍵詞（crypto price, pump, follow back, giveaway）
  - ✅ 英文推文
  - ✅ 相關領域話題
- **回覆風格**: 個性化，根據原推文內容和作者生成

---

## 🚀 設定步驟

### 1. 安裝 Reply LaunchAgents（新）
```bash
cd ~/twitter-curator
./setup-reply-launchagents.sh
```

### 2. 檢查現有 Post LaunchAgents
```bash
launchctl list | grep twitter-curator
```

應該看到：
- `com.lman.twitter-curator-23`
- `com.lman.twitter-curator-01`
- `com.lman.twitter-curator-03`
- `com.lman.twitter-curator-05`

### 3. 檢查 Reply LaunchAgents（新）
```bash
launchctl list | grep twitter-reply
```

應該看到 16 個（07-22）：
- `com.lman.twitter-reply-07`
- `com.lman.twitter-reply-08`
- ...
- `com.lman.twitter-reply-22`

---

## 🧪 測試

### 測試 Reply 功能（DRY RUN）
```bash
cd ~/twitter-curator
DRY_RUN=true HEADLESS=false node twitter-reply-only.js
```

### 測試 Post 功能（DRY RUN）
```bash
cd ~/twitter-curator
DRY_RUN=true HEADLESS=false node twitter-curator.js
```

---

## 📁 重要文件

### 數據文件
```
~/twitter-curator/
├── posted-tweets.json       # 已發布的推文記錄
├── replied-tweets.json      # 已回覆的推文記錄
├── daily-stats.json         # 每日統計
├── twitter-curator.log      # 主日誌
├── twitter-curator.error.log # 錯誤日誌
└── logs/                    # LaunchAgent 個別日誌
    ├── twitter-reply-07.log
    ├── twitter-reply-08.log
    └── ...
```

### 配置文件
```
~/twitter-curator/
├── config.js                # 主配置
├── content-generator.js     # AI 內容生成
├── twitter-curator.js       # Post 腳本
└── twitter-reply-only.js    # Reply 腳本（新）
```

---

## 🛡️ 安全機制

### 防止重複
- ✅ 已回覆推文記錄（replied-tweets.json）
- ✅ 每日統計檢查（daily-stats.json）

### 速率限制
- ✅ 隨機延遲（3-10 秒）
- ✅ 動作間延遲（5+ 秒）
- ✅ 每日上限檢查

### 反偵測
- ✅ Puppeteer Stealth Plugin
- ✅ 真實 User-Agent
- ✅ Chrome User Data 持久化
- ✅ 隨機延遲模擬人類行為

---

## 📈 監控與維護

### 查看今日統計
```bash
cat ~/twitter-curator/daily-stats.json | grep $(date +%Y-%m-%d)
```

### 查看最近日誌
```bash
tail -50 ~/twitter-curator/twitter-curator.log
```

### 查看 Reply 日誌（某個小時）
```bash
tail -30 ~/twitter-curator/logs/twitter-reply-10.log
```

### 重啟所有 LaunchAgents
```bash
# Unload all
launchctl list | grep twitter-curator | awk '{print $3}' | xargs -I {} launchctl unload ~/Library/LaunchAgents/{}.plist
launchctl list | grep twitter-reply | awk '{print $3}' | xargs -I {} launchctl unload ~/Library/LaunchAgents/{}.plist

# Load all
for file in ~/Library/LaunchAgents/com.lman.twitter-*.plist; do
    launchctl load "$file"
done
```

---

## 🎯 優化建議

### 如果想增加回文頻率
修改 `twitter-reply-only.js` 中的：
```javascript
// 每次回覆數量
const tweetsToReply = worthReplyingTo.slice(0, 1);  // 改成 2 或 3
```

### 如果想調整時段
修改 `setup-reply-launchagents.sh` 中的：
```bash
for hour in {07..22}; do  # 修改開始和結束時間
```

---

**最後更新**: 2025-11-16
**維護者**: Lman
