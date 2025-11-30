/**
 * Whatnot Live Scraper - Background Service Worker
 * Provides debugging, extension lifecycle management, and external API
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Whatnot Scraper] Extension installed/reloaded');
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('/dashboard/live/')) {
    console.log('[Whatnot Scraper] Detected live dashboard page:', tab.url);
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'scraper-status') {
    console.log('[Whatnot Scraper] Status update from content script:', message);
  }
  return true;
});

/**
 * Extract authentication headers from Whatnot cookies
 * Returns cookies and headers needed for GraphQL API authentication
 */
async function extractAuthHeaders() {
  try {
    console.log('[Whatnot Scraper] Extracting auth headers from Whatnot cookies...');
    
    // Get all cookies for whatnot.com domain
    const cookies = await chrome.cookies.getAll({ domain: 'whatnot.com' });
    
    // Also get cookies for www.whatnot.com
    const wwwCookies = await chrome.cookies.getAll({ domain: '.whatnot.com' });
    
    // Combine and deduplicate cookies
    const allCookies = [...cookies, ...wwwCookies];
    const uniqueCookies = {};
    
    allCookies.forEach(cookie => {
      if (cookie.name) {
        uniqueCookies[cookie.name] = cookie.value;
      }
    });
    
    // Build Cookie header string
    const cookieHeader = Object.entries(uniqueCookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    
    // Look for common auth cookies
    const authCookies = {};
    const authCookieNames = ['session', 'token', 'auth', 'authorization', 'access_token', 'refresh_token', 'csrf'];
    
    authCookieNames.forEach(name => {
      if (uniqueCookies[name] || uniqueCookies[name.toUpperCase()]) {
        authCookies[name] = uniqueCookies[name] || uniqueCookies[name.toUpperCase()];
      }
    });
    
    // Find any cookie that looks like an auth token
    Object.entries(uniqueCookies).forEach(([name, value]) => {
      if (name.toLowerCase().includes('auth') || 
          name.toLowerCase().includes('token') ||
          name.toLowerCase().includes('session') ||
          name.toLowerCase().includes('csrf')) {
        authCookies[name] = value;
      }
    });
    
    console.log('[Whatnot Scraper] Found', Object.keys(uniqueCookies).length, 'cookies');
    console.log('[Whatnot Scraper] Auth cookies:', Object.keys(authCookies));
    
    return {
      cookieHeader: cookieHeader,
      cookies: uniqueCookies,
      authCookies: authCookies,
      headers: {
        'Cookie': cookieHeader,
        'Origin': 'https://www.whatnot.com',
        'Referer': 'https://www.whatnot.com/',
        'User-Agent': navigator.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    };
  } catch (error) {
    console.error('[Whatnot Scraper] Error extracting auth headers:', error);
    throw error;
  }
}

/**
 * Handle URL scraping request
 * Opens the URL in a new tab and starts scraping
 */
async function handleScrapeUrl(url) {
  try {
    console.log('[Whatnot Scraper] Received scrape request for URL:', url);
    
    // Validate URL
    if (!url || !url.includes('whatnot.com')) {
      throw new Error('Invalid URL: Must be a Whatnot URL');
    }
    
    // Normalize URL to dashboard format if needed
    let targetUrl = url;
    if (url.includes('/live/') && !url.includes('/dashboard/live/')) {
      const streamIdMatch = url.match(/\/live\/([\w-]+)/);
      if (streamIdMatch) {
        targetUrl = `https://www.whatnot.com/dashboard/live/${streamIdMatch[1]}`;
      }
    }
    
    // Check if tab already exists
    const existingTabs = await chrome.tabs.query({ url: targetUrl });
    
    let tab;
    if (existingTabs.length > 0) {
      // Use existing tab
      tab = existingTabs[0];
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.tabs.reload(tab.id);
    } else {
      // Create new tab
      tab = await chrome.tabs.create({ 
        url: targetUrl,
        active: true 
      });
    }
    
    // Wait for tab to load
    await new Promise((resolve) => {
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 30000);
    });
    
    // Wait a bit more for content script to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Send message to content script to start scraping
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'scrape-now',
        url: targetUrl
      });
    } catch (error) {
      console.warn('[Whatnot Scraper] Content script may still be loading:', error);
    }
    
    return {
      success: true,
      tabId: tab.id,
      url: targetUrl,
      message: 'Scraping started. Check console for data.'
    };
  } catch (error) {
    console.error('[Whatnot Scraper] Error handling scrape URL:', error);
    throw error;
  }
}

