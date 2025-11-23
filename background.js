/**
 * Whatnot Live Scraper - Background Service Worker
 * Provides debugging and extension lifecycle management
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

