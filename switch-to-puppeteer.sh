#!/bin/bash

# Switch Twitter Curator back to Puppeteer mode (from ii-agent)

echo "🔄 Switching Twitter Curator to Puppeteer mode..."

# Unload all existing agents
echo ""
echo "1️⃣ Unloading existing agents..."
for h in 00 01 02 03 04 05 06 23; do
  plist="$HOME/Library/LaunchAgents/com.lman.twitter-curator-$h.plist"
  if [ -f "$plist" ]; then
    launchctl unload "$plist" 2>/dev/null
    echo "   ✓ Unloaded hour $h"
  fi
done

# Update each plist file to use twitter-curator.js (Puppeteer)
echo ""
echo "2️⃣ Updating plist files to use twitter-curator.js (Puppeteer)..."
for h in 00 01 02 03 04 05 06 23; do
  plist="$HOME/Library/LaunchAgents/com.lman.twitter-curator-$h.plist"

  cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lman.twitter-curator-$h</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>$HOME/twitter-curator/twitter-curator.js</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$h</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>$HOME/twitter-curator/logs/twitter-$h.log</string>

    <key>StandardErrorPath</key>
    <string>$HOME/twitter-curator/logs/twitter-$h.error.log</string>

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

  echo "   ✓ Updated hour $h"
done

# Load all agents
echo ""
echo "3️⃣ Loading updated agents..."
for h in 00 01 02 03 04 05 06 23; do
  plist="$HOME/Library/LaunchAgents/com.lman.twitter-curator-$h.plist"
  launchctl load "$plist" 2>/dev/null
  echo "   ✓ Loaded hour $h"
done

echo ""
echo "✅ Switch complete! Now using Puppeteer mode."
echo ""
echo "📊 Loaded agents:"
launchctl list | grep twitter-curator

echo ""
echo "🧪 Test posting:"
echo "   cd ~/twitter-curator && node twitter-curator.js"
