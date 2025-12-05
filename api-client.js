/**
 * API Client - Whatnot Live Scraper Workflow:
 * 1. Get auth headers (cookies) from Chrome via bridge server
 * 2. Use cookies to call Whatnot GraphQL API
 * 3. Get current live streams
 * 4. Send stream URLs to extension to scrape
 */

const axios = require('axios');

// GraphQL endpoint - matches the one used by Whatnot's web app
const GRAPHQL_URL = 'https://www.whatnot.com/services/graphql';

/**
 * Get auth headers from Chrome extension via bridge server
 */
async function getAuthHeadersFromExtension() {
  const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:3001';
  
  try {
    const response = await axios.post(bridgeUrl, {
      action: 'get-auth-headers'
    });
    return response.data.headers;
  } catch (error) {
    console.error('Error getting auth headers:', error.message);
    throw error;
  }
}

/**
 * Call Whatnot GraphQL API to get current live streams
 */
async function getCurrentLives(authHeaders, sellerId) {
  const query = `query MyLives($sellerId:ID){currentLives:myLiveStreams(status:[PLAYING STOPPED]){id title startTime endTime status userId userDeviceId streamToken isHiddenBySeller minEligibleLoyaltyTier __typename}upcomingLives:myLiveStreams(status:[CREATED]){id title startTime endTime status userId userDeviceId isHiddenBySeller minEligibleLoyaltyTier __typename}pastLives:myLiveStreams(status:[CANCELLED ENDED]){id title startTime endTime status userId userDeviceId isHiddenBySeller minEligibleLoyaltyTier __typename}getSellerAnalyticsLivestreams(sellerId:$sellerId){livestreams{id __typename}__typename}}`;

  const payload = {
    operationName: 'MyLives',
    variables: {
      sellerId: sellerId || '15647879'
    },
    query: query
  };

  // Generate a random request ID
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

    return response.data.data.currentLives;
  } catch (error) {
    console.error('Error calling GraphQL API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Send URL to Chrome extension to scrape
 */
async function sendUrlToExtension(url) {
  const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:3001';
  
  try {
    const response = await axios.post(bridgeUrl, {
      action: 'scrape-url',
      url: url
    });
    return response.data;
  } catch (error) {
    console.error('Error sending URL to extension:', error.message);
    throw error;
  }
}

/**
 * Main workflow
 */
async function main() {
  const sellerId = process.env.SELLER_ID || '15647879';
  
  try {
    console.log('🔐 Step 1: Getting auth headers from Chrome extension...');
    const authHeaders = await getAuthHeadersFromExtension();
    console.log('✅ Auth headers retrieved');
    console.log('   Cookie header length:', authHeaders.cookieHeader?.length || 0);
    console.log('   Number of cookies:', Object.keys(authHeaders.cookies || {}).length);
    
    console.log('\n📡 Step 2: Calling GraphQL API to get current live streams...');
    const currentLives = await getCurrentLives(authHeaders, sellerId);
    console.log(`✅ Found ${currentLives.length} current live streams`);
    
    if (currentLives.length === 0) {
      console.log('⚠️  No current live streams found');
      return;
    }
    
    // Display the live streams
    console.log('\n📺 Current Live Streams:');
    currentLives.forEach((stream, index) => {
      console.log(`   ${index + 1}. ${stream.title || 'Untitled'} (ID: ${stream.id})`);
      console.log(`      Status: ${stream.status}, Started: ${stream.startTime}`);
    });
    
    // For each live stream, send URL to extension to scrape
    for (const stream of currentLives) {
      const streamUrl = `https://www.whatnot.com/dashboard/live/${stream.id}`;
      console.log(`\n🔗 Step 3: Sending URL to extension: ${streamUrl}`);
      
      const result = await sendUrlToExtension(streamUrl);
      console.log('✅ Scraping started:', result.message || 'URL sent to extension');
      
      // Wait a bit before next request
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n✨ Workflow complete!');
    
  } catch (error) {
    console.error('\n❌ Error in workflow:', error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  getAuthHeadersFromExtension,
  getCurrentLives,
  sendUrlToExtension
};

