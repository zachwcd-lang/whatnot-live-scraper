/**
 * Live Stream Monitor - Automated Scraper
 * 
 * Continuously monitors for new live streams and automatically:
 * 1. Detects when a new stream starts (different stream ID)
 * 2. Navigates Chrome to the stream URL
 * 3. Lets the extension scrape the page
 */

const axios = require('axios');

// Configuration
const GRAPHQL_URL = 'https://www.whatnot.com/services/graphql';
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:3001';
const SELLER_ID = process.env.SELLER_ID || '15647879';
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL) || 30000; // Check every 30 seconds by default

// Track which stream IDs we've already processed
const processedStreams = new Set();

// Track authentication failures for automatic refresh
let consecutiveAuthFailures = 0;
const MAX_AUTH_FAILURES = 3;

/**
 * Get auth headers from Chrome
 */
async function getAuthHeaders() {
  try {
    const response = await axios.post(BRIDGE_URL, {
      action: 'get-auth-headers'
    });
    return response.data.headers;
  } catch (error) {
    console.error('❌ Error getting auth headers:', error.message);
    throw error;
  }
}

/**
 * Refresh Chrome authentication by navigating to Whatnot dashboard
 * This triggers the browser to use the refresh token and get new cookies
 */
async function refreshChromeAuth() {
  console.log('\n🔄 Refreshing Chrome to renew authentication...');
  try {
    // Navigate to Whatnot dashboard to trigger auth refresh
    await axios.post(BRIDGE_URL, {
      action: 'scrape-url',
      url: 'https://www.whatnot.com/dashboard/lives'
    });
    
    // Wait for page to load and cookies to refresh
    console.log('   Waiting for page to load and cookies to update...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('✅ Chrome refreshed. Authentication should be renewed.');
    consecutiveAuthFailures = 0;
    return true;
  } catch (error) {
    console.error('❌ Failed to refresh Chrome:', error.message);
    return false;
  }
}

/**
 * Get current live streams from Whatnot API
 */
async function getCurrentLives(authHeaders) {
  const query = `query MyLives($sellerId:ID){currentLives:myLiveStreams(status:[PLAYING STOPPED]){id title startTime endTime status userId userDeviceId streamToken isHiddenBySeller minEligibleLoyaltyTier __typename}upcomingLives:myLiveStreams(status:[CREATED]){id title startTime endTime status userId userDeviceId isHiddenBySeller minEligibleLoyaltyTier __typename}pastLives:myLiveStreams(status:[CANCELLED ENDED]){id title startTime endTime status userId userDeviceId isHiddenBySeller minEligibleLoyaltyTier __typename}getSellerAnalyticsLivestreams(sellerId:$sellerId){livestreams{id __typename}__typename}}`;

  const payload = {
    operationName: 'MyLives',
    variables: { sellerId: SELLER_ID },
    query: query
  };

  const requestId = Math.random().toString(36).substring(2, 18);
  const sessionId = authHeaders.cookies['usid'] || 'unknown';

  try {
    const response = await axios.post(`${GRAPHQL_URL}/?operationName=MyLives&ssr=0`, payload, {
      headers: {
        'accept': '*/*',
        'accept-language': 'en-US',
        'authorization': 'Cookie',
        'content-type': 'application/json',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'x-client-timezone': 'America/Los_Angeles',
        'x-request-id': requestId,
        'x-whatnot-app': 'whatnot-web',
        'x-whatnot-app-context': 'next-js/browser',
        'x-whatnot-app-pathname': '/dashboard/lives',
        'x-whatnot-app-screen': '/dashboard/lives',
        'x-whatnot-app-session-id': authHeaders.cookies['device'] || 'unknown',
        'x-whatnot-app-user-session-id': sessionId,
        'x-whatnot-app-version': '20251203-0050',
        'x-whatnot-usgmt': ',A,B,',
        'cookie': authHeaders.cookieHeader,
        'Referer': 'https://www.whatnot.com/dashboard/lives'
      }
    });

    // Success - reset auth failure counter
    consecutiveAuthFailures = 0;
    return response.data.data.currentLives || [];
    
  } catch (error) {
    // Check if it's an authentication error
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      consecutiveAuthFailures++;
      console.error(`\n❌ Authentication error (${error.response.status})`);
      console.error(`   Failure count: ${consecutiveAuthFailures}/${MAX_AUTH_FAILURES}`);
      
      if (consecutiveAuthFailures >= MAX_AUTH_FAILURES) {
        console.log(`\n⚠️  ${MAX_AUTH_FAILURES} consecutive auth failures detected. Attempting to refresh...`);
        const refreshed = await refreshChromeAuth();
        
        if (refreshed) {
          console.log('   Will retry on next check cycle.');
        } else {
          console.log('   ⚠️  Refresh failed. May need manual intervention.');
        }
      }
    } else {
      // Some other error
      console.error('❌ Error calling GraphQL API:', error.message);
      if (error.response) {
        console.error('   Response status:', error.response.status);
        console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
      }
    }
    return [];
  }
}

