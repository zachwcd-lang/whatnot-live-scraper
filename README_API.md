# Chrome Extension API Integration

This guide explains how to use the Chrome extension programmatically from external services.

## Architecture

```
External Service → Bridge Server → Chrome Browser (with Extension)
                              ↓
                    Extract Auth Headers
                              ↓
                    Use for GraphQL API
                              ↓
                    Get Current Lives
                              ↓
                    Send URLs to Extension
                              ↓
                    Extension Scrapes Pages
```

## Setup

### 1. Install Dependencies

```bash
npm install chrome-remote-interface axios
```

### 2. Start Chrome with Remote Debugging

Chrome must be running with remote debugging enabled:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222

# Windows
chrome.exe --remote-debugging-port=9222
```

### 3. Load the Extension

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `whatnot-live-scraper` folder
5. Note the Extension ID (you'll need this)

### 4. Login to Whatnot in Chrome

Make sure you're logged into Whatnot in the Chrome browser so cookies are available.

### 5. Start Bridge Server

```bash
node bridge-server.js
```

The server will run on `http://localhost:3001`

## API Endpoints

### POST / - Get Auth Headers

Extract authentication cookies/headers from the Chrome browser session.

**Request:**
```json
{
  "action": "get-auth-headers"
}
```

**Response:**
```json
{
  "success": true,
  "headers": {
    "cookieHeader": "session=abc123; token=xyz789; ...",
    "cookies": {
      "session": "abc123",
      "token": "xyz789",
      ...
    },
    "headers": {
      "Cookie": "session=abc123; token=xyz789; ...",
      "Origin": "https://www.whatnot.com",
      "Referer": "https://www.whatnot.com/",
      "User-Agent": "..."
    }
  }
}
```

### POST / - Scrape URL

Send a URL to the Chrome extension to scrape (requires extension messaging setup).

**Request:**
```json
{
  "action": "scrape-url",
  "url": "https://www.whatnot.com/dashboard/live/abc123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Use Chrome Extension to scrape URL",
  "url": "https://www.whatnot.com/dashboard/live/abc123"
}
```

## Usage Example

### Complete Workflow

```javascript
const axios = require('axios');

const BRIDGE_URL = 'http://localhost:3001';

// Step 1: Get auth headers from Chrome extension
async function getAuthHeaders() {
  const response = await axios.post(BRIDGE_URL, {
    action: 'get-auth-headers'
  });
  return response.data.headers;
}

// Step 2: Use headers to call GraphQL API
async function getCurrentLives(authHeaders) {
  const response = await axios.post('https://www.whatnot.com/graphql', {
    operationName: 'MyLives',
    variables: { sellerId: '15647879' },
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
  return response.data.data.currentLives;
}

// Step 3: Send URLs to extension to scrape
async function scrapeUrl(url) {
  const response = await axios.post(BRIDGE_URL, {
    action: 'scrape-url',
    url: url
  });
  return response.data;
}

// Complete workflow
async function main() {
  // Get auth headers
  const authHeaders = await getAuthHeaders();
  console.log('Auth headers:', authHeaders);
  
  // Get current lives
  const currentLives = await getCurrentLives(authHeaders);
  console.log('Current lives:', currentLives);
  
  // Scrape each URL
  for (const stream of currentLives) {
    const url = `https://www.whatnot.com/dashboard/live/${stream.id}`;
    await scrapeUrl(url);
  }
}

main();
```

## Using the API Client

A complete example is provided in `api-client.js`:

```bash
# Set environment variables
export CHROME_DEBUG_PORT=9222
export SELLER_ID=15647879

# Run the client
node api-client.js
```

## Extension Message API

The Chrome extension also supports direct messaging. See `background.js` for details:

### Get Auth Headers

```javascript
chrome.runtime.sendMessage(
  EXTENSION_ID,
  { type: 'get-auth-headers' },
  (response) => {
    console.log('Auth headers:', response.headers);
  }
);
```

### Scrape URL

```javascript
chrome.runtime.sendMessage(
  EXTENSION_ID,
  { type: 'scrape-url', url: 'https://www.whatnot.com/dashboard/live/...' },
  (response) => {
    console.log('Scrape result:', response);
  }
);
```

## Troubleshooting

### "Failed to extract cookies"

- Make sure Chrome is running with `--remote-debugging-port=9222`
- Make sure you're logged into Whatnot in Chrome
- Check that the bridge server can connect to Chrome

### Extension not responding

- Reload the extension in `chrome://extensions/`
- Check background script console for errors
- Make sure extension has necessary permissions (cookies, tabs)

### Cookies not found

- Navigate to Whatnot in Chrome and login
- Check that cookies exist: Open DevTools > Application > Cookies
- Try refreshing the page to ensure cookies are set

## Security Notes

⚠️ **Important**: 
- The bridge server exposes your browser cookies via HTTP
- Only run on localhost or secure network
- Don't expose the bridge server to the internet
- Consider adding authentication for production use

