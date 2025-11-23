/**
 * Whatnot Live Scraper - Content Script
 * Scrapes Gross Sales and Estimated Orders from Whatnot live dashboard
 */

(function() {
  'use strict';

  // Immediate log to confirm script loaded - try multiple methods
  console.log('[Whatnot Scraper] Content script initialized');
  console.warn('[Whatnot Scraper] Content script loaded at', new Date().toISOString());
  console.error('[Whatnot Scraper] TEST - If you see this, the script is running');
  
  // Create a visible DOM element to confirm script loaded
  try {
    const testDiv = document.createElement('div');
    testDiv.id = 'whatnot-scraper-test';
    testDiv.style.cssText = 'position:fixed;top:10px;right:10px;background:red;color:white;padding:10px;z-index:99999;font-family:monospace;font-size:12px;border:2px solid black;';
    testDiv.textContent = '[Whatnot Scraper] LOADED - Check console!';
    document.body.appendChild(testDiv);
    
    // Remove after 5 seconds
    setTimeout(() => {
      if (testDiv.parentNode) {
        testDiv.parentNode.removeChild(testDiv);
      }
    }, 5000);
  } catch (e) {
    console.error('[Whatnot Scraper] Could not create test element:', e);
  }

  const SCRAPE_INTERVAL_MS = 30000; // 30 seconds
  let monitoringInterval = null;
  let consecutiveFailures = 0;
  let hasLoggedStartMessage = false;

  /**
   * Find an element by its exact text content
   * @param {string} searchText - The exact text to search for
   * @returns {HTMLElement|null} - The found element or null
   */
  function findElementByText(searchText) {
    try {
      const allElements = Array.from(document.querySelectorAll('*'));
      const found = allElements.find(el => {
        const text = el.textContent || '';
        return text.trim() === searchText;
      });
      return found || null;
    } catch (error) {
      console.error('[Whatnot Scraper] Error finding element by text:', error);
      return null;
    }
  }

  /**
   * Extract dollar amount from text, converting to float
   * @param {string} text - Text containing dollar amount
   * @returns {number|null} - Parsed dollar amount or null
   */
  function parseDollarAmount(text) {
    if (!text) return null;
    
    // Match dollar amounts like $992.00, $1,810.00
    const match = text.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?/);
    if (!match) return null;
    
    // Strip $ and commas, convert to float
    const cleaned = match[0].replace(/[$,]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Extract numeric value from text, converting to integer
   * @param {string} text - Text containing number
   * @returns {number|null} - Parsed integer or null
   */
  function parseInteger(text) {
    if (!text) return null;
    
    // Match first sequence of digits
    const match = text.match(/\d+/);
    if (!match) return null;
    
    const parsed = parseInt(match[0], 10);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Find value element near a label element using multiple traversal strategies
   * @param {HTMLElement} labelElement - The element containing the label text
   * @returns {HTMLElement|null} - The element containing the value or null
   */
  function findValueElement(labelElement) {
    if (!labelElement) return null;

    const parent = labelElement.parentElement;
    
    // Strategy 1: Search in parent for value patterns (dollar amounts or numbers in siblings)
    if (parent) {
      // Check if parent contains value (both label and value in same container)
      const parentText = parent.textContent || '';
      if (parentText !== labelElement.textContent) {
        // Parent likely contains both label and value
        return parent;
      }
      
      // Search parent's children (siblings) for elements containing value patterns
      const siblings = Array.from(parent.children);
      for (const sibling of siblings) {
        if (sibling !== labelElement) {
          const siblingText = sibling.textContent || '';
          // Check if sibling contains dollar amount or numeric value
          if (/\$[\d,]+\.?\d*/.test(siblingText) || /^\d+$/.test(siblingText.trim())) {
            return sibling;
          }
          // If sibling has text content, it might contain the value
          if (siblingText.trim() && !siblingText.includes('Gross Sales') && !siblingText.includes('Estimated Orders')) {
            return sibling;
          }
        }
      }
    }

    // Strategy 2: Check next sibling
    let nextSibling = labelElement.nextElementSibling;
    while (nextSibling) {
      if (nextSibling.textContent.trim()) {
        return nextSibling;
      }
      nextSibling = nextSibling.nextElementSibling;
    }

    // Strategy 3: Check parent's next sibling
    if (parent) {
      let parentSibling = parent.nextElementSibling;
      while (parentSibling) {
        if (parentSibling.textContent.trim()) {
          return parentSibling;
        }
        parentSibling = parentSibling.nextElementSibling;
      }
    }

    return null;
  }

  /**
   * Extract Gross Sales value from the page
   * @returns {number|null} - Gross sales amount or null if not found
   */
  function extractGrossSales() {
    const labelElement = findElementByText('Gross Sales');
    if (!labelElement) {
      // Debug: Try to find similar text
      const allText = Array.from(document.querySelectorAll('*'))
        .map(el => el.textContent?.trim())
        .filter(text => text && (text.includes('Gross') || text.includes('Sales')))
        .slice(0, 5);
      if (allText.length > 0) {
        console.log('[Whatnot Scraper] Debug: Found text containing "Gross" or "Sales":', allText);
      }
      return null;
    }

    const valueElement = findValueElement(labelElement);
    if (!valueElement) {
      console.log('[Whatnot Scraper] Debug: Found Gross Sales label but no value element nearby');
      return null;
    }

    const valueText = valueElement.textContent || '';
    const parentText = labelElement.parentElement?.textContent || '';
    
    // Try parsing from value element or parent container
    const result = parseDollarAmount(valueText) || parseDollarAmount(parentText);
    if (result === null) {
      console.log('[Whatnot Scraper] Debug: Could not parse dollar amount from:', { valueText: valueText.substring(0, 50), parentText: parentText.substring(0, 100) });
    }
    return result;
  }

  /**
   * Extract Estimated Orders value from the page
   * @returns {number|null} - Estimated orders count or null if not found
   */
  function extractEstimatedOrders() {
    const labelElement = findElementByText('Estimated Orders');
    if (!labelElement) {
      // Debug: Try to find similar text
      const allText = Array.from(document.querySelectorAll('*'))
        .map(el => el.textContent?.trim())
        .filter(text => text && (text.includes('Estimated') || text.includes('Orders')))
        .slice(0, 5);
      if (allText.length > 0) {
        console.log('[Whatnot Scraper] Debug: Found text containing "Estimated" or "Orders":', allText);
      }
      return null;
    }

    const valueElement = findValueElement(labelElement);
    if (!valueElement) {
      console.log('[Whatnot Scraper] Debug: Found Estimated Orders label but no value element nearby');
      return null;
    }

    const valueText = valueElement.textContent || '';
    const parentText = labelElement.parentElement?.textContent || '';
    
    // Extract numeric value, excluding the label text
    const fullText = valueText !== labelElement.textContent 
      ? valueText 
      : parentText.replace(/Estimated Orders/gi, '').trim();
    
    const result = parseInteger(fullText);
    if (result === null) {
      console.log('[Whatnot Scraper] Debug: Could not parse integer from:', { valueText: valueText.substring(0, 50), parentText: parentText.substring(0, 100) });
    }
    return result;
  }

  /**
   * Scrape data from the page and log it
   * @returns {Object|null} - Scraped data object or null if scrape failed
   */
  function scrapeData() {
    const grossSales = extractGrossSales();
    const estimatedOrders = extractEstimatedOrders();

    // Check if both values were found
    if (grossSales === null && estimatedOrders === null) {
      consecutiveFailures++;
      
      if (consecutiveFailures >= 5) {
        console.error('[Whatnot Scraper] Unable to locate elements after 5 attempts. Page structure may have changed.');
      } else {
        const timestamp = new Date().toISOString();
        console.warn(`[Whatnot Scraper] Could not find Gross Sales/Estimated Orders elements at ${timestamp}`);
      }
      
      return null;
    }

    // Log warning if only one value found
    if (grossSales === null) {
      console.warn('[Whatnot Scraper] Could not find Gross Sales element');
    }
    if (estimatedOrders === null) {
      console.warn('[Whatnot Scraper] Could not find Estimated Orders element');
    }

    // Reset failure counter on successful scrape
    if (grossSales !== null || estimatedOrders !== null) {
      consecutiveFailures = 0;
    }

    // Log start message on first successful scrape
    if (!hasLoggedStartMessage && (grossSales !== null || estimatedOrders !== null)) {
      console.log(`[Whatnot Scraper] Monitoring started successfully. Scraping every ${SCRAPE_INTERVAL_MS / 1000} seconds.`);
      hasLoggedStartMessage = true;
    }

    // Prepare data object
    const data = {
      timestamp: new Date().toISOString(),
      grossSales: grossSales,
      estimatedOrders: estimatedOrders,
      streamUrl: window.location.href
    };

    // Log successful scrape
    console.log('[Whatnot Scraper] Scraped data:', data);

    return data;
  }

  /**
   * Start monitoring the page at regular intervals
   */
  function startMonitoring() {
    try {
      console.log(`[Whatnot Scraper] Starting monitoring on ${window.location.href}`);
      
      // Clear any existing interval
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
      }

      // Initial scrape after a short delay to ensure DOM is ready
      setTimeout(() => {
        scrapeData();
      }, 1000);

      // Set up interval for periodic scraping
      monitoringInterval = setInterval(() => {
        scrapeData();
      }, SCRAPE_INTERVAL_MS);

      console.log(`[Whatnot Scraper] Monitoring interval set to ${SCRAPE_INTERVAL_MS / 1000} seconds`);
    } catch (error) {
      console.error('[Whatnot Scraper] Error in startMonitoring:', error);
    }
  }

  // Start monitoring when script loads
  // Wait for page to be fully loaded, but also try immediately for SPAs
  function initialize() {
    try {
      if (document.readyState === 'loading') {
        console.log('[Whatnot Scraper] Waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', startMonitoring);
      } else {
        console.log('[Whatnot Scraper] DOM already loaded, starting immediately');
        startMonitoring();
      }

      // Also try after page has had time to render (for React/Vue apps)
      setTimeout(() => {
        if (!hasLoggedStartMessage) {
          console.log('[Whatnot Scraper] Attempting delayed initialization for SPA...');
          scrapeData();
        }
      }, 3000);
    } catch (error) {
      console.error('[Whatnot Scraper] Error in initialize:', error);
    }
  }

  initialize();

  // Handle page navigation (SPA behavior)
  let lastUrl = location.href;
  try {
    new MutationObserver(() => {
      try {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
          console.log(`[Whatnot Scraper] URL changed: ${lastUrl} -> ${currentUrl}`);
          lastUrl = currentUrl;
          // Restart monitoring if URL changed but still on live dashboard
          if (currentUrl.includes('/dashboard/live/')) {
            console.log('[Whatnot Scraper] Restarting monitoring for new live dashboard page');
            hasLoggedStartMessage = false;
            consecutiveFailures = 0;
            startMonitoring();
          }
        }
      } catch (error) {
        console.error('[Whatnot Scraper] Error in MutationObserver callback:', error);
      }
    }).observe(document, { subtree: true, childList: true });
  } catch (error) {
    console.error('[Whatnot Scraper] Error setting up MutationObserver:', error);
  }

  console.log('[Whatnot Scraper] Content script setup complete');

})();

