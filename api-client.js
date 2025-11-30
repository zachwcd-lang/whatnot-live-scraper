/**
 * API Client - Demonstrates the workflow:
 * 1. Get auth headers from Chrome extension
 * 2. Use headers to call GraphQL API
 * 3. Get current live streams
 * 4. Send URLs to extension to scrape
 */

const axios = require('axios');

// Extension ID - get this from chrome://extensions after installing
const EXTENSION_ID = process.env.EXTENSION_ID || 'YOUR_EXTENSION_ID_HERE';

// GraphQL endpoint
const GRAPHQL_URL = 'https://www.whatnot.com/graphql';

/**
 * Get auth headers from Chrome extension
 * Note: This requires the extension to expose a messaging endpoint
 */
async function getAuthHeadersFromExtension() {
  // For this to work, you need to use Chrome's native messaging or
  // create a web page that the extension can communicate with
  
  // Alternative: Use a bridge server (see bridge-server.js)
  const bridgeUrl = process.env.BRIDGE_URL || 'http://localhost:3001';
  
  try {
    const response = await axios.post(`${bridgeUrl}/get-auth-headers`, {});
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
  const query = `
    query MyLives($sellerId: ID) {
      currentLives: myLiveStreams(status: [PLAYING STOPPED]) {
        id
        title
        startTime
        endTime
        status
        userId
        userDeviceId
        streamToken
        isHiddenBySeller
        minEligibleLoyaltyTier
        __typename
      }
      upcomingLives: myLiveStreams(status: [CREATED]) {
        id
        title
        startTime
        endTime
        status
        userId
        userDeviceId
        isHiddenBySeller
        minEligibleLoyaltyTier
        __typename
      }
      pastLives: myLiveStreams(status: [CANCELLED ENDED]) {
        id
        title
        startTime
        endTime
        status
        userId
        userDeviceId
        isHiddenBySeller
        minEligibleLoyaltyTier
        __typename
      }
      getSellerAnalyticsLivestreams(sellerId: $sellerId) {
        livestreams {
          id
          __typename
        }
        __typename
      }
    }
  `;

  const payload = {
    operationName: 'MyLives',
    variables: {
      sellerId: sellerId || '15647879'
    },
    query: query
  };

  try {
    const response = await axios.post(GRAPHQL_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders.headers // Use headers from extension
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
    const response = await axios.post(`${bridgeUrl}/scrape-url`, {
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
    console.log('✅ Auth headers retrieved:', Object.keys(authHeaders.headers));
    
    console.log('\n📡 Step 2: Calling GraphQL API to get current live streams...');
    const currentLives = await getCurrentLives(authHeaders, sellerId);
    console.log(`✅ Found ${currentLives.length} current live streams`);
    
    if (currentLives.length === 0) {
      console.log('⚠️  No current live streams found');
      return;
    }
    
    // For each live stream, send URL to extension to scrape
    for (const stream of currentLives) {
      const streamUrl = `https://www.whatnot.com/dashboard/live/${stream.id}`;
      console.log(`\n🔗 Step 3: Sending URL to extension: ${streamUrl}`);
      
      const result = await sendUrlToExtension(streamUrl);
      console.log('✅ Scraping started:', result.message);
      
      // Wait a bit before next request
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n✨ Workflow complete!');
    
  } catch (error) {
    console.error('\n❌ Error in workflow:', error);
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

