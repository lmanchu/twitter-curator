#!/bin/bash

# 更新 LaunchAgents 使用 ii-agent 完全自動化

echo "🎉 設置 Twitter 完全自動化（使用 ii-agent）"
echo ""
echo "你的 Gemini PRO API 已配置！"
echo ""
echo "這個方案："
echo "  ✅ 100% 完全自動化"
echo "  ✅ 不會被 Twitter 偵測"
echo "  ✅ 使用你的 Gemini PRO API"
echo "  ✅ 半夜自動執行，無需人工"
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
        <string>/usr/local/bin/node</string>
        <string>$HOME/twitter-curator/twitter-ii-agent.js</string>
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
echo "🎉 完成！Twitter 完全自動化已設置"
echo ""
echo "📅 排程："
echo "   每天 23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00"
echo "   ii-agent 會自動執行，無需任何人工介入"
echo ""
echo "🔍 查看狀態："
echo "   launchctl list | grep twitter-curator"
echo ""
echo "📊 查看已發推文："
echo "   cat ~/twitter-curator/posted-tweets.json | jq"
echo ""
echo "📝 查看日誌："
echo "   tail -f ~/twitter-curator/twitter-ii-agent.log"
echo ""
echo "🎯 注意事項："
echo "   • ii-agent 必須保持運行（已在運行中）"
echo "   • BrowserOS Chrome 必須保持開啟"
echo "   • Twitter tab 必須登入"
echo ""
