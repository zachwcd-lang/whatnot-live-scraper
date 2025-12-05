# Start Automated Live Stream Monitor

This guide shows you how to start the automated monitoring system that will continuously watch for new live streams and automatically navigate Chrome to them for scraping.

## Prerequisites

Make sure you have:
1. Chrome with your profile and extensions installed
2. Node.js and dependencies installed (`npm install`)

## Quick Start (3 Steps)

### Step 1: Start Chrome with Remote Debugging

Open a terminal and run:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/tmp/chrome-debug-profile" &
```

You should see:
```
DevTools listening on ws://127.0.0.1:9222/devtools/browser/...
```

### Step 2: Start the Bridge Server

In a **new terminal**, run:

```bash
cd /Users/md/wcs/whatnot-live-scraper
node bridge-server.js
```

You should see:
```
🌐 Bridge server running on http://localhost:3001
📡 Ready to accept requests from external services
```

### Step 3: Start the Monitor

In a **third terminal**, run:

```bash
cd /Users/md/wcs/whatnot-live-scraper
node monitor.js
```

You should see:
```
🚀 Starting Live Stream Monitor
📊 Seller ID: 15647879
🔄 Check interval: 30 seconds
👀 Monitoring for new live streams...
```

## What Happens Now?

The monitor will:
- ✅ Check for new live streams every 30 seconds
- ✅ Detect when a new stream starts (different stream ID)
- ✅ Automatically navigate Chrome to the stream URL
- ✅ Let your extension scrape the page
- ✅ Keep running until you stop it (Ctrl+C)

## Configuration

You can customize the behavior with environment variables:

```bash
# Check every 60 seconds instead of 30
CHECK_INTERVAL=60000 node monitor.js

# Use a different seller ID
SELLER_ID=your_seller_id node monitor.js

# Use a different bridge URL
BRIDGE_URL=http://localhost:3002 node monitor.js
```

## Stopping the Monitor

Press `Ctrl+C` in the monitor terminal to gracefully shut it down.

You'll see:
```
👋 Shutting down monitor...
📊 Total streams processed: X
```

## Logs

The monitor will show:
- 🆕 When a new stream is detected
- 🔗 The URL it's navigating to
- ✅ Confirmation that Chrome navigated successfully
- ⏱️  A status line showing the last check time

## Troubleshooting

### "Error getting auth headers"
- Make sure Chrome is running with remote debugging (Step 1)
- Make sure the bridge server is running (Step 2)

### "Error calling GraphQL API"
- Check that you're logged into Whatnot in Chrome
- Make sure your cookies are fresh (reload Whatnot.com in Chrome)

### Chrome doesn't navigate
- Check the bridge server logs for errors
- Make sure Chrome has at least one tab open

## One-Line Startup (Advanced)

If you want to start everything at once in the background:

```bash
# Start Chrome
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/tmp/chrome-debug-profile" &

# Wait for Chrome to start
sleep 2

# Start bridge server in background
node bridge-server.js

# Start monitor
node monitor.js
```

---

**Note**: The monitor keeps track of which streams it has already processed. If you restart the monitor, it will re-process any currently active streams as "new" streams.

