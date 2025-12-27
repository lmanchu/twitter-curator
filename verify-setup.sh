#!/bin/bash

echo "=========================================="
echo "Twitter Curator 配置驗證"
echo "=========================================="
echo ""

# 檢查腳本文件
echo "📄 檢查腳本文件..."
files=(
    "config.js"
    "twitter-curator.js"
    "twitter-reply-only.js"
    "content-generator.js"
)

for file in "${files[@]}"; do
    if [ -f ~/twitter-curator/$file ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file 不存在"
    fi
done
echo ""

# 檢查 LaunchAgents
echo "🚀 檢查 LaunchAgents..."
post_count=$(launchctl list | grep twitter-curator | wc -l | xargs)
reply_count=$(launchctl list | grep twitter-reply | wc -l | xargs)

echo "  夜間 Post: $post_count/4"
echo "  白天 Reply: $reply_count/16"

if [ "$post_count" -eq 4 ] && [ "$reply_count" -eq 16 ]; then
    echo "  ✅ 所有 LaunchAgents 已載入"
else
    echo "  ⚠️  LaunchAgents 數量不符預期"
fi
echo ""

# 檢查配置
echo "⚙️  檢查 config.js 設定..."
replies_per_hour=$(grep "REPLIES_PER_HOUR:" ~/twitter-curator/config.js | head -1 | grep -o "[0-9]")
max_replies=$(grep "max_replies:" ~/twitter-curator/config.js | grep -o "[0-9]*" | head -1)

echo "  REPLIES_PER_HOUR: $replies_per_hour (預期: 2)"
echo "  max_replies: $max_replies (預期: 30)"

if [ "$replies_per_hour" -eq 2 ] && [ "$max_replies" -eq 30 ]; then
    echo "  ✅ 配置正確"
else
    echo "  ⚠️  配置可能需要調整"
fi
echo ""

# 檢查日誌目錄
echo "📁 檢查日誌目錄..."
if [ -d ~/twitter-curator/logs ]; then
    log_count=$(ls ~/twitter-curator/logs/*.log 2>/dev/null | wc -l | xargs)
    echo "  ✅ logs/ 目錄存在"
    echo "  日誌文件: $log_count 個"
else
    echo "  ⚠️  logs/ 目錄不存在，將被自動創建"
    mkdir -p ~/twitter-curator/logs
fi
echo ""

# 顯示今日統計
echo "📊 今日統計..."
if [ -f ~/twitter-curator/daily-stats.json ]; then
    today=$(date +%Y-%m-%d)
    stats=$(cat ~/twitter-curator/daily-stats.json | grep "\"$today\"" || echo "今日尚無記錄")
    echo "  $stats"
else
    echo "  尚無統計記錄"
fi
echo ""

# 顯示即將執行的任務
echo "⏰ 下一次執行時間..."
current_hour=$(date +%H)
next_hour=$((current_hour + 1))

if [ $current_hour -ge 7 ] && [ $current_hour -lt 22 ]; then
    echo "  白天回文: 下一次在 $next_hour:00"
fi

if [ $current_hour -eq 23 ] || [ $current_hour -eq 1 ] || [ $current_hour -eq 3 ] || [ $current_hour -eq 5 ]; then
    echo "  夜間發文: 下一次在 $next_hour:00"
fi
echo ""

echo "=========================================="
echo "✅ 驗證完成"
echo "=========================================="
echo ""
echo "📖 查看完整配置："
echo "   cat ~/twitter-curator/FINAL-CONFIG.md"
echo ""
echo "🧪 測試執行："
echo "   cd ~/twitter-curator"
echo "   DRY_RUN=true node twitter-reply-only.js"
echo ""
