# Simple Setup Guide (No CDP Required!)

This guide uses a helper page approach - no need to start Chrome with remote debugging!

## Quick Start

### 1. Get Your Extension ID

1. Open Chrome and go to `chrome://extensions/`
2. Find "Whatnot Live Scraper" extension
3. Copy the Extension ID (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

### 2. Start the Bridge Server

```bash
node extension-bridge.js
```

You should see:
```
🌐 Extension Bridge Server running on http://localhost:3001

📋 SETUP INSTRUCTIONS:
   1. Open http://localhost:3001/helper in Chrome
   2. Enter your Chrome Extension ID when prompted
   3. Keep that tab open - it bridges requests to the extension
```

### 3. Open the Helper Page

1. Open Chrome (normal Chrome, no special flags needed!)
2. Navigate to: `http://localhost:3001/helper`
3. Enter your Extension ID when prompted
4. Click "Save"
5. **Keep this tab open** - it needs to stay active

You should see: ✅ Bridge active and connected to extension

### 4. Test It

In a new terminal:

```bash
curl -X POST http://localhost:3001/api \
  -H "Content-Type: application/json" \
  -d '{"action": "get-auth-headers"}'
```

You should get back your auth headers!

## How It Works

```
External Service 
    ↓ POST /api
Bridge Server (extension-bridge.js)
    ↓ stores request
Helper Page (extension-helper.html) polls bridge server
    ↓ gets request, forwards to extension
Chrome Extension (background.js)
    ↓ extracts cookies/headers
    ↓ sends response back
Helper Page receives response
    ↓ forwards to bridge server
Bridge Server sends response to external service
```

## Usage

### Get Auth Headers

```bash
curl -X POST http://localhost:3001/api \
  -H "Content-Type: application/json" \
  -d '{"action": "get-auth-headers"}'
```

### Scrape a URL

```bash
curl -X POST http://localhost:3001/api \
  -H "Content-Type: application/json" \
  -d '{"action": "scrape-url", "url": "https://www.whatnot.com/dashboard/live/abc123"}'
```

## Troubleshooting

### "Waiting for Extension ID"
- Enter your Extension ID in the helper page
- Click "Save"
- The status should change to "✅ Bridge active"

### "Extension error: Could not establish connection"
- Make sure the extension is enabled in `chrome://extensions/`
- Check that you entered the correct Extension ID
- Reload the extension if needed

### No response from API
- Make sure the helper page tab is still open
- Check the helper page status - should be green "✅ Bridge active"
- Look at the helper page logs for errors

### Helper page shows errors
- Open browser console (F12) on the helper page
- Check for any JavaScript errors
- Make sure the bridge server is still running

## Complete Workflow Example

```javascript
const axios = require('axios');

const BRIDGE_URL = 'http://localhost:3001/api';

async function workflow() {
  // 1. Get auth headers
  console.log('Getting auth headers...');
  const { data: authData } = await axios.post(BRIDGE_URL, {
    action: 'get-auth-headers'
  });
  console.log('Auth headers:', authData.headers);
  
  // 2. Use headers for GraphQL (example)
  // ... your GraphQL code here ...
  
  // 3. Scrape a URL
  console.log('Scraping URL...');
  const { data: scrapeData } = await axios.post(BRIDGE_URL, {
    action: 'scrape-url',
    url: 'https://www.whatnot.com/dashboard/live/abc123'
  });
  console.log('Scrape result:', scrapeData);
}

workflow();
```

## Advantages of This Approach

✅ **No special Chrome startup needed** - just use normal Chrome  
✅ **No CDP required** - simpler setup  
✅ **Easy to debug** - see logs in helper page  
✅ **Works with existing Chrome session** - no need to restart  

## Next Steps

Once this is working, you can:
1. Integrate into your external service
2. Use the auth headers for GraphQL API calls
3. Automatically scrape URLs returned from GraphQL

See `WORKFLOW.md` for the complete workflow documentation!

