#!/bin/bash

# Twitter Reply-Only LaunchAgents Setup
# 為白天時段（07:00-22:00）每小時創建一個 reply 任務

SCRIPT_PATH="/Users/lman/twitter-curator/twitter-reply-only.js"
NODE_PATH="/usr/local/bin/node"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/twitter-curator/logs"

# 確保 log 目錄存在
mkdir -p "$LOG_DIR"

# 清理舊的 reply LaunchAgents
echo "清理舊的 Twitter reply LaunchAgents..."
for hour in {07..22}; do
    plist_file="$LAUNCH_AGENTS_DIR/com.lman.twitter-reply-$hour.plist"
    if [ -f "$plist_file" ]; then
        launchctl unload "$plist_file" 2>/dev/null
        rm "$plist_file"
        echo "  已移除 $hour:00"
    fi
done

# 為白天每小時（07:00-22:00）創建 LaunchAgent
echo ""
echo "創建新的 Twitter Reply LaunchAgents..."
for hour in {07..22}; do
    hour_padded=$(printf "%02d" $hour)
    plist_file="$LAUNCH_AGENTS_DIR/com.lman.twitter-reply-$hour_padded.plist"

    cat > "$plist_file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lman.twitter-reply-$hour_padded</string>

    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$SCRIPT_PATH</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$hour</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>$LOG_DIR/twitter-reply-$hour_padded.log</string>

    <key>StandardErrorPath</key>
    <string>$LOG_DIR/twitter-reply-$hour_padded.error.log</string>

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

    # 載入 LaunchAgent
    launchctl load "$plist_file" 2>/dev/null
    echo "  ✅ $hour:00 - Reply task"
done

echo ""
echo "=========================================="
echo "Twitter Reply LaunchAgents 設定完成！"
echo "=========================================="
echo ""
echo "白天回文時段："
echo "  07:00-22:00（每小時至少回 1 則）"
echo ""
echo "檢查已載入的 LaunchAgents："
launchctl list | grep "twitter-reply" | wc -l | xargs echo "  已載入："
echo ""
echo "查看即將執行的任務："
echo "  launchctl list | grep twitter-reply"
echo ""
echo "測試執行（DRY RUN）："
echo "  DRY_RUN=true node $SCRIPT_PATH"
echo ""
