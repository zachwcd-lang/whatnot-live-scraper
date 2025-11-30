/**
 * Bridge Server - Connects HTTP POST requests to Chrome Extension
 * 
 * Uses Chrome DevTools Protocol to communicate with Chrome browser
 * and extract cookies/headers from the browser session.
 */

const http = require('http');
const CDP = require('chrome-remote-interface');

const PORT = process.env.PORT || 3001;
const CHROME_DEBUG_PORT = process.env.CHROME_DEBUG_PORT || 9222;

/**
 * Extract cookies from Chrome using CDP
 */
async function extractCookiesFromChrome() {
  let client;
  try {
    // Connect to Chrome via CDP
    client = await CDP({ port: CHROME_DEBUG_PORT });
    const { Network, Page, Runtime } = client;
    
    await Page.enable();
    await Network.enable();
    
    // Get cookies for whatnot.com
    const cookies = await Network.getCookies({ 
      urls: ['https://www.whatnot.com', 'https://whatnot.com'] 
    });
    
    // Build cookie header
    const cookieHeader = cookies.cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
    
    // Build cookies object
    const cookiesObj = {};
    cookies.cookies.forEach(cookie => {
      cookiesObj[cookie.name] = cookie.value;
    });
    
    await client.close();
    
    return {
      cookieHeader,
      cookies: cookiesObj,
      headers: {
        'Cookie': cookieHeader,
        'Origin': 'https://www.whatnot.com',
        'Referer': 'https://www.whatnot.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };
  } catch (error) {
    if (client) await client.close();
    console.error('[Bridge] Error extracting cookies:', error.message);
    throw new Error(`Failed to extract cookies. Make sure Chrome is running with remote debugging: chrome --remote-debugging-port=${CHROME_DEBUG_PORT}`);
  }
}

/**
 * Start HTTP server
 */
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const { action, url } = data;

      if (action === 'get-auth-headers') {
        console.log('[Bridge] Request: Extract auth headers');
        const headers = await extractCookiesFromChrome();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, headers }));
      } else if (action === 'scrape-url') {
        console.log('[Bridge] Request: Scrape URL:', url);
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'URL is required' }));
          return;
        }
        
        // For scraping, we'll return instructions
        // In production, you'd want to use Chrome Extension messaging
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Use Chrome Extension to scrape URL',
          url: url
        }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid action. Use "get-auth-headers" or "scrape-url"' }));
      }
    } catch (error) {
      console.error('[Bridge] Error processing request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`🌐 Bridge server running on http://localhost:${PORT}`);
  console.log(`📡 Ready to accept requests from external services`);
  console.log(`\n⚠️  IMPORTANT: Chrome must be running with remote debugging enabled:`);
  console.log(`   chrome --remote-debugging-port=${CHROME_DEBUG_PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  POST /`);
  console.log(`    Action: "get-auth-headers" - Extract cookies/headers from browser`);
  console.log(`    Action: "scrape-url" - Send URL to extension (requires extension messaging)`);
  console.log(`\nExample:`);
  console.log(`  curl -X POST http://localhost:${PORT} \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"action": "get-auth-headers"}'`);
});

module.exports = { server };