/**
 * Navigate Chrome to a URL
 */
async function navigateToStream(url) {
  try {
    const response = await axios.post(BRIDGE_URL, {
      action: 'scrape-url',
      url: url
    });
    return response.data;
  } catch (error) {
    console.error('❌ Error navigating to stream:', error.message);
    throw error;
  }
}

/**
 * Process new streams - navigate to any we haven't seen before
 */
async function processNewStreams(streams) {
  let newStreamsFound = 0;

  for (const stream of streams) {
    if (!processedStreams.has(stream.id)) {
      newStreamsFound++;
      processedStreams.add(stream.id);
      
      const streamUrl = `https://www.whatnot.com/dashboard/live/${stream.id}`;
      
      console.log(`\n🆕 New stream detected!`);
      console.log(`   Title: ${stream.title || 'Untitled'}`);
      console.log(`   ID: ${stream.id}`);
      console.log(`   Status: ${stream.status}`);
      console.log(`   Started: ${new Date(parseInt(stream.startTime)).toLocaleString()}`);
      console.log(`\n🔗 Navigating Chrome to: ${streamUrl}`);
      
      try {
        await navigateToStream(streamUrl);
        console.log('✅ Chrome navigated successfully. Extension can now scrape.');
        
        // Wait a bit before processing next stream
        if (newStreamsFound < streams.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error('❌ Failed to navigate to stream:', error.message);
      }
    }
  }

  return newStreamsFound;
}

/**
 * Check for new streams (one iteration)
 */
async function checkForNewStreams() {
  try {
    // Get auth headers
    const authHeaders = await getAuthHeaders();
    
    // Get current live streams
    const currentLives = await getCurrentLives(authHeaders);
    
    if (currentLives.length === 0) {
      // No streams currently, but don't log spam
      return 0;
    }
    
    // Process any new streams
    const newStreamsCount = await processNewStreams(currentLives);
    
    return newStreamsCount;
  } catch (error) {
    console.error('❌ Error checking for new streams:', error.message);
    return 0;
  }
}

/**
 * Main monitoring loop
 */
async function startMonitoring() {
  console.log('🚀 Starting Live Stream Monitor');
  console.log(`📊 Seller ID: ${SELLER_ID}`);
  console.log(`🔄 Check interval: ${CHECK_INTERVAL / 1000} seconds`);
  console.log(`🌐 Bridge URL: ${BRIDGE_URL}`);
  console.log(`🔐 Auth refresh: Enabled (auto-refresh after ${MAX_AUTH_FAILURES} failures)`);
  console.log(`\n👀 Monitoring for new live streams...\n`);

  // Initial check
  const initialCount = await checkForNewStreams();
  if (initialCount > 0) {
    console.log(`\n✨ Found ${initialCount} stream(s) on startup`);
  } else {
    console.log('⏳ No active streams found. Waiting for new streams...');
  }

  // Start monitoring loop
  setInterval(async () => {
    const timestamp = new Date().toLocaleString();
    process.stdout.write(`\r⏱️  Last check: ${timestamp} | Monitoring ${processedStreams.size} stream(s)...`);
    
    const newStreamsCount = await checkForNewStreams();
    
    if (newStreamsCount > 0) {
      // Clear the status line and show the new stream info (already logged in processNewStreams)
      process.stdout.write('\r' + ' '.repeat(100) + '\r');
    }
  }, CHECK_INTERVAL);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down monitor...');
    console.log(`📊 Total streams processed: ${processedStreams.size}`);
    process.exit(0);
  });
}

// Start monitoring
if (require.main === module) {
  startMonitoring().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  startMonitoring,
  checkForNewStreams
};

