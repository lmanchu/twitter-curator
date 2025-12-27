#!/bin/bash

# 設置 Twitter 自動化使用 Happy CLI

echo "🚀 設置 Twitter 自動化（Happy CLI + BrowserOS）"
echo ""
echo "這個方案："
echo "  ✅ 90% 自動化"
echo "  ✅ 不會被 Twitter 偵測"
echo "  ✅ 完全可靠"
echo "  ⚠️ 需要手動 Cmd+V 貼上（5 秒）"
echo ""

# Check Happy CLI
if ! command -v happy &> /dev/null; then
  echo "❌ Happy CLI not found"
  echo "請確認 Happy 已安裝：/usr/local/bin/happy"
  exit 1
fi

echo "✅ Happy CLI found: $(which happy)"
echo ""

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

  # Reload LaunchAgent
  launchctl unload "$PLIST_FILE" 2>/dev/null
  launchctl load "$PLIST_FILE"

  echo "  ✅ Setup: com.lman.twitter-curator-${hour} (${hour}:00)"
done

echo ""
echo "🎉 完成！Twitter 自動化已設置"
echo ""
echo "📅 排程："
echo "   每天 23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00"
echo "   Happy CLI 會觸發 Claude 對話"
echo ""
echo "📝 當 Happy 觸發時，你需要："
echo "   1. Claude 會顯示生成的推文"
echo "   2. 推文已經在剪貼簿"
echo "   3. 在 Twitter tab 按 Cmd+V"
echo "   4. 點擊 Post 按鈕"
echo "   5. 告訴 Claude \"已發布\""
echo ""
echo "⏱️  每次只需 5 秒！"
echo ""
echo "🔍 查看狀態："
echo "   launchctl list | grep twitter-curator"
echo ""
echo "📖 詳細說明："
echo "   cat ~/twitter-curator/SOLUTION-FINAL.md"
echo ""
