#!/bin/bash

# LinkedIn Curator LaunchAgent Setup Script
# 創建 9 個 LaunchAgent（3 個發文 + 6 個回覆）

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
SCRIPT_DIR="/Users/lman/twitter-curator"
NODE_PATH="/usr/local/bin/node"

echo "🚀 Setting up LinkedIn Curator LaunchAgents..."
echo ""

# 定義發文時間（3 個隨機時間）
POST_TIMES=(
  "9:30"
  "14:45"
  "18:20"
)

# 定義回覆時間（6 個隨機時間）
REPLY_TIMES=(
  "10:15"
  "11:45"
  "13:20"
  "15:30"
  "16:50"
  "19:15"
)

# 創建發文 LaunchAgent
echo "📝 Creating POST LaunchAgents..."
for i in "${!POST_TIMES[@]}"; do
  TIME="${POST_TIMES[$i]}"
  HOUR=$(echo $TIME | cut -d: -f1)
  MINUTE=$(echo $TIME | cut -d: -f2)
  
  PLIST_NAME="com.lman.linkedin-curator-post-$i.plist"
  PLIST_PATH="$LAUNCH_AGENTS_DIR/$PLIST_NAME"
  
  cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lman.linkedin-curator-post-$i</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$SCRIPT_DIR/linkedin-curator.js</string>
        <string>--mode</string>
        <string>post</string>
    </array>
    
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MINUTE</integer>
    </dict>
    
    <key>StandardOutPath</key>
    <string>$SCRIPT_DIR/linkedin-curator.log</string>
    
    <key>StandardErrorPath</key>
    <string>$SCRIPT_DIR/linkedin-curator.error.log</string>
    
    <key>RunAtLoad</key>
    <false/>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HEADLESS</key>
        <string>true</string>
        <key>DRY_RUN</key>
        <string>false</string>
    </dict>
</dict>
</plist>
EOF

  echo "  ✅ Created $PLIST_NAME (runs at $TIME daily)"
done

echo ""
echo "💬 Creating REPLY LaunchAgents..."
for i in "${!REPLY_TIMES[@]}"; do
  TIME="${REPLY_TIMES[$i]}"
  HOUR=$(echo $TIME | cut -d: -f1)
  MINUTE=$(echo $TIME | cut -d: -f2)
  
  PLIST_NAME="com.lman.linkedin-curator-reply-$i.plist"
  PLIST_PATH="$LAUNCH_AGENTS_DIR/$PLIST_NAME"
  
  cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lman.linkedin-curator-reply-$i</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$SCRIPT_DIR/linkedin-curator.js</string>
        <string>--mode</string>
        <string>reply</string>
    </array>
    
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>$HOUR</integer>
        <key>Minute</key>
        <integer>$MINUTE</integer>
    </dict>
    
    <key>StandardOutPath</key>
    <string>$SCRIPT_DIR/linkedin-curator.log</string>
    
    <key>StandardErrorPath</key>
    <string>$SCRIPT_DIR/linkedin-curator.error.log</string>
    
    <key>RunAtLoad</key>
    <false/>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>HEADLESS</key>
        <string>true</string>
        <key>DRY_RUN</key>
        <string>false</string>
    </dict>
</dict>
</plist>
EOF

  echo "  ✅ Created $PLIST_NAME (runs at $TIME daily)"
done

echo ""
echo "📥 Loading LaunchAgents..."
for i in "${!POST_TIMES[@]}"; do
  launchctl load "$LAUNCH_AGENTS_DIR/com.lman.linkedin-curator-post-$i.plist" 2>/dev/null
done

for i in "${!REPLY_TIMES[@]}"; do
  launchctl load "$LAUNCH_AGENTS_DIR/com.lman.linkedin-curator-reply-$i.plist" 2>/dev/null
done

echo ""
echo "✅ Setup complete!"
echo ""
echo "📅 LinkedIn Curator Schedule:"
echo ""
echo "📝 POST times (3 per day):"
for TIME in "${POST_TIMES[@]}"; do
  echo "  - $TIME"
done

echo ""
echo "💬 REPLY times (6 per day):"
for TIME in "${REPLY_TIMES[@]}"; do
  echo "  - $TIME"
done

echo ""
echo "📊 Daily quota:"
echo "  - Posts: 3 per day"
echo "  - Replies: 6 per day"
echo "  - Total: 9 actions per day"
echo ""
echo "🔍 Check status with:"
echo "  launchctl list | grep linkedin-curator"
echo ""
echo "📝 View logs:"
echo "  tail -f $SCRIPT_DIR/linkedin-curator.log"
echo ""
