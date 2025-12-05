/**
 * Content script for helper page
 * Bridges messages between extension background and helper page
 */

// Listen for messages from extension background (sent via chrome.tabs.sendMessage)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Helper Content] Received message from extension:', message);
  
  if (message.type === 'bridge-response') {
    console.log('[Helper Content] Forwarding bridge response to helper page');
    // Forward to helper page window
    window.postMessage({
      type: 'extension-bridge-response',
      requestId: message.requestId,
      data: message.data
    }, '*');
  }
  return true;
});

// Listen for messages from helper page
window.addEventListener('message', (event) => {
  // Only accept messages from same origin
  if (event.origin !== window.location.origin) return;
  
  if (event.data.type === 'extension-bridge-request') {
    console.log('[Helper Content] Received request from helper page:', event.data);
    
    // Forward to extension background
    chrome.runtime.sendMessage({
      type: event.data.action,
      requestId: event.data.requestId,
      url: event.data.url
    }, (response) => {
      console.log('[Helper Content] Got response from extension:', response);
      
      // Send response back to helper page
      if (response) {
        window.postMessage({
          type: 'extension-bridge-response',
          requestId: event.data.requestId,
          data: response
        }, '*');
      }
    });
  }
});

