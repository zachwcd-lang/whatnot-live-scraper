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

  // Setup URL scraping functionality
  setupUrlScraping();
});

/**
 * Setup URL scraping functionality
 */
async function setupUrlScraping() {
  const urlInput = document.getElementById('url-input');
  const scrapeButton = document.getElementById('scrape-url');
  const urlStatus = document.getElementById('url-status');

  if (!urlInput || !scrapeButton || !urlStatus) {
    return;
  }

  // Validate Whatnot URL
  function isValidWhatnotUrl(url) {
    if (!url) return false;
    const whatnotPattern = /^https?:\/\/(www\.)?whatnot\.com\/(dashboard\/)?live\/[\w-]+/i;
    return whatnotPattern.test(url.trim());
  }

  // Show status message
  function showStatus(message, isError = false) {
    urlStatus.style.display = 'block';
    urlStatus.style.backgroundColor = isError ? '#ffebee' : '#e8f5e9';
    urlStatus.style.color = isError ? '#c62828' : '#2e7d32';
    urlStatus.textContent = message;
    
    if (!isError) {
      setTimeout(() => {
        urlStatus.style.display = 'none';
      }, 5000);
    }
  }

  scrapeButton.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    
    if (!url) {
      showStatus('❌ Please enter a URL', true);
      return;
    }

    if (!isValidWhatnotUrl(url)) {
      showStatus('❌ Invalid Whatnot URL. Must be a live dashboard URL.', true);
      return;
    }

    try {
      showStatus('⏳ Opening URL and scraping...', false);
      scrapeButton.disabled = true;

      // Normalize URL to dashboard format if needed
      let targetUrl = url;
      if (url.includes('/live/') && !url.includes('/dashboard/live/')) {
        const streamIdMatch = url.match(/\/live\/([\w-]+)/);
        if (streamIdMatch) {
          targetUrl = `https://www.whatnot.com/dashboard/live/${streamIdMatch[1]}`;
        }
      }

      // Open the URL in a new tab or use existing
      let tab;
      const existingTabs = await chrome.tabs.query({ url: targetUrl });
      
      if (existingTabs.length > 0) {
        // Use existing tab
        tab = existingTabs[0];
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.tabs.reload(tab.id);
      } else {
        // Create new tab
        tab = await chrome.tabs.create({ url: targetUrl, active: true });
      }

      // Wait for tab to load
      await waitForTabLoad(tab.id);

      // Wait a bit more for content script to initialize
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Send message to content script to scrape once
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'scrape-now',
          url: targetUrl
        });

        if (response && response.success) {
          showStatus(`✅ Scraping started on: ${targetUrl.substring(0, 50)}...`);
          // Show data in console log
          if (response.data) {
            console.log('[Whatnot Scraper] Scraped data:', response.data);
          }
        } else {
          showStatus('⚠️ Content script may still be loading. Check console for data.', false);
        }
      } catch (msgError) {
        // Content script might not be ready yet, but it will auto-start
        showStatus('✅ Tab opened. Scraping will start automatically (check console).', false);
      }

      // Close popup after a delay
      setTimeout(() => {
        window.close();
      }, 2000);

    } catch (error) {
      console.error('Error scraping URL:', error);
      showStatus(`❌ Error: ${error.message}`, true);
    } finally {
      scrapeButton.disabled = false;
    }
  });
}

/**
 * Wait for tab to finish loading
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // Resolve anyway to not hang
    }, 30000);
  });
}

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
