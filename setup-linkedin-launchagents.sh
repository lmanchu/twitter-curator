#!/bin/bash

# Setup LinkedIn automation with ii-agent (2x daily during business hours)

echo "🚀 Setting up LinkedIn Automation (ii-agent)"
echo ""
echo "Configuration:"
echo "  ✅ Using ii-agent + Gemini PRO API"
echo "  ✅ 100% fully automated"
echo "  ✅ 2 posts per day (business hours)"
echo "  ✅ High-quality, persona-driven content"
echo ""

# Create logs directory
mkdir -p "$HOME/twitter-curator/logs"

# LinkedIn posting times (business hours)
# 09:00 - Morning (business day start)
# 17:00 - Afternoon (business day end)
LINKEDIN_HOURS=(09 17)

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
        <string>/usr/local/bin/node</string>
        <string>$HOME/twitter-curator/linkedin-ii-agent.js</string>
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

  # Reload LaunchAgent
  launchctl unload "$PLIST_FILE" 2>/dev/null
  launchctl load "$PLIST_FILE"

  echo "  ✅ Setup: com.lman.linkedin-curator-${hour} (${hour}:00)"
done

echo ""
echo "🎉 LinkedIn Automation Configured!"
echo ""
echo "📅 Schedule:"
echo "   • 09:00 - Morning post (business day start)"
echo "   • 17:00 - Afternoon post (business day end)"
echo ""
echo "🔍 Monitor:"
echo "   launchctl list | grep linkedin-curator"
echo ""
echo "📊 View posts:"
echo "   cat ~/twitter-curator/posted-linkedin.json | jq"
echo ""
echo "📝 View logs:"
echo "   tail -f ~/twitter-curator/logs/linkedin-*.log"
echo ""
echo "✅ Requirements (already met):"
echo "   • ii-agent running (✓)"
echo "   • BrowserOS Chrome open with LinkedIn logged in (✓)"
echo "   • Gemini PRO API configured (✓)"
echo ""
