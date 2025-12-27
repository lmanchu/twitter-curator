#!/bin/bash

# LinkedIn Curator Test Script
# 測試 LinkedIn 自動化系統（DRY RUN 模式）

echo "🧪 Testing LinkedIn Curator System..."
echo ""

# 設置環境變數
export DRY_RUN=true
export HEADLESS=false

# 測試 content generator
echo "📝 Test 1: Content Generation"
echo "=============================="
node linkedin-content-generator.js
echo ""

# 測試 POST 模式
echo "📤 Test 2: POST Mode (DRY RUN)"
echo "=============================="
node linkedin-curator.js --mode post
echo ""

# 測試 REPLY 模式
echo "💬 Test 3: REPLY Mode (DRY RUN)"
echo "==============================="
node linkedin-curator.js --mode reply
echo ""

# 檢查數據文件
echo "📊 Test 4: Check Data Files"
echo "============================"
echo "Posted LinkedIn posts:"
if [ -f posted-linkedin.json ]; then
  cat posted-linkedin.json | jq -r '.[] | "\(.timestamp): \(.content[0:80])..."' | tail -5
else
  echo "  No posts yet"
fi

echo ""
echo "Replied LinkedIn comments:"
if [ -f replied-linkedin.json ]; then
  cat replied-linkedin.json | jq -r '.[] | "\(.timestamp): \(.reply[0:50])..."' | tail -5
else
  echo "  No replies yet"
fi

echo ""
echo "📈 Daily Stats:"
if [ -f daily-linkedin-stats.json ]; then
  cat daily-linkedin-stats.json | jq '.'
else
  echo "  No stats yet"
fi

echo ""
echo "✅ Test Complete!"
echo ""
echo "🔍 Next Steps:"
echo "  1. Review test output above"
echo "  2. If tests pass, set DRY_RUN=false in LaunchAgents"
echo "  3. Monitor logs: tail -f linkedin-curator.log"
echo "  4. Check schedule: launchctl list | grep linkedin-curator"
echo ""
