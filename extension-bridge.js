/**
 * Extension Bridge - Communicates directly with Chrome Extension
 * 
 * This script provides HTTP endpoints that communicate with the Chrome extension
 * via a helper HTML page. No CDP needed!
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;

// Store for pending requests (waiting for extension response)
const pendingRequests = new Map();
let requestIdCounter = 0;

/**
 * Serve the helper HTML page that bridges HTTP <-> Extension messaging
 */
function serveHelperPage(res) {
  const htmlPath = path.join(__dirname, 'extension-helper.html');
  
  if (!fs.existsSync(htmlPath)) {
    // Generate helper page on the fly
    const helperHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Extension Bridge Helper</title>
</head>
<body>
  <h1>Extension Bridge Helper</h1>
  <p>This page bridges HTTP requests to Chrome Extension.</p>
  <p>Keep this page open in Chrome.</p>
  <div id="status">Waiting for requests...</div>
  <div id="results"></div>
  
  <script>
    const EXTENSION_ID = localStorage.getItem('extensionId') || prompt('Enter Chrome Extension ID:');
    if (EXTENSION_ID && !localStorage.getItem('extensionId')) {
      localStorage.setItem('extensionId', EXTENSION_ID);
    }
    
    const bridgeUrl = 'http://localhost:${PORT}';
    
    // Listen for messages from extension
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'bridge-response') {
        const requestId = message.requestId;
        // Send response back to bridge server
        fetch(\`\${bridgeUrl}/response/\${requestId}\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.data)
        }).catch(console.error);
      }
      return true;
    });
    
    // Poll bridge server for requests
    async function pollForRequests() {
      try {
        const response = await fetch(\`\${bridgeUrl}/poll\`);
        const data = await response.json();
        
        if (data.requestId && data.action) {
          console.log('Received request:', data);
          document.getElementById('status').textContent = \`Processing: \${data.action}\`;
          
          // Forward to extension
          chrome.runtime.sendMessage(EXTENSION_ID, {
            type: data.action,
            requestId: data.requestId,
            ...data
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('Extension error:', chrome.runtime.lastError);
              document.getElementById('status').textContent = 'Error: ' + chrome.runtime.lastError.message;
            }
          });
        }
      } catch (error) {
        // No new requests, continue polling
      }
      
      setTimeout(pollForRequests, 500);
    }
    
    pollForRequests();
    document.getElementById('status').textContent = 'Bridge active. Extension ID: ' + EXTENSION_ID;
  </script>
</body>
</html>`;
    
    fs.writeFileSync(htmlPath, helperHtml);
  }
  
  const html = fs.readFileSync(htmlPath, 'utf-8');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

/**
 * Start HTTP server
 */
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve helper page
  if (req.url === '/helper' || req.url === '/') {
    serveHelperPage(res);
    return;
  }

  // Handle response from extension (via helper page)
  if (req.url.startsWith('/response/')) {
    const requestId = req.url.split('/response/')[1];
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      const data = JSON.parse(body);
      const pending = pendingRequests.get(requestId);
      
      if (pending) {
        pendingRequests.delete(requestId);
        pending.res.writeHead(200, { 'Content-Type': 'application/json' });
        pending.res.end(JSON.stringify(data));
      }
    });
    return;
  }

  // Handle polling from helper page
  if (req.url === '/poll') {
    // Check for pending requests
    const pending = Array.from(pendingRequests.values()).find(r => !r.fulfilled);
    
    if (pending) {
      pending.fulfilled = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        requestId: pending.requestId,
        action: pending.action,
        ...pending.data
      }));
      return;
    }
    
    // No pending requests
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({}));
    return;
  }

  // Handle API requests
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { action, url } = data;
        
        // Create pending request
        const requestId = `req_${++requestIdCounter}_${Date.now()}`;
        const pending = {
          requestId,
          action,
          data: { url },
          res: res,
          fulfilled: false
        };
        
        pendingRequests.set(requestId, pending);
        
        console.log(`[Bridge] Received ${action} request, ID: ${requestId}`);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              error: 'Request timeout. Make sure helper page is open in Chrome.' 
            }));
          }
        }, 30000);
        
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🌐 Extension Bridge Server running on http://localhost:${PORT}`);
  console.log(`\n📋 SETUP INSTRUCTIONS:`);
  console.log(`   1. Open http://localhost:${PORT}/helper in Chrome`);
  console.log(`   2. Enter your Chrome Extension ID when prompted`);
  console.log(`   3. Keep that tab open - it bridges requests to the extension`);
  console.log(`\n📡 API Endpoint: POST http://localhost:${PORT}/api`);
  console.log(`\nExample:`);
  console.log(`   curl -X POST http://localhost:${PORT}/api \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"action": "get-auth-headers"}'`);
});

module.exports = { server };

