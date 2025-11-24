/**
 * Whatnot Live Scraper - Popup Script
 * Popup UI with settings and status
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Load and display current scrape interval
  await loadAndDisplayInterval();

  // Setup interval save button
  const saveButton = document.getElementById('save-interval');
  const intervalInput = document.getElementById('scrape-interval');
  
  if (saveButton && intervalInput) {
    saveButton.addEventListener('click', async () => {
      const interval = parseInt(intervalInput.value, 10);
      
      if (isNaN(interval) || interval < 10 || interval > 300) {
        alert('Please enter a value between 10 and 300 seconds');
        return;
      }

      try {
        await chrome.storage.sync.set({ scrapeInterval: interval * 1000 }); // Store in milliseconds
        document.getElementById('current-interval').textContent = interval;
        
        // Show success message
        const statusMsg = document.createElement('div');
        statusMsg.style.cssText = 'margin-top: 10px; padding: 8px; background: #4caf50; color: white; border-radius: 4px; font-size: 12px;';
        statusMsg.textContent = `✅ Interval saved! Extension will use ${interval} seconds on next scrape.`;
        saveButton.parentElement.appendChild(statusMsg);
        
        setTimeout(() => {
          statusMsg.remove();
        }, 3000);
      } catch (error) {
        console.error('Error saving interval:', error);
        alert('Error saving interval. Please try again.');
      }
    });
  }

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
          URL: ${tab.url.substring(0, 60)}...<br>
          <small>Check console for scraper logs (filter: "[Whatnot Scraper]")</small>
        `;
      } else {
        statusDiv.innerHTML = `
          <strong>⚠️ Status: Inactive</strong><br>
          This extension only works on:<br>
          <code>whatnot.com/dashboard/live/*</code><br>
          <small>Current: ${tab.url.substring(0, 50)}...</small>
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

/**
 * Load current scrape interval from storage and display it
 */
async function loadAndDisplayInterval() {
  try {
    const result = await chrome.storage.sync.get(['scrapeInterval']);
    const intervalMs = result.scrapeInterval || 60000; // Default 60 seconds
    const intervalSeconds = intervalMs / 1000;
    
    const intervalInput = document.getElementById('scrape-interval');
    const currentIntervalSpan = document.getElementById('current-interval');
    
    if (intervalInput) {
      intervalInput.value = intervalSeconds;
    }
    
    if (currentIntervalSpan) {
      currentIntervalSpan.textContent = intervalSeconds;
    }
  } catch (error) {
    console.error('Error loading interval:', error);
  }
}
