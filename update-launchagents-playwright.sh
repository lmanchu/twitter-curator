#!/bin/bash

# 更新 LaunchAgents 使用 Playwright

echo "🔄 更新 LaunchAgents 使用 Playwright..."
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
        <string>$HOME/twitter-curator/twitter-playwright.js</string>
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
        <key>DRY_RUN</key>
        <string>false</string>
    </dict>
</dict>
</plist>
EOF

  # Reload the LaunchAgent
  launchctl unload "$PLIST_FILE" 2>/dev/null
  launchctl load "$PLIST_FILE"

  echo "  ✅ Updated: com.lman.twitter-curator-${hour}"
done

echo ""
echo "🎉 All LaunchAgents updated to use Playwright!"
echo ""
echo "📊 LaunchAgents will now run automatically:"
echo "   23:00, 00:00, 01:00, 02:00, 03:00, 04:00, 05:00, 06:00"
echo ""
echo "🔍 Check status:"
echo "   launchctl list | grep com.lman.twitter-curator"
echo ""
