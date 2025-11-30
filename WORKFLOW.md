# Complete Workflow: External Service → Chrome Extension

## Overview

This document explains the complete workflow for:
1. External service POSTs URL to Chrome extension
2. Chrome extension extracts auth headers from browser session
3. External service uses headers to authenticate GraphQL API requests
4. External service gets current live streams from GraphQL
5. External service automatically sends stream URLs to Chrome extension to scrape

## Architecture

```
┌─────────────────┐
│ External Service│
│  (Node.js/API)  │
└────────┬────────┘
         │
         │ 1. POST: Get Auth Headers
         ▼
┌─────────────────┐
│ Bridge Server   │  ← Uses Chrome DevTools Protocol
│  (bridge-server)│     or Extension Messaging
└────────┬────────┘
         │
         │ 2. Extract Cookies
         ▼
┌─────────────────┐
│ Chrome Browser  │
│  + Extension    │
└────────┬────────┘
         │
         │ 3. Return Headers
         ▼
┌─────────────────┐
│ External Service│
└────────┬────────┘
         │
         │ 4. Use Headers for GraphQL API
         ▼
┌─────────────────┐
│ Whatnot GraphQL │
│      API        │
└────────┬────────┘
         │
         │ 5. Get Current Lives
         ▼
┌─────────────────┐
│ External Service│
└────────┬────────┘
         │
         │ 6. POST: Scrape URLs
         ▼
┌─────────────────┐
│ Chrome Extension│
│  (background.js)│
└────────┬────────┘
         │
         │ 7. Open URLs & Scrape
         ▼
┌─────────────────┐
│ Content Script  │
│  (content.js)   │
└─────────────────┘
```

## Implementation Details

### 1. Chrome Extension (Already Implemented)

**Files:**
- `background.js` - Handles auth header extraction and URL scraping
- `content.js` - Performs the actual scraping
- `manifest.json` - Includes necessary permissions (cookies, tabs)

**Key Functions:**

#### Extract Auth Headers
```javascript
// In background.js
async function extractAuthHeaders() {
  const cookies = await chrome.cookies.getAll({ domain: 'whatnot.com' });
  // Build cookie header and return headers object
}
```

**Message API:**
- Message type: `get-auth-headers`
- Returns: `{ success: true, headers: { cookieHeader, cookies, headers } }`

#### Scrape URL
```javascript
// In background.js
async function handleScrapeUrl(url) {
  // Opens URL in new tab, waits for load, triggers content script
}
```

**Message API:**
- Message type: `scrape-url`
- Payload: `{ type: 'scrape-url', url: 'https://...' }`
- Returns: `{ success: true, result: { tabId, url, message } }`

### 2. Bridge Server Options

#### Option A: Chrome DevTools Protocol (CDP)

**Pros:**
- Direct access to browser cookies
- No extension messaging needed
- Works from Node.js

**Cons:**
- Requires Chrome to run with `--remote-debugging-port=9222`
- Need `chrome-remote-interface` package

**Setup:**
```bash
# Start Chrome with debugging
chrome --remote-debugging-port=9222

# Install dependency
npm install chrome-remote-interface

# Run bridge server
node bridge-server.js
```

#### Option B: Extension Messaging

**Pros:**
- Uses extension's built-in messaging API
- No special Chrome startup needed

**Cons:**
- Requires extension ID
- Needs helper page or native messaging

**Implementation:**
Create a helper HTML page that:
1. Communicates with extension via `chrome.runtime.sendMessage`
2. Receives HTTP requests from bridge server
3. Bridges HTTP → Extension messages

### 3. External Service Workflow

**Step 1: Get Auth Headers**
```javascript
const response = await axios.post('http://localhost:3001', {
  action: 'get-auth-headers'
});
const authHeaders = response.data.headers;
```

**Step 2: Call GraphQL API**
```javascript
const currentLives = await axios.post('https://www.whatnot.com/graphql', {
  operationName: 'MyLives',
  variables: { sellerId: 'YOUR_SELLER_ID' },
  query: `query MyLives($sellerId: ID) {
    currentLives: myLiveStreams(status: [PLAYING STOPPED]) {
      id
      title
      status
    }
  }`
}, {
  headers: authHeaders.headers
});
```

**Step 3: Scrape URLs**
```javascript
for (const stream of currentLives) {
  const url = `https://www.whatnot.com/dashboard/live/${stream.id}`;
  await axios.post('http://localhost:3001', {
    action: 'scrape-url',
    url: url
  });
}
```

## Quick Start

### 1. Setup Chrome Extension

1. Load extension in Chrome (`chrome://extensions/`)
2. Make sure you're logged into Whatnot in Chrome
3. Note your extension ID

### 2. Start Bridge Server

**Option A - Using CDP:**
```bash
# Start Chrome with debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Install dependencies
npm install chrome-remote-interface axios

# Run bridge server
CHROME_DEBUG_PORT=9222 node bridge-server.js
```

**Option B - Direct Extension Messaging:**
```javascript
// Create a simple server that uses extension messaging
// (See api-client.js for example)
```

### 3. Use API Client

```bash
# Set environment variables
export CHROME_DEBUG_PORT=9222
export SELLER_ID=your_seller_id
export BRIDGE_URL=http://localhost:3001

# Run
node api-client.js
```

## Example: Complete Integration

```javascript
const axios = require('axios');
const BRIDGE_URL = 'http://localhost:3001';

async function workflow() {
  // 1. Get auth headers from extension
  console.log('Getting auth headers...');
  const { data } = await axios.post(BRIDGE_URL, {
    action: 'get-auth-headers'
  });
  const headers = data.headers;
  
  // 2. Get current lives from GraphQL
  console.log('Fetching current lives...');
  const { data: graphqlData } = await axios.post(
    'https://www.whatnot.com/graphql',
    {
      operationName: 'MyLives',
      variables: { sellerId: '15647879' },
      query: `query MyLives($sellerId: ID) {
        currentLives: myLiveStreams(status: [PLAYING STOPPED]) {
          id
          title
          status
        }
      }`
    },
    { headers: headers.headers }
  );
  
  const streams = graphqlData.data.currentLives;
  console.log(`Found ${streams.length} live streams`);
  
  // 3. Send each URL to extension to scrape
  for (const stream of streams) {
    const url = `https://www.whatnot.com/dashboard/live/${stream.id}`;
    console.log(`Scraping ${url}...`);
    await axios.post(BRIDGE_URL, {
      action: 'scrape-url',
      url: url
    });
  }
  
  console.log('Workflow complete!');
}

workflow();
```

## Files Created

1. **background.js** - Updated with:
   - `extractAuthHeaders()` - Extracts cookies from browser
   - `handleScrapeUrl(url)` - Opens URL and triggers scraping
   - Message listeners for external/internal messages

2. **bridge-server.js** - HTTP server that:
   - Accepts POST requests
   - Extracts cookies via CDP or extension messaging
   - Routes scrape requests to extension

3. **api-client.js** - Example client that demonstrates:
   - Getting auth headers
   - Calling GraphQL API
   - Sending URLs to scrape

4. **README_API.md** - Detailed API documentation

## Next Steps

1. Choose bridge method (CDP or Extension Messaging)
2. Install required dependencies
3. Test auth header extraction
4. Test GraphQL API calls with extracted headers
5. Test URL scraping workflow
6. Integrate into your external service

## Notes

- Chrome extension must have `cookies` permission (already added to manifest.json)
- Extension must be loaded and active in Chrome
- User must be logged into Whatnot in Chrome browser
- Bridge server should run on localhost for security

