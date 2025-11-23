/**
 * Whatnot Live Scraper - Popup Script
 * Placeholder for Phase 1 - Full UI in Phase 3
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Check if we're on a live dashboard page
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url) {
      const isLivePage = tab.url.includes('/dashboard/live/');
      
      const statusDiv = document.createElement('div');
      statusDiv.style.marginTop = '10px';
      statusDiv.style.padding = '10px';
      statusDiv.style.fontSize = '12px';
      statusDiv.style.backgroundColor = isLivePage ? '#e8f5e9' : '#fff3cd';
      statusDiv.style.borderRadius = '4px';
      statusDiv.style.color = '#333';
      
      if (isLivePage) {
        statusDiv.innerHTML = `
          <strong>✅ Status: Active</strong><br>
          URL: ${tab.url}<br>
          <small>Check console for scraper logs (filter: "[Whatnot Scraper]")</small>
        `;
      } else {
        statusDiv.innerHTML = `
          <strong>⚠️ Status: Inactive</strong><br>
          This extension only works on:<br>
          <code>whatnot.com/dashboard/live/*</code><br>
          <small>Current: ${tab.url}</small>
        `;
      }
      
      const infoDiv = document.querySelector('.info');
      if (infoDiv) {
        infoDiv.appendChild(statusDiv);
      }
    }
  } catch (error) {
    console.error('Error checking tab:', error);
  }
});
