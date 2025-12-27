#!/bin/bash

# 建立 Twitter Curator LaunchAgents（使用 Happy CLI）
# 每小時執行：23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00

HOURS=(23 00 01 02 03 04 05 06)

for hour in "${HOURS[@]}"; do
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
        <string>請執行 Twitter Curator：發布 1 則推文，然後回覆 2 則相關推文</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${hour#0}</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>$HOME/twitter-curator/twitter-curator-${hour}.log</string>

    <key>StandardErrorPath</key>
    <string>$HOME/twitter-curator/twitter-curator-${hour}.error.log</string>

    <key>RunAtLoad</key>
    <false/>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF

  echo "✅ Created: $PLIST_FILE"
done

echo ""
echo "📋 載入所有 LaunchAgents..."

for hour in "${HOURS[@]}"; do
  launchctl load "$HOME/Library/LaunchAgents/com.lman.twitter-curator-${hour}.plist"
  echo "✅ Loaded: com.lman.twitter-curator-${hour}"
done

echo ""
echo "🎉 完成！Twitter Curator 已設置為每小時自動執行"
echo "📊 排程時間：23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00"
