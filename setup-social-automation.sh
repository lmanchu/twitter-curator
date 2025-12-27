#!/bin/bash

# 設置完整的社交媒體自動化（使用 Happy CLI + BrowserOS）
#
# Twitter: 每小時執行（23:00-06:00）共 8 次
# LinkedIn: 每天 4 次（09:00, 13:00, 17:00, 21:00）

echo "🚀 設置社交媒體自動化..."
echo ""

# 檢查 Happy CLI 是否安裝
if ! command -v happy &> /dev/null; then
  echo "❌ Happy CLI not found at /usr/local/bin/happy"
  echo "請先安裝 Happy CLI"
  exit 1
fi

echo "✅ Happy CLI found: $(which happy)"
echo ""

# ============================================
# Part 1: Twitter Automation (8 LaunchAgents)
# ============================================

echo "📱 設置 Twitter 自動化..."

TWITTER_HOURS=(23 00 01 02 03 04 05 06)

for hour in "${TWITTER_HOURS[@]}"; do
  PLIST_FILE="$HOME/Library/LaunchAgents/com.lman.twitter-curator-${hour}.plist"

  cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lman.twitter-curator-${hour}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/happy</string>
        <string>/twitter-curator</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${hour#0}</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>$HOME/twitter-curator/logs/twitter-${hour}.log</string>

    <key>StandardErrorPath</key>
    <string>$HOME/twitter-curator/logs/twitter-${hour}.error.log</string>

    <key>RunAtLoad</key>
    <false/>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
</dict>
</plist>
EOF

  echo "  ✅ Created: com.lman.twitter-curator-${hour}.plist"
done

# ============================================
# Part 2: LinkedIn Automation (4 LaunchAgents)
# ============================================

echo ""
echo "💼 設置 LinkedIn 自動化..."

# LinkedIn 排程：09:00, 13:00, 17:00, 21:00（工作時段）
LINKEDIN_HOURS=(09 13 17 21)

for hour in "${LINKEDIN_HOURS[@]}"; do
  PLIST_FILE="$HOME/Library/LaunchAgents/com.lman.linkedin-curator-${hour}.plist"

  cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lman.linkedin-curator-${hour}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/happy</string>
        <string>/linkedin-curator</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${hour#0}</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>$HOME/twitter-curator/logs/linkedin-${hour}.log</string>

    <key>StandardErrorPath</key>
    <string>$HOME/twitter-curator/logs/linkedin-${hour}.error.log</string>

    <key>RunAtLoad</key>
    <false/>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
</dict>
</plist>
EOF

  echo "  ✅ Created: com.lman.linkedin-curator-${hour}.plist"
done

# ============================================
# Part 3: 創建 logs 目錄
# ============================================

mkdir -p "$HOME/twitter-curator/logs"
echo ""
echo "✅ Created logs directory"

# ============================================
# Part 4: 載入所有 LaunchAgents
# ============================================

echo ""
echo "📋 載入所有 LaunchAgents..."
echo ""

# Unload existing ones first (in case they exist)
for hour in "${TWITTER_HOURS[@]}"; do
  launchctl unload "$HOME/Library/LaunchAgents/com.lman.twitter-curator-${hour}.plist" 2>/dev/null
done

for hour in "${LINKEDIN_HOURS[@]}"; do
  launchctl unload "$HOME/Library/LaunchAgents/com.lman.linkedin-curator-${hour}.plist" 2>/dev/null
done

echo "Twitter LaunchAgents:"
for hour in "${TWITTER_HOURS[@]}"; do
  launchctl load "$HOME/Library/LaunchAgents/com.lman.twitter-curator-${hour}.plist"
  echo "  ✅ Loaded: com.lman.twitter-curator-${hour} (runs at ${hour}:00)"
done

echo ""
echo "LinkedIn LaunchAgents:"
for hour in "${LINKEDIN_HOURS[@]}"; do
  launchctl load "$HOME/Library/LaunchAgents/com.lman.linkedin-curator-${hour}.plist"
  echo "  ✅ Loaded: com.lman.linkedin-curator-${hour} (runs at ${hour}:00)"
done

# ============================================
# Part 5: 顯示摘要
# ============================================

echo ""
echo "🎉 完成！社交媒體自動化已設置"
echo ""
echo "📊 排程摘要："
echo ""
echo "🐦 Twitter (8次/天):"
echo "   23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00"
echo "   - 每次：1 post + 2 replies"
echo "   - 每日最多：10 posts, 20 replies"
echo ""
echo "💼 LinkedIn (4次/天):"
echo "   09:00, 13:00, 17:00, 21:00"
echo "   - 每次：1 post + 1 comment"
echo "   - 每日最多：4 posts, 4 comments"
echo ""
echo "🔄 執行方式："
echo "   LaunchAgent → Happy CLI → Claude → BrowserOS MCP"
echo ""
echo "📁 Logs 位置："
echo "   ~/twitter-curator/logs/"
echo ""
echo "🔍 查看 LaunchAgent 狀態："
echo "   launchctl list | grep com.lman"
echo ""
echo "⚙️ 確保："
echo "   ✅ BrowserOS Chrome Extension 運行中"
echo "   ✅ Twitter tab 已開啟並登入"
echo "   ✅ LinkedIn tab 已開啟並登入"
echo ""