// Handle messages from any source (including helper page)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle bridge requests (from helper page)
  if (message.requestId && (message.type === 'get-auth-headers' || message.type === 'scrape-url')) {
    console.log('[Whatnot Scraper] Received bridge request:', message.type, message.requestId);
    const senderTabId = sender && sender.tab && sender.tab.id ? sender.tab.id : null;
    console.log('[Whatnot Scraper] Sender tab ID:', senderTabId);
    
    if (message.type === 'get-auth-headers') {
      // Get tab ID properly (async)
      const getTabId = () => {
        return new Promise((resolve) => {
          if (sender && sender.tab && sender.tab.id) {
            resolve(sender.tab.id);
            return;
          }
          chrome.tabs.query({ url: 'http://localhost:3001/helper*' }, (tabs) => {
            if (tabs && tabs.length > 0) {
              resolve(tabs[0].id);
            } else {
              resolve(null);
            }
          });
        });
      };
      
      getTabId().then(tabId => {
        extractAuthHeaders()
          .then(headers => {
            const response = { success: true, headers };
            console.log('[Whatnot Scraper] Extracted headers, sending to tab:', tabId);
            
            // Always send via tabs.sendMessage for bridge requests
            if (tabId) {
              chrome.tabs.sendMessage(tabId, {
                type: 'bridge-response',
                requestId: message.requestId,
                data: response
              }).then(() => {
                console.log('[Whatnot Scraper] Response sent successfully to tab');
              }).catch((err) => {
                console.error('[Whatnot Scraper] Error sending response to tab:', err);
              });
            } else {
              console.error('[Whatnot Scraper] No tab ID available to send response');
            }
            
            // Also try sendResponse in case it works
            try {
              sendResponse(response);
            } catch (e) {
              // Channel might be closed, that's OK
            }
          })
          .catch(error => {
            const response = { success: false, error: error.message };
            console.error('[Whatnot Scraper] Error extracting headers:', error);
            
            if (tabId) {
              chrome.tabs.sendMessage(tabId, {
                type: 'bridge-response',
                requestId: message.requestId,
                data: response
              }).catch((err) => {
                console.error('[Whatnot Scraper] Error sending error response:', err);
              });
            }
            
            try {
              sendResponse(response);
            } catch (e) {
              // Channel might be closed
            }
          });
      }).catch(error => {
        // Error getting tab ID
        console.error('[Whatnot Scraper] Error getting tab ID:', error);
        const response = { success: false, error: 'Failed to get tab ID: ' + error.message };
        try {
          sendResponse(response);
        } catch (e) {
          // Channel might be closed
        }
      });
      
      return true; // Keep channel open for async response
    }
    
    if (message.type === 'scrape-url') {
      handleScrapeUrl(message.url)
        .then(result => {
          const response = { success: true, result };
          if (sender && sender.tab && sender.tab.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
              type: 'bridge-response',
              requestId: message.requestId,
              data: response
            }).catch(() => {});
          }
          sendResponse(response);
        })
        .catch(error => {
          const response = { success: false, error: error.message };
          if (sender && sender.tab && sender.tab.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
              type: 'bridge-response',
              requestId: message.requestId,
              data: response
            }).catch(() => {});
          }
          sendResponse(response);
        });
      return true; // Keep channel open for async response
    }
  }
  
  // Handle ping for connection check
  if (message.type === 'ping' || (message.requestId && message.type === 'ping')) {
    sendResponse({ success: true, message: 'Extension is ready' });
    return true;
  }
  
  // Handle scraper-status messages
  if (message.type === 'scraper-status') {
    console.log('[Whatnot Scraper] Status update from content script:', message);
    return true;
  }
  
  return true;
});

// Handle external messages (for programmatic access)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  console.log('[Whatnot Scraper] Received external message:', message);
  
  if (message.type === 'get-auth-headers') {
    extractAuthHeaders()
      .then(headers => {
        sendResponse({ success: true, headers });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'scrape-url') {
    handleScrapeUrl(message.url)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }
  
  sendResponse({ success: false, error: 'Unknown message type' });
});

// Note: Message handling is consolidated above
