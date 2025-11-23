/**
 * Whatnot Live Scraper - Content Script
 * Scrapes Gross Sales and Estimated Orders from Whatnot live dashboard
 */

(function() {
  'use strict';

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
    const allElements = Array.from(document.querySelectorAll('*'));
    return allElements.find(el => el.textContent.trim() === searchText) || null;
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
    if (!labelElement) return null;

    const valueElement = findValueElement(labelElement);
    if (!valueElement) return null;

    const valueText = valueElement.textContent || '';
    const parentText = labelElement.parentElement?.textContent || '';
    
    // Try parsing from value element or parent container
    return parseDollarAmount(valueText) || parseDollarAmount(parentText);
  }

  /**
   * Extract Estimated Orders value from the page
   * @returns {number|null} - Estimated orders count or null if not found
   */
  function extractEstimatedOrders() {
    const labelElement = findElementByText('Estimated Orders');
    if (!labelElement) return null;

    const valueElement = findValueElement(labelElement);
    if (!valueElement) return null;

    const valueText = valueElement.textContent || '';
    const parentText = labelElement.parentElement?.textContent || '';
    
    // Extract numeric value, excluding the label text
    const fullText = valueText !== labelElement.textContent 
      ? valueText 
      : parentText.replace(/Estimated Orders/gi, '').trim();
    
    return parseInteger(fullText);
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
    // Clear any existing interval
    if (monitoringInterval) {
      clearInterval(monitoringInterval);
    }

    // Initial scrape
    scrapeData();

    // Set up interval for periodic scraping
    monitoringInterval = setInterval(() => {
      scrapeData();
    }, SCRAPE_INTERVAL_MS);

    console.log(`[Whatnot Scraper] Extension loaded on ${window.location.href}`);
  }

  // Start monitoring when script loads
  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMonitoring);
  } else {
    startMonitoring();
  }

  // Handle page navigation (SPA behavior)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      // Restart monitoring if URL changed but still on live dashboard
      if (currentUrl.includes('/dashboard/live/')) {
        hasLoggedStartMessage = false;
        consecutiveFailures = 0;
        startMonitoring();
      }
    }
  }).observe(document, { subtree: true, childList: true });

})();

