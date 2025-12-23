/**
 * Whatnot Live Scraper - Content Script
 * Scrapes Gross Sales and Estimated Orders from Whatnot live dashboard
 */

(function() {
  'use strict';

  // Log script initialization
  console.log('[Whatnot Scraper] Content script initialized');

  const DEFAULT_SCRAPE_INTERVAL_MS = 120000; // 2 minutes (120 seconds)
  const SUPABASE_URL = 'https://vvgjyvkjptgydqqwzked.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2Z2p5dmtqcHRneWRxcXd6a2VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2NTczMjYsImV4cCI6MjA4MDIzMzMyNn0.VRV0ALCml7uKU2VkbvXngUbIalCRfNCjDz5R3hMmTBU';
  const ENABLE_DATA_TRANSMISSION = true; // Feature flag to enable/disable data transmission
  const MAX_RETRY_ATTEMPTS = 3;
  const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff delays in ms
  
  let monitoringInterval = null;
  let consecutiveFailures = 0;
  let hasLoggedStartMessage = false;
  let currentScrapeInterval = DEFAULT_SCRAPE_INTERVAL_MS;
  let finalDataSent = false; // Track if final data has been sent after stream end
  let lastGrossSales = null;
  let lastEstimatedOrders = null;
  let staleCount = 0;

  /**
   * Extract stream ID from any Whatnot URL format
   * Handles both public links (/live/...) and dashboard links (/dashboard/live/...)
   * @param {string} url - The URL to extract stream ID from
   * @returns {string|null} - The stream ID or null if not found
   */
  function getStreamId(url) {
    if (!url) return null;
    
    // Match stream ID from either /live/{id} or /dashboard/live/{id}
    const match = url.match(/\/(?:live|dashboard\/live)\/([\w-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Normalize stream ID to standard dashboard URL format
   * @param {string} streamId - The stream ID to normalize
   * @returns {string} - Normalized dashboard URL
   */
  function normalizeToDashboardUrl(streamId) {
    if (!streamId) return null;
    return `https://www.whatnot.com/dashboard/live/${streamId}`;
  }

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
   * Uses multiple strategies to find the value, especially for ended streams
   * @returns {number|null} - Gross sales amount or null if not found
   */
  function extractGrossSales() {
    // Strategy 1: Find label and traverse DOM
    const labelElement = findElementByText('Gross Sales');
    if (labelElement) {
      const valueElement = findValueElement(labelElement);
      if (valueElement) {
        const valueText = valueElement.textContent || '';
        const parsed = parseDollarAmount(valueText);
        if (parsed !== null) return parsed;
      }
      
      // Try parent container text
      const parentText = labelElement.parentElement?.textContent || '';
      const parsed = parseDollarAmount(parentText);
      if (parsed !== null) return parsed;
      
      // Try grandparent container text
      const grandparentText = labelElement.parentElement?.parentElement?.textContent || '';
      const parsed2 = parseDollarAmount(grandparentText);
      if (parsed2 !== null) return parsed2;
    }
    
    // Strategy 2: Search entire page for "Gross Sales" followed by dollar amount
    try {
      const allElements = Array.from(document.querySelectorAll('*'));
      for (const el of allElements) {
        const text = el.textContent || '';
        if (text.includes('Gross Sales')) {
          // Look for dollar amount in this element or nearby
          const dollarMatch = text.match(/Gross Sales[:\s]*\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
          if (dollarMatch) {
            const cleaned = dollarMatch[1].replace(/,/g, '');
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed)) return parsed;
          }
        }
      }
    } catch (error) {
      console.error('[Whatnot Scraper] Error in fallback Gross Sales extraction:', error);
    }
    
    return null;
  }

  /**
   * Extract Estimated Orders value from the page
   * Uses multiple strategies to find the value, especially for ended streams
   * @returns {number|null} - Estimated orders count or null if not found
   */
  function extractEstimatedOrders() {
    // Strategy 1: Find label and traverse DOM
    const labelElement = findElementByText('Estimated Orders');
    if (labelElement) {
      const valueElement = findValueElement(labelElement);
      if (valueElement) {
        const valueText = valueElement.textContent || '';
        // Try to extract number from value text
        const parsed = parseInteger(valueText);
        if (parsed !== null && valueText !== labelElement.textContent) return parsed;
      }
      
      // Try parent container text
      const parentText = labelElement.parentElement?.textContent || '';
      const cleanedParentText = parentText.replace(/Estimated Orders/gi, '').trim();
      const parsed = parseInteger(cleanedParentText);
      if (parsed !== null) return parsed;
      
      // Try grandparent container text
      const grandparentText = labelElement.parentElement?.parentElement?.textContent || '';
      const cleanedGrandparentText = grandparentText.replace(/Estimated Orders/gi, '').trim();
      const parsed2 = parseInteger(cleanedGrandparentText);
      if (parsed2 !== null) return parsed2;
    }
    
    // Strategy 2: Search entire page for "Estimated Orders" followed by number
    try {
      const allElements = Array.from(document.querySelectorAll('*'));
      for (const el of allElements) {
        const text = el.textContent || '';
        if (text.includes('Estimated Orders')) {
          // Look for number after "Estimated Orders"
          const numberMatch = text.match(/Estimated Orders[:\s]*(\d+)/i);
          if (numberMatch) {
            const parsed = parseInt(numberMatch[1], 10);
            if (!isNaN(parsed)) return parsed;
          }
        }
      }
    } catch (error) {
      console.error('[Whatnot Scraper] Error in fallback Estimated Orders extraction:', error);
    }
    
    return null;
  }

  /**
   * Extract Tips value from the page
   * Looks for Tips in the stats section (same area as Gross Sales and Estimated Orders)
   * Avoids matching tip buttons ($1, $5, $10) by finding the stats container first
   * @returns {number|null} - Tips amount or null if not found
   */
  function extractTips() {
    try {
      const allElements = Array.from(document.querySelectorAll('*'));

      // Strategy 1: Find the stats container by locating "Gross Sales" first
      // Then look for Tips value in the same container
      const grossSalesElement = allElements.find(el => {
        const text = el.textContent || '';
        return text.trim() === 'Gross Sales';
      });

      if (grossSalesElement) {
        // Walk up the DOM to find a container that includes Gross Sales, Estimated Orders, AND Tips
        let container = grossSalesElement.parentElement;
        let depth = 0;

        while (container && depth < 8) {
          const containerText = container.textContent || '';

          // Check if this container has all three stats - this is the stats section
          if (containerText.includes('Gross Sales') &&
              containerText.includes('Estimated Orders') &&
              containerText.includes('Tips')) {

            // Find "Tips" label within this stats container
            const containerChildren = Array.from(container.querySelectorAll('*'));
            const tipsLabelInStats = containerChildren.find(el => {
              const text = el.textContent || '';
              return text.trim() === 'Tips';
            });

            if (tipsLabelInStats) {
              // Look for dollar amount in parent/siblings of the Tips label
              const parent = tipsLabelInStats.parentElement;
              if (parent) {
                const parentText = parent.textContent || '';
                // Extract dollar amount from parent (contains both "Tips" and value)
                const dollarMatch = parentText.match(/\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
                if (dollarMatch) {
                  const cleaned = dollarMatch[1].replace(/,/g, '');
                  const parsed = parseFloat(cleaned);
                  if (!isNaN(parsed)) {
                    console.log('[Whatnot Scraper] Found Tips in stats container:', parsed);
                    return parsed;
                  }
                }

                // Try grandparent if parent didn't have the value
                const grandparent = parent.parentElement;
                if (grandparent) {
                  const gpText = grandparent.textContent || '';
                  // Look for "Tips" followed by dollar amount specifically
                  const tipsMatch = gpText.match(/Tips[:\s]*\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
                  if (tipsMatch) {
                    const cleaned = tipsMatch[1].replace(/,/g, '');
                    const parsed = parseFloat(cleaned);
                    if (!isNaN(parsed)) {
                      console.log('[Whatnot Scraper] Found Tips via grandparent:', parsed);
                      return parsed;
                    }
                  }
                }
              }
            }

            // Fallback: Search container text for "Tips$X.XX" pattern
            const tipsMatch = containerText.match(/Tips[:\s]*\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/i);
            if (tipsMatch) {
              const cleaned = tipsMatch[1].replace(/,/g, '');
              const parsed = parseFloat(cleaned);
              if (!isNaN(parsed)) {
                console.log('[Whatnot Scraper] Found Tips via container pattern:', parsed);
                return parsed;
              }
            }

            break; // Found the stats container, stop walking up
          }

          container = container.parentElement;
          depth++;
        }
      }

      // Strategy 2: Search for elements containing all three stats together
      // This catches cases where Strategy 1 missed
      for (const el of allElements) {
        const text = el.textContent || '';

        // Must contain all three stat labels to be the stats section
        if (text.includes('Gross Sales') &&
            text.includes('Estimated Orders') &&
            text.includes('Tips')) {

          // Look for Tips followed by dollar amount
          const tipsMatch = text.match(/Tips[:\s]*\$(\d{1,3}(?:,\d{3})*\.\d{2})/i);
          if (tipsMatch) {
            const cleaned = tipsMatch[1].replace(/,/g, '');
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed)) {
              console.log('[Whatnot Scraper] Found Tips in stats section:', parsed);
              return parsed;
            }
          }

          // Check for $0.00 tips
          const zeroMatch = text.match(/Tips[:\s]*\$0(?:\.00)?/i);
          if (zeroMatch) {
            console.log('[Whatnot Scraper] Found Tips = $0');
            return 0;
          }
        }
      }

      console.log('[Whatnot Scraper] Could not find Tips in stats section');
      return null;

    } catch (error) {
      console.error('[Whatnot Scraper] Error extracting Tips:', error);
      return null;
    }
  }

  /**
   * Extract Show Time counter from the page
   * Parses the elapsed stream time (format: HH:MM:SS or MM:SS)
   * @returns {number|null} - Hours streamed as decimal rounded to 2 decimals (e.g., 2.26 for 2h 15m 30s) or null if not found
   */
  function extractShowTime() {
    try {
      // Look for "Show Time:" text in the page
      const allElements = document.querySelectorAll('div, span, p');
      
      for (const element of allElements) {
        const text = element.textContent.trim();
        
        // Check if element contains "Show Time:"
        if (text.includes('Show Time:')) {
          console.log('[Whatnot Scraper] Found Show Time element:', text);
          
          // Try to match HH:MM:SS format
          let match = text.match(/(\d{1,2}):(\d{2}):(\d{2})/);
          if (match) {
            const hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            const seconds = parseInt(match[3]);
            const totalHours = hours + (minutes / 60) + (seconds / 3600);
            console.log('[Whatnot Scraper] Parsed Show Time (HH:MM:SS):', totalHours.toFixed(2), 'hours');
            return Math.round(totalHours * 100) / 100; // Round to 2 decimals
          }
          
          // Try to match MM:SS format (streams under 1 hour)
          match = text.match(/(\d{1,2}):(\d{2})/);
          if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const totalHours = (minutes / 60) + (seconds / 3600);
            console.log('[Whatnot Scraper] Parsed Show Time (MM:SS):', totalHours.toFixed(2), 'hours');
            return Math.round(totalHours * 100) / 100; // Round to 2 decimals
          }
        }
      }
      
      console.log('[Whatnot Scraper] Warning: Could not find Show Time counter');
      return null;
    } catch (error) {
      console.error('[Whatnot Scraper] Error extracting Show Time:', error);
      return null;
    }
  }

  /**
   * Find the Activity feed container element
   * Looks for the container that holds activity feed items after Activity tab is clicked
   * @returns {HTMLElement|null} - The activity feed container or null if not found
   */
  function findActivityFeedContainer() {
    try {
      // Strategy 1: Find Activity tab and traverse to find content container
      const activityTab = Array.from(document.querySelectorAll('*')).find(el => {
        const text = el.textContent || '';
        const tagName = el.tagName.toLowerCase();
        return (text.trim() === 'Activity' || text.includes('Activity')) && 
               (tagName === 'button' || tagName === 'div' || tagName === 'a');
      });

      if (activityTab) {
        // Look for common container patterns near the Activity tab
        let current = activityTab.parentElement;
        let depth = 0;
        
        while (current && depth < 5) {
          // Check if this container has activity-related content
          const text = current.textContent || '';
          if (text.includes('won the auction') || text.includes('placed a bid')) {
            // This might be the container, but verify it has multiple activity items
            const activityCount = Array.from(current.querySelectorAll('*')).filter(el => {
              const elText = el.textContent || '';
              return (elText.includes('won the auction') || elText.includes('placed a bid')) &&
                     /\d+[smhd]/.test(elText);
            }).length;
            
            if (activityCount >= 2) {
              console.log('[Whatnot Scraper] Found activity container with', activityCount, 'activity items');
              return current;
            }
          }
          current = current.parentElement;
          depth++;
        }
      }

      // Strategy 2: Look for scrollable containers with activity content
      const scrollableContainers = Array.from(document.querySelectorAll('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return (style.overflow === 'auto' || style.overflow === 'scroll' || 
                style.overflowY === 'auto' || style.overflowY === 'scroll') &&
               el.scrollHeight > el.clientHeight;
      });

      for (const container of scrollableContainers) {
        const text = container.textContent || '';
        if (text.includes('won the auction') && text.includes('placed a bid')) {
          const activityCount = Array.from(container.querySelectorAll('*')).filter(el => {
            const elText = el.textContent || '';
            return (elText.includes('won the auction') || elText.includes('placed a bid')) &&
                   /\d+[smhd]/.test(elText);
          }).length;
          
          if (activityCount >= 2) {
            console.log('[Whatnot Scraper] Found scrollable activity container with', activityCount, 'items');
            return container;
          }
        }
      }

      // Strategy 3: Look for elements containing multiple activity patterns
      const allElements = Array.from(document.querySelectorAll('*'));
      for (const el of allElements) {
        const text = el.textContent || '';
        // Look for elements that contain multiple activity items
        const activityMatches = (text.match(/won the auction/gi) || []).length;
        if (activityMatches >= 2) {
          // Check if this element's children contain activity items with timestamps
          const children = Array.from(el.querySelectorAll('*'));
          const validActivities = children.filter(child => {
            const childText = child.textContent || '';
            return (childText.includes('won the auction') || childText.includes('placed a bid')) &&
                   /\d+[smhd]/.test(childText);
          });
          
          if (validActivities.length >= 2) {
            console.log('[Whatnot Scraper] Found activity container element with', validActivities.length, 'activities');
            return el;
          }
        }
      }

      console.log('[Whatnot Scraper] Could not find activity feed container');
      return null;
    } catch (error) {
      console.error('[Whatnot Scraper] Error finding activity container:', error);
      return null;
    }
  }

  /**
   * Extract last activity timestamp from Activity feed
   * Looks for actual sales/auction activity with relative timestamps like "1h ago", "30m ago"
   * Returns the OLDEST activity timestamp (furthest back in time = when stream ended)
   * @returns {Promise<string|null>} - ISO timestamp string or null if not found
   */
  async function extractLastActivityTimestamp() {
    try {
      console.log('[Whatnot Scraper] Extracting last activity timestamp from Activity feed...');
      
      // Find and click Activity tab if it exists
      const activityTab = Array.from(document.querySelectorAll('*')).find(el => {
        const text = el.textContent || '';
        const tagName = el.tagName.toLowerCase();
        return (text.trim() === 'Activity' || text.includes('Activity')) && 
               (tagName === 'button' || tagName === 'div' || tagName === 'a');
      });

      if (activityTab) {
        // Click Activity tab to ensure it's visible
        try {
          activityTab.click();
          console.log('[Whatnot Scraper] Clicked Activity tab');
        } catch (e) {
          // Tab might already be active or not clickable, that's OK
          console.log('[Whatnot Scraper] Activity tab click failed (may already be active)');
        }

        // Wait longer for activity feed to load asynchronously (1.5-2 seconds)
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('[Whatnot Scraper] Waited 2 seconds for Activity feed to load');
      } else {
        console.log('[Whatnot Scraper] Activity tab not found, trying to find container anyway');
      }

      // Find the Activity feed container
      const activityContainer = findActivityFeedContainer();
      
      // Determine search scope - use container if found, otherwise search entire page (fallback)
      const searchScope = activityContainer || document;
      const scopeName = activityContainer ? 'activity container' : 'entire page (fallback)';
      console.log('[Whatnot Scraper] Searching within:', scopeName);

      // Look for activity items within the container (or entire page as fallback)
      const allElements = Array.from(searchScope.querySelectorAll('*'));
      
      const activityElements = allElements.filter(el => {
        const text = el.textContent || '';
        
        // Look for actual sale/auction activity indicators
        const hasActivity = text.includes('won the auction') || 
                           text.includes('placed a bid') ||
                           text.includes('placed bid') ||
                           text.includes('purchased') ||
                           (text.includes('won') && text.includes('auction'));
        
        // Must have time indicator (1h, 30m, 2d, etc.)
        const hasTimeIndicator = /\d+[smhd]/.test(text);
        
        // Exclude channel status messages and navigation
        const isNotStatus = !text.includes('is live') && 
                           !text.includes('is offline') &&
                           !text.toLowerCase().includes('channel') &&
                           !text.includes('HomeBrowse') && // Exclude navigation
                           !text.includes('Refer a Buyer'); // Exclude other UI elements
        
        // Additional validation: Should look like activity item (username + action + time)
        const looksLikeActivity = hasActivity && hasTimeIndicator && text.length < 500; // Activity items are typically short
        
        return hasActivity && hasTimeIndicator && isNotStatus && looksLikeActivity;
      });
      
      if (activityElements.length === 0) {
        console.log('[Whatnot Scraper] No activity items found in feed');
        return null;
      }
      
      console.log('[Whatnot Scraper] Found ' + activityElements.length + ' activity items');
      
      // Parse all timestamps and find the OLDEST one (furthest in past = when stream ended)
      const now = new Date();
      let oldestActivityTime = null;
      let oldestActivityText = '';
      let oldestMsAgo = 0;
      
      // Try multiple regex patterns to match different timestamp formats
      const timePatterns = [
        /·\s*(\d+)\s*([smhd])\b/i,           // "· 5h" (middle dot)
        /•\s*(\d+)\s*([smhd])\b/i,           // "• 5h" (bullet)
        /(\d+)\s*([smhd])\s*ago/i,           // "5h ago"
        /(\d+)\s*([smhd])\b/i,                // "5h", "30m", "2d"
        /\s(\d+)\s*([smhd])\b/i               // Any number + time unit (space before)
      ];
      
      // Debug: Log all activity items to see what we're working with
      activityElements.forEach((el, index) => {
        const text = el.textContent || '';
        console.log(`[Whatnot Scraper] Activity ${index + 1}: "${text.substring(0, 150)}"`);
        
        // Try each pattern until one matches
        let timeMatch = null;
        let matchedPattern = null;
        for (const pattern of timePatterns) {
          timeMatch = text.match(pattern);
          if (timeMatch) {
            matchedPattern = pattern.toString();
            console.log(`[Whatnot Scraper]   ✓ Matched pattern -> ${timeMatch[1]}${timeMatch[2]}`);
            break;
          }
        }
        
        if (!timeMatch) {
          console.log(`[Whatnot Scraper]   ⚠ No time pattern matched in this activity`);
        }
      });
      
      // Now parse timestamps using the patterns
      for (const el of activityElements) {
        const text = el.textContent || '';
        
        // Try each pattern until one matches
        let timeMatch = null;
        for (const pattern of timePatterns) {
          timeMatch = text.match(pattern);
          if (timeMatch) break;
        }
        
        if (timeMatch) {
          const value = parseInt(timeMatch[1], 10);
          const unit = timeMatch[2].toLowerCase();
          
          if (!isNaN(value) && value > 0 && value < 1000) { // Reasonable limits
            let msAgo = 0;
            if (unit === 's') {
              msAgo = value * 1000; // seconds
            } else if (unit === 'm') {
              msAgo = value * 60 * 1000; // minutes
            } else if (unit === 'h') {
              msAgo = value * 60 * 60 * 1000; // hours
            } else if (unit === 'd') {
              msAgo = value * 24 * 60 * 60 * 1000; // days
            }
            
            // Only consider activities within last 7 days (reasonable limit)
            if (msAgo > 0 && msAgo < 7 * 24 * 60 * 60 * 1000) {
              const activityTime = new Date(now.getTime() - msAgo);
              
              // We want the OLDEST activity (furthest back in time = largest msAgo)
              // This represents when the stream actually ended
              if (!oldestActivityTime || msAgo > oldestMsAgo) {
                oldestActivityTime = activityTime;
                oldestMsAgo = msAgo;
                oldestActivityText = text.substring(0, 150); // First 150 chars for logging
              }
            }
          }
        }
      }
      
      if (oldestActivityTime) {
        console.log('[Whatnot Scraper] Oldest activity found at:', oldestActivityTime.toISOString());
        console.log('[Whatnot Scraper] Activity text:', oldestActivityText);
        console.log('[Whatnot Scraper] Time ago:', Math.round(oldestMsAgo / (60 * 60 * 1000) * 10) / 10, 'hours');
        return oldestActivityTime.toISOString();
      }
      
      console.log('[Whatnot Scraper] Could not parse activity timestamps');
      return null;
      
    } catch (error) {
      console.warn('[Whatnot Scraper] Error extracting activity timestamp:', error);
      return null;
    }
  }

  /**
   * Check if an element is actually visible on the page
   * @param {HTMLElement} el - Element to check
   * @returns {boolean} - True if element is visible, false otherwise
   */
  function isElementVisible(el) {
    try {
      if (!el) return false;
      
      // Check if element has no offsetParent (hidden via CSS)
      if (el.offsetParent === null && el.tagName !== 'BODY') {
        return false;
      }
      
      // Check computed style for display and visibility
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      
      // Check if element has zero dimensions
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if stream has ended by looking for "Show Has Ended" banner/text
   * This is the concrete, definitive signal that the stream has ended
   * Prevents false positives by first checking for LIVE indicators and only matching visible elements
   * @returns {boolean} - True if stream has ended, false otherwise
   */
  function isStreamEnded() {
    try {
      // STEP 1: First check for LIVE indicators - if found, stream is definitely not ended
      const allElements = Array.from(document.querySelectorAll('*'));
      
      // Check for "Show Time" duration counter (e.g., "Show Time: 00:15:26")
      // This is a strong indicator that the stream is LIVE
      const showTimePattern = /Show Time:?\s*\d{1,2}:\d{2}:\d{2}/i; // Matches "Show Time: 00:15:26" format
      const hasShowTime = allElements.some(el => {
        if (!isElementVisible(el)) return false;
        const text = el.textContent || '';
        return showTimePattern.test(text);
      });
      
      if (hasShowTime) {
        console.log('[Whatnot Scraper] Show Time counter found - stream is active (LIVE)');
        return false;
      }
      
      const liveIndicators = allElements.filter(el => {
        if (!isElementVisible(el)) return false;
        const text = el.textContent || '';
        const lowerText = text.toLowerCase();
        
        // Look for common LIVE indicators
        return (lowerText.includes('live') && 
                (lowerText.includes('going live') || 
                 lowerText.includes('is live') ||
                 lowerText.includes('live now') ||
                 (el.getAttribute('data-testid') && el.getAttribute('data-testid').toLowerCase().includes('live')) ||
                 (el.classList && Array.from(el.classList).some(c => c.toLowerCase().includes('live'))))) ||
               // Look for LIVE badge/indicator
               (el.getAttribute('data-testid') && el.getAttribute('data-testid').includes('live-indicator')) ||
               (el.classList && Array.from(el.classList).some(c => c === 'live-indicator' || c === 'live-badge'));
      });
      
      if (liveIndicators.length > 0) {
        console.log('[Whatnot Scraper] LIVE indicator found - stream is active');
        return false;
      }
      
      // STEP 2: Look for specific data-testid="show-has-ended-banner" element first
      const endedBanner = document.querySelector('[data-testid="show-has-ended-banner"]');
      if (endedBanner && isElementVisible(endedBanner)) {
        console.log('[Whatnot Scraper] STREAM END DETECTED: Found visible "show-has-ended-banner" element');
        return true;
      }
      
      // STEP 3: Fallback to text search for visible elements with exact match
      const endedElement = allElements.find(el => {
        // Must be visible
        if (!isElementVisible(el)) return false;
        
        const text = el.textContent || '';
        
        // Exact match for "Show Has Ended" (case-insensitive)
        return text.trim() === 'Show Has Ended' || 
               text.trim() === 'Show has ended' ||
               text.trim() === 'Stream has ended' ||
               // Also check for close variations in text content
               (text.includes('Show Has Ended') && text.length < 100) || // Short text to avoid false matches
               (text.includes('Show has ended') && text.length < 100) ||
               (text.includes('Stream has ended') && text.length < 100);
      });
      
      if (endedElement) {
        console.log('[Whatnot Scraper] STREAM END DETECTED: Found visible "Show Has Ended" banner');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[Whatnot Scraper] Error checking stream end status:', error);
      return false;
    }
  }

  /**
   * Load scraping interval from storage or use default
   * @returns {Promise<number>} - Scraping interval in milliseconds
   */
  async function loadScrapeInterval() {
    try {
      const result = await chrome.storage.sync.get(['scrapeInterval']);
      if (result.scrapeInterval && typeof result.scrapeInterval === 'number' && result.scrapeInterval >= 10000) {
        // Minimum 10 seconds
        return result.scrapeInterval;
      }
    } catch (error) {
      console.warn('[Whatnot Scraper] Could not load scrape interval from storage, using default:', error);
    }
    return DEFAULT_SCRAPE_INTERVAL_MS;
  }

  /**
   * Extract Scheduled Start Time from the page
   * Format: "Scheduled: MM/DD HH:MMAM/PM"
   * Example: "Scheduled: 11/23 10:00AM"
   * Uses multiple strategies to find the value, especially for ended streams
   * @returns {string|null} - Scheduled start time string or null if not found
   */
  function extractScheduledTime() {
    try {
      // Strategy 1: Search for element containing "Scheduled:" text
      const allElements = Array.from(document.querySelectorAll('*'));
      
      // Find all elements that contain "Scheduled:" text
      const scheduledElements = allElements.filter(el => {
        const text = el.textContent || '';
        return text.includes('Scheduled:');
      });

      // Try each element that contains "Scheduled:"
      for (const scheduledElement of scheduledElements) {
        const elementText = scheduledElement.textContent || '';
        
        // Extract time using regex: "Scheduled: MM/DD HH:MMAM/PM"
        // Pattern matches: "Scheduled: 11/23 10:00AM" or "Scheduled: 1/5 9:30PM"
        const match = elementText.match(/Scheduled:\s*(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s*(?:AM|PM))/i);
        
        if (match && match[1]) {
          return match[1].trim(); // Returns "11/23 10:00AM"
        }
        
        // Also check parent containers
        let parent = scheduledElement.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
          const parentText = parent.textContent || '';
          const parentMatch = parentText.match(/Scheduled:\s*(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s*(?:AM|PM))/i);
          if (parentMatch && parentMatch[1]) {
            return parentMatch[1].trim();
          }
          parent = parent.parentElement;
        }
      }

      return null;
    } catch (error) {
      console.error('[Whatnot Scraper] Error extracting scheduled time:', error);
      return null;
    }
  }

  /**
   * Scrape data from the page and log it
   * Handles stream end detection and final data send
   * @returns {Object|null} - Scraped data object or null if scrape failed
   */
  async function scrapeData() {
    // Check if stream has ended FIRST (before scraping)
    const streamHasEnded = isStreamEnded();
    
    // If stream ended and we haven't sent final data yet
    if (streamHasEnded && !finalDataSent) {
      console.log('[Whatnot Scraper] Stream ended detected. Performing final scrape before stopping...');
      
      // Wait a moment for page to stabilize after stream end detection
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Perform final scrape with multiple attempts if needed
      let grossSales = extractGrossSales();
      let estimatedOrders = extractEstimatedOrders();
      let scheduledStartTime = extractScheduledTime();
      let showTimeHours = extractShowTime();
      let tips = extractTips();
      
      // Extract last activity timestamp (actual stream end time)
      console.log('[Whatnot Scraper] Extracting last activity timestamp from Activity feed...');
      const lastActivityTime = await extractLastActivityTimestamp();
      
      // If values not found, try one more time after a short delay
      if ((grossSales === null || estimatedOrders === null) && !finalDataSent) {
        console.log('[Whatnot Scraper] Values not found on first attempt, retrying...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        grossSales = grossSales || extractGrossSales();
        estimatedOrders = estimatedOrders || extractEstimatedOrders();
        scheduledStartTime = scheduledStartTime || extractScheduledTime();
        showTimeHours = showTimeHours || extractShowTime();
        tips = tips || extractTips();
      }
      
      // Extract stream ID and normalize URL
      const currentUrl = window.location.href;
      const streamId = getStreamId(currentUrl);
      const normalizedUrl = normalizeToDashboardUrl(streamId);
      
      const currentTimestamp = new Date().toISOString();
      
      // Log what we found for debugging
      console.log('[Whatnot Scraper] Stream end details:');
      console.log('  - Current time:', currentTimestamp);
      console.log('  - Last activity:', lastActivityTime || 'Not detected');
      console.log('  - Will use last activity as end time if available');
      console.log('[Whatnot Scraper] Final scrape results:', {
        grossSales: grossSales,
        estimatedOrders: estimatedOrders,
        scheduledStartTime: scheduledStartTime,
        showTimeHours: showTimeHours
      });
      
      // Log hours streamed if found
      if (showTimeHours !== null) {
        console.log('[Whatnot Scraper] Hours streamed:', showTimeHours);
      }
      
      // Prepare final data object
      // Use lastActivityTime as timestamp if available (more accurate than current time)
      // Ensure hoursStreamed is always a number (0 if null/undefined)
      const finalHoursStreamed = (showTimeHours !== null && showTimeHours !== undefined) ? Number(showTimeHours) : 0;
      
      const finalData = {
        timestamp: lastActivityTime || currentTimestamp, // Use activity time if available
        streamId: streamId,
        streamUrl: normalizedUrl,
        grossSales: grossSales,
        estimatedOrders: estimatedOrders,
        tips: tips || 0,
        scheduledStartTime: scheduledStartTime,
        lastActivityTime: lastActivityTime, // Include separately for backend reference
        streamEnded: true, // Mark as final
        streamerName: "Unknown", // Default value, can be extracted later if needed
        hoursStreamed: finalHoursStreamed // Show Time counter in hours (always a number)
      };
      
      // Log hoursStreamed value being sent
      console.log('[Whatnot Scraper] Final hoursStreamed value in payload:', finalHoursStreamed, 'type:', typeof finalHoursStreamed);
      
      console.log('[Whatnot Scraper] FINAL scraped data:', finalData);
      
      // Send final data to backend (send even if some values are null - backend can handle it)
      if (streamId) {
        try {
          await sendDataToBackend(finalData);
          console.log('[Whatnot Scraper] ✓ Final data sent successfully');
        } catch (error) {
          console.error('[Whatnot Scraper] Error sending final data:', error);
        }
      } else {
        console.warn('[Whatnot Scraper] No stream ID found, cannot send final data');
      }
      
      // Stop the monitoring interval
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }
      
      // Mark final data as sent
      finalDataSent = true;
      
      console.log('[Whatnot Scraper] ✓ Stream ended. Final data sent. Monitoring stopped.');
      return finalData;
    }
    
    // If stream already ended and final data sent, do nothing
    if (streamHasEnded && finalDataSent) {
      return null;
    }

    // Normal scraping continues if stream not ended
    const grossSales = extractGrossSales();
    const estimatedOrders = extractEstimatedOrders();
    const showTimeHours = extractShowTime();
    const tips = extractTips();
    
    // Stale data detection - if values unchanged for 10 scrapes, verify stream end before marking as ended
    if (grossSales !== null && estimatedOrders !== null) {
      if (grossSales === lastGrossSales && estimatedOrders === lastEstimatedOrders && grossSales > 0) {
        staleCount++;
        if (staleCount >= 10) {
          // Don't just assume ended — verify with isStreamEnded() first
          const confirmedEnded = isStreamEnded();
          if (confirmedEnded) {
            console.log('[Whatnot Scraper] Data stale for 10 scrapes AND stream end confirmed — marking as ended');
            // Stop monitoring interval
            if (monitoringInterval) {
              clearInterval(monitoringInterval);
              monitoringInterval = null;
            }
            // Mark as ended - will be set in data object below
            finalDataSent = true;
          } else {
            console.log('[Whatnot Scraper] Data stale but live indicators still present — just a slow period, continuing to monitor');
            staleCount = 0; // Reset counter, stream is still live
          }
        }
      } else {
        staleCount = 0; // Reset counter when data changes
      }
    }
    
    // Update last values for next scrape
    lastGrossSales = grossSales;
    lastEstimatedOrders = estimatedOrders;

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

    // Extract stream ID and normalize URL
    const currentUrl = window.location.href;
    const streamId = getStreamId(currentUrl);
    const normalizedUrl = normalizeToDashboardUrl(streamId);

    // Extract scheduled start time
    const scheduledStartTime = extractScheduledTime();

    // Log warning if scheduled time not found (non-critical)
    if (!scheduledStartTime && (grossSales !== null || estimatedOrders !== null)) {
      console.warn('[Whatnot Scraper] Warning: Could not find scheduled start time');
    }

    // Log Show Time hours if found
    if (showTimeHours !== null) {
      console.log('[Whatnot Scraper] Hours streamed:', showTimeHours);
    }

    // Prepare data object
    const timestamp = new Date().toISOString();
    // Ensure hoursStreamed is always a number (0 if null/undefined)
    const hoursStreamedValue = (showTimeHours !== null && showTimeHours !== undefined) ? Number(showTimeHours) : 0;
    
    const data = {
      timestamp: timestamp,
      streamId: streamId,
      streamUrl: normalizedUrl,
      grossSales: grossSales,
      estimatedOrders: estimatedOrders,
      tips: tips || 0,
      scheduledStartTime: scheduledStartTime,
      lastActivityTime: null, // Not available for live streams
      streamEnded: finalDataSent, // Will be true if stale detected
      streamerName: "Unknown", // Default value, can be extracted later if needed
      hoursStreamed: hoursStreamedValue // Show Time counter in hours (always a number)
    };
    
    // Log hoursStreamed value being sent
    console.log('[Whatnot Scraper] hoursStreamed value in payload:', hoursStreamedValue, 'type:', typeof hoursStreamedValue);

    // Log start message and URL extraction details on first successful scrape
    if (!hasLoggedStartMessage && (grossSales !== null || estimatedOrders !== null)) {
      console.log(`[Whatnot Scraper] Monitoring started successfully. Scraping every ${currentScrapeInterval / 1000} seconds.`);
      if (streamId) {
        console.log('[Whatnot Scraper] Stream ID extracted:', streamId);
        console.log('[Whatnot Scraper] Normalized URL:', normalizedUrl);
      }
      if (scheduledStartTime) {
        console.log('[Whatnot Scraper] Scheduled start time found:', scheduledStartTime);
      }
      hasLoggedStartMessage = true;
    }


    // Log successful scrape with enhanced info
    console.log('[Whatnot Scraper] Scraped data:', {
      sales: data.grossSales,
      orders: data.estimatedOrders,
      hoursStreamed: data.hoursStreamed,
      scheduledTime: data.scheduledStartTime || 'Not found',
      url: data.streamUrl
    });
    // Also log full data object for detailed inspection
    console.log('[Whatnot Scraper] Full data object:', data);

    // Send data to backend (don't block on failure)
    // Only send if we have valid data and stream ID
    if (streamId && (grossSales !== null || estimatedOrders !== null)) {
      sendDataToBackend(data).then(success => {
        if (success) {
          console.log('[Whatnot Scraper] Data transmission status: SUCCESS');
        } else {
          console.warn('[Whatnot Scraper] Data transmission status: FAILED (check logs above)');
        }
      }).catch(error => {
        console.warn('[Whatnot Scraper] Data transmission error (non-blocking):', error);
      });
    } else {
      if (!streamId) {
        console.warn('[Whatnot Scraper] Could not extract stream ID from URL. Data not sent:', currentUrl);
      }
    }

    return data;
  }

  /**
   * Match stream URL to scheduled_streams table to get scheduled_stream_id
   * @param {string} streamUrl - The stream URL to match
   * @returns {Promise<string|null>} - The scheduled_stream_id or null if not found
   */
  async function matchScheduledStream(streamUrl) {
    try {
      const matchUrl = `${SUPABASE_URL}/rest/v1/scheduled_streams?stream_url=eq.${encodeURIComponent(streamUrl)}&select=id`;
      
      const matchResponse = await fetch(matchUrl, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!matchResponse.ok) {
        console.warn('[Whatnot Scraper] Failed to query scheduled_streams:', matchResponse.status, matchResponse.statusText);
        return null;
      }

      const matches = await matchResponse.json();
      
      if (matches && matches.length > 0) {
        console.log('[Whatnot Scraper] Found matching scheduled stream:', matches[0].id);
        return matches[0].id;
      }
      
      console.log('[Whatnot Scraper] No matching scheduled stream found for URL:', streamUrl);
      return null;
    } catch (error) {
      console.error('[Whatnot Scraper] Error matching scheduled stream:', error);
      return null;
    }
  }

  /**
   * Convert scheduled start time string to ISO timestamp
   * Format: "MM/DD HH:MMAM/PM" -> ISO timestamp
   * @param {string} scheduledTimeStr - Scheduled time string like "11/23 10:00AM"
   * @returns {string|null} - ISO timestamp or null if parsing fails
   */
  function parseScheduledTime(scheduledTimeStr) {
    if (!scheduledTimeStr) return null;
    
    try {
      // Parse format: "MM/DD HH:MMAM/PM" or "M/D HH:MMAM/PM"
      const match = scheduledTimeStr.match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (!match) return null;
      
      let month = parseInt(match[1], 10) - 1; // JS months are 0-indexed
      const day = parseInt(match[2], 10);
      let hours = parseInt(match[3], 10);
      const minutes = parseInt(match[4], 10);
      const ampm = match[5].toUpperCase();
      
      // Convert to 24-hour format
      if (ampm === 'PM' && hours !== 12) {
        hours += 12;
      } else if (ampm === 'AM' && hours === 12) {
        hours = 0;
      }
      
      // Use current year (or you could extract from context)
      const now = new Date();
      const year = now.getFullYear();
      
      // Create date in local timezone, then convert to ISO
      const date = new Date(year, month, day, hours, minutes);
      
      if (isNaN(date.getTime())) {
        return null;
      }
      
      return date.toISOString();
    } catch (error) {
      console.error('[Whatnot Scraper] Error parsing scheduled time:', error);
      return null;
    }
  }

  /**
   * Send scraped data to Supabase with retry logic
   * @param {Object} data - The scraped data object to send
   * @returns {Promise<boolean>} - True if successful, false otherwise
   */
  async function sendDataToBackend(data) {
    // Check feature flag
    if (!ENABLE_DATA_TRANSMISSION) {
      console.log('[Whatnot Scraper] Data transmission disabled. Data not sent:', data.streamId);
      return false;
    }

    // Validate required fields - streamId is always required
    if (!data.streamId) {
      console.warn('[Whatnot Scraper] Missing streamId. Data not sent:', data);
      return false;
    }
    
    // For final data (streamEnded: true), allow null values since stream may have ended
    // For live streams, both values should be present
    if (!data.streamEnded && (data.grossSales === null || data.estimatedOrders === null)) {
      console.warn('[Whatnot Scraper] Missing required fields for live stream. Data not sent:', {
        hasStreamId: !!data.streamId,
        hasGrossSales: data.grossSales !== null,
        hasEstimatedOrders: data.estimatedOrders !== null,
        streamEnded: data.streamEnded
      });
      return false;
    }
    
    // Ensure values are valid numbers if they're not null
    if (data.grossSales !== null && typeof data.grossSales !== 'number') {
      console.warn('[Whatnot Scraper] Invalid grossSales data type. Data not sent:', data);
      return false;
    }
    if (data.estimatedOrders !== null && typeof data.estimatedOrders !== 'number') {
      console.warn('[Whatnot Scraper] Invalid estimatedOrders data type. Data not sent:', data);
      return false;
    }

    let lastError = null;

    // Retry logic with exponential backoff
    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        // Before each retry, verify still on same stream
        const currentStreamId = getStreamId(window.location.href);
        if (!currentStreamId || currentStreamId !== data.streamId) {
          console.log(`[Whatnot Scraper] Stream changed during retry (was ${data.streamId}, now ${currentStreamId || 'none'}), cancelling`);
          return false;
        }
        
        // First, try to match the stream URL to scheduled_streams
        const scheduledStreamId = await matchScheduledStream(data.streamUrl);
        
        // Parse scheduled start time to ISO format
        const scheduledStartTimeISO = parseScheduledTime(data.scheduledStartTime);
        
        // Prepare payload for stream_scrapes table
        const payload = {
          whatnot_stream_id: data.streamId,
          stream_url: data.streamUrl,
          units_sold: data.estimatedOrders !== null ? Math.round(data.estimatedOrders) : null,
          gross_sales: data.grossSales !== null ? parseFloat(data.grossSales) : null,
          runtime_hours: data.hoursStreamed !== null && data.hoursStreamed !== undefined ? parseFloat(data.hoursStreamed) : null,
          scheduled_start_time: scheduledStartTimeISO,
          scheduled_stream_id: scheduledStreamId,
          streamer_username: data.streamerName || null,
          scraped_at: new Date().toISOString(),
          tips: data.tips || 0,
          stream_status: data.streamEnded ? 'ended' : 'live'
        };

        // Log the exact payload being sent to backend
        console.log('[Whatnot Scraper] Sending payload to Supabase:', JSON.stringify(payload, null, 2));
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/stream_scrapes`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        console.log(`[Whatnot Scraper] Data sent successfully to Supabase (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}):`, data.streamId);
        return true;
      } catch (error) {
        lastError = error;
        
        // If not the last attempt, wait before retrying
        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
          console.warn(`[Whatnot Scraper] Transmission failed (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}), retrying in ${delay}ms...`, error);
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retry attempts failed
    console.error(`[Whatnot Scraper] Data transmission failed after ${MAX_RETRY_ATTEMPTS} attempts:`, lastError);
    return false;
  }

  /**
   * Start monitoring the page at regular intervals
   */
  async function startMonitoring() {
    try {
      // Reset final data sent flag when starting monitoring
      finalDataSent = false;
      
      // Reset stale data tracking when starting new stream
      staleCount = 0;
      lastGrossSales = null;
      lastEstimatedOrders = null;
      
      // Load scrape interval from storage
      currentScrapeInterval = await loadScrapeInterval();
      console.log('[Whatnot Scraper] Starting monitoring...');
      console.log(`[Whatnot Scraper] Using scrape interval: ${currentScrapeInterval / 1000} seconds`);

      // Clear any existing interval
      if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
      }

      // Initial scrape immediately
      scrapeData();

      // Set up interval for periodic scraping
      monitoringInterval = setInterval(() => {
        scrapeData();
      }, currentScrapeInterval);
      
      console.log(`[Whatnot Scraper] Monitoring interval set to ${currentScrapeInterval / 1000} seconds`);
    } catch (error) {
      console.error('[Whatnot Scraper] Error in startMonitoring:', error);
      // Fallback to default interval on error
      currentScrapeInterval = DEFAULT_SCRAPE_INTERVAL_MS;
    }
  }

  // Start monitoring when script loads
  // Wait for page to be fully loaded, but also try immediately for SPAs
  async function initialize() {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startMonitoring);
      } else {
        await startMonitoring();
      }

      // Also try after page has had time to render (for React/Vue apps)
      setTimeout(() => {
        if (!hasLoggedStartMessage) {
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
          lastUrl = currentUrl;
          // Restart monitoring if URL changed but still on live dashboard
          if (currentUrl.includes('/dashboard/live/')) {
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

  // Listen for messages from popup/background to scrape on demand
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'scrape-now') {
      console.log('[Whatnot Scraper] Received scrape-now request');
      
      // Perform immediate scrape
      scrapeData().then(data => {
        if (data) {
          console.log('[Whatnot Scraper] Scrape completed:', data);
          sendResponse({ success: true, data: data });
        } else {
          sendResponse({ success: false, error: 'Failed to scrape data' });
        }
      }).catch(error => {
        console.error('[Whatnot Scraper] Error during scrape-now:', error);
        sendResponse({ success: false, error: error.message });
      });
      
      // Return true to indicate we'll send response asynchronously
      return true;
    }
    
    if (message.type === 'get-scraped-data') {
      // Return last scraped data if available
      // This is a simple implementation - you could store last scraped data in a variable
      scrapeData().then(data => {
        sendResponse({ success: true, data: data });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
  });

})();

