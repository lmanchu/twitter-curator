#!/usr/bin/env node

/**
 * 創建 Twitter Curator LaunchAgents
 * 每小時執行一次（23:00-06:00）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOURS = [23, 0, 1, 2, 3, 4, 5, 6];
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library/LaunchAgents');
const SCRIPT_PATH = path.join(os.homedir(), 'twitter-curator/twitter-curator.js');

function createPlist(hour) {
  const hourStr = hour.toString().padStart(2, '0');
  const label = `com.lman.twitter-curator-${hourStr}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${SCRIPT_PATH}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${path.dirname(SCRIPT_PATH)}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>DRY_RUN</key>
        <string>false</string>
        <key>HEADLESS</key>
        <string>true</string>
    </dict>

    <!-- 執行時間：${hourStr}:00 -->
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${hour}</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <!-- 日誌輸出 -->
    <key>StandardOutPath</key>
    <string>${path.dirname(SCRIPT_PATH)}/twitter-curator.log</string>

    <key>StandardErrorPath</key>
    <string>${path.dirname(SCRIPT_PATH)}/twitter-curator.error.log</string>

    <!-- 即使出錯也繼續運行 -->
    <key>KeepAlive</key>
    <false/>

    <!-- 失敗後不要重試 -->
    <key>RunAtLoad</key>
    <false/>

</dict>
</plist>
`;
}

function main() {
  console.log('🤖 Creating Twitter Curator LaunchAgents...\n');

  let created = 0;

  for (const hour of HOURS) {
    const hourStr = hour.toString().padStart(2, '0');
    const label = `com.lman.twitter-curator-${hourStr}`;
    const plistPath = path.join(LAUNCH_AGENTS_DIR, `${label}.plist`);

    const content = createPlist(hour);

    try {
      fs.writeFileSync(plistPath, content, 'utf-8');
      console.log(`✅ Created: ${label}.plist (runs at ${hourStr}:00)`);
      created++;
    } catch (error) {
      console.error(`❌ Error creating ${label}.plist:`, error.message);
    }
  }

  console.log(`\n📊 Summary: ${created}/${HOURS.length} LaunchAgents created`);

  console.log('\n📋 Next steps:');
  console.log('1. Load all LaunchAgents:');
  console.log('   launchctl load ~/Library/LaunchAgents/com.lman.twitter-curator-*.plist');
  console.log('');
  console.log('2. Check loaded agents:');
  console.log('   launchctl list | grep twitter-curator');
  console.log('');
  console.log('3. Test manually:');
  console.log('   cd ~/twitter-curator && npm run dry-run');
}

if (require.main === module) {
  main();
}
