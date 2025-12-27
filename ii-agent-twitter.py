#!/usr/bin/env python3
"""
Twitter Curator using II-Agent Browser Automation

完全自動化的 Twitter 發文系統，使用 ii-agent 的瀏覽器自動化功能
"""

import os
import sys
import json
import asyncio
import websockets
from datetime import datetime, date
from pathlib import Path

# Configuration
WORKSPACE_DIR = Path.home() / "twitter-curator"
II_AGENT_WS = "ws://localhost:8000/ws"
TWITTER_URL = "https://x.com/home"

# File paths
POSTED_TWEETS = WORKSPACE_DIR / "posted-tweets.json"
DAILY_STATS = WORKSPACE_DIR / "daily-stats.json"
LOG_FILE = WORKSPACE_DIR / "ii-agent-twitter.log"


def log(message, level="INFO"):
    """Log message to file and console"""
    timestamp = datetime.now().isoformat()
    log_message = f"[{timestamp}] [{level}] {message}"
    print(log_message)

    with open(LOG_FILE, "a") as f:
        f.write(log_message + "\n")


def load_json(filepath):
    """Load JSON file"""
    if filepath.exists():
        with open(filepath, "r") as f:
            return json.load(f)
    return []


def save_json(filepath, data):
    """Save JSON file"""
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)


def check_daily_limits():
    """Check if daily posting limits have been reached"""
    today = date.today().isoformat()
    stats = load_json(DAILY_STATS)

    today_stats = next((s for s in stats if s["date"] == today), {
        "date": today,
        "posts": 0,
        "replies": 0
    })

    return {
        "can_post": today_stats["posts"] < 10,
        "can_reply": today_stats["replies"] < 20,
        "stats": today_stats
    }


def update_daily_stats(action_type="post"):
    """Update daily statistics"""
    today = date.today().isoformat()
    stats = load_json(DAILY_STATS)

    # Find or create today's stats
    today_stats = next((s for s in stats if s["date"] == today), None)
    if not today_stats:
        today_stats = {"date": today, "posts": 0, "replies": 0}
        stats.append(today_stats)

    # Update counts
    if action_type == "post":
        today_stats["posts"] += 1
    elif action_type == "reply":
        today_stats["replies"] += 1

    # Keep only last 30 days
    cutoff_date = (datetime.now().timestamp() - 30 * 24 * 60 * 60)
    stats = [s for s in stats if datetime.fromisoformat(s["date"]).timestamp() > cutoff_date]

    save_json(DAILY_STATS, stats)


def generate_tweet_content():
    """Generate tweet content using existing content-generator.js"""
    import subprocess

    result = subprocess.run(
        ["node", str(WORKSPACE_DIR / "content-generator.js")],
        capture_output=True,
        text=True,
        cwd=WORKSPACE_DIR
    )

    if result.returncode != 0:
        log(f"Error generating content: {result.stderr}", "ERROR")
        return None

    # Extract the tweet from output
    output = result.stdout
    for line in output.split("\n"):
        if line.startswith('"') and line.endswith('"'):
            return line.strip('"')

    log("Could not extract tweet from generator output", "ERROR")
    return None


async def post_tweet_via_ii_agent(tweet_text):
    """
    Post tweet using ii-agent's browser automation

    This sends a task to ii-agent to:
    1. Navigate to Twitter
    2. Find the tweet compose box
    3. Type the tweet text
    4. Click the Post button
    """

    task_prompt = f"""Please help me post a tweet on Twitter (https://x.com/home).

The tweet text is:
"{tweet_text}"

Steps to follow:
1. Navigate to https://x.com/home (Twitter should already be logged in)
2. Find the tweet compose box (the contenteditable div with placeholder "What's happening?")
3. Click on the compose box to focus it
4. Type the exact tweet text: {tweet_text}
5. Find and click the "Post" button (usually a blue button on the right side)
6. Wait for the tweet to be posted successfully
7. Report back with confirmation

Please execute this task autonomously using browser automation."""

    log("Connecting to ii-agent WebSocket...")

    try:
        async with websockets.connect(II_AGENT_WS) as websocket:
            log("Connected to ii-agent")

            # Send task
            task_message = {
                "type": "task",
                "content": task_prompt,
                "config": {
                    "model": "claude-sonnet-4-20250514",  # Use Claude Sonnet 4
                    "runtime": "local"  # Use local runtime for browser automation
                }
            }

            log(f"Sending task to ii-agent: Post tweet")
            await websocket.send(json.dumps(task_message))

            # Wait for responses
            tweet_posted = False
            max_wait_time = 120  # 2 minutes max
            start_time = datetime.now()

            while not tweet_posted:
                if (datetime.now() - start_time).total_seconds() > max_wait_time:
                    log("Timeout waiting for ii-agent response", "ERROR")
                    return False

                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=10)
                    data = json.loads(response)

                    log(f"Received from ii-agent: {data.get('type', 'unknown')}")

                    # Check for completion
                    if data.get("type") == "done":
                        tweet_posted = True
                        log("✅ Tweet posted successfully!")
                        return True

                    # Check for errors
                    if data.get("type") == "error":
                        log(f"Error from ii-agent: {data.get('content')}", "ERROR")
                        return False

                    # Log progress
                    if data.get("type") == "thought":
                        log(f"ii-agent thinking: {data.get('content', '')[:100]}...")

                except asyncio.TimeoutError:
                    # No response yet, continue waiting
                    continue
                except Exception as e:
                    log(f"Error receiving from ii-agent: {e}", "ERROR")
                    return False

            return tweet_posted

    except Exception as e:
        log(f"Error connecting to ii-agent: {e}", "ERROR")
        return False


async def main():
    """Main execution flow"""
    log("=== II-Agent Twitter Curator Started ===")

    # 1. Check daily limits
    limits = check_daily_limits()
    log(f"Daily stats: {limits['stats']['posts']} posts, {limits['stats']['replies']} replies")

    if not limits["can_post"]:
        log("Daily post limit reached, exiting")
        return

    # 2. Generate tweet content
    log("Generating tweet content...")
    tweet_text = generate_tweet_content()

    if not tweet_text:
        log("Failed to generate tweet content", "ERROR")
        return

    log(f"Generated tweet ({len(tweet_text)} chars): \"{tweet_text[:80]}...\"")

    # 3. Post tweet via ii-agent
    log("Posting tweet via ii-agent browser automation...")
    success = await post_tweet_via_ii_agent(tweet_text)

    if success:
        # 4. Record the post
        tweets = load_json(POSTED_TWEETS)
        tweets.append({
            "text": tweet_text,
            "timestamp": datetime.now().isoformat(),
            "url": None,  # ii-agent could potentially extract this
            "method": "ii-agent"
        })
        save_json(POSTED_TWEETS, tweets)

        update_daily_stats("post")

        log(f"✅ Successfully posted and recorded tweet")
    else:
        log("❌ Failed to post tweet", "ERROR")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
