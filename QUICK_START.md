# Quick Start - No Chrome Remote Debugging Needed! 🚀

## The Problem You Had

Chrome was already running, so when you tried to start it with `--remote-debugging-port=9222`, it just opened in the existing session (which doesn't have debugging enabled).

## The Solution

We created a **helper page bridge** that works with your normal Chrome - no special startup needed!

## Setup (3 Steps)

### Step 1: Get Your Extension ID

1. Open Chrome
2. Go to `chrome://extensions/`
3. Find "Whatnot Live Scraper"
4. Copy the Extension ID (looks like: `abcdefghijklmnop...`)

### Step 2: Start Bridge Server

```bash
node extension-bridge.js
```

You'll see:
```
🌐 Extension Bridge Server running on http://localhost:3001
```

### Step 3: Open Helper Page

1. In Chrome, open: `http://localhost:3001/helper`
2. Paste your Extension ID
3. Click "Save"
4. **Keep this tab open** ✅

You should see: "✅ Bridge active and connected to extension"

## Test It

```bash
curl -X POST http://localhost:3001/api \
  -H "Content-Type: application/json" \
  -d '{"action": "get-auth-headers"}'
```

You should get your auth headers back!

## How It Works

Instead of using Chrome DevTools Protocol (which requires special Chrome startup), this uses:

1. **Bridge Server** - Accepts HTTP POST requests
2. **Helper Page** - Runs in Chrome, polls for requests, talks to extension
3. **Chrome Extension** - Extracts cookies, scrapes URLs

```
Your Script → POST /api → Bridge Server → Helper Page → Extension → Response
```

## What Changed

- ✅ Created `extension-bridge.js` - Simple bridge server (no CDP needed)
- ✅ Created `extension-helper.html` - Helper page that stays open
- ✅ Updated `manifest.json` - Added `externally_connectable` for localhost
- ✅ Updated `background.js` - Handles bridge messages with requestId

## Next Steps

1. Get auth headers from extension
2. Use headers to call GraphQL API  
3. Get current live streams
4. Send URLs to extension to scrape

See `WORKFLOW.md` for the complete workflow!

