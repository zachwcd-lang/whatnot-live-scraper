# Whatnot Live Scraper - Chrome Extension

Chrome Extension that scrapes live sales data from Whatnot streaming platform and logs it to the console for analytics tracking.

## Phase 1: Basic Extension with Console Logging

This phase implements automatic DOM scraping of Gross Sales and Estimated Orders from Whatnot live dashboard pages.

## Installation

### Load Unpacked Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `whatnot-live-scraper` folder
5. The extension should now appear in your extensions list

## Usage

1. Navigate to a Whatnot live dashboard page: `whatnot.com/dashboard/live/[stream-id]`
2. The extension automatically activates on pages matching this pattern
3. Open Chrome Developer Tools (F12 or Cmd+Option+I / Ctrl+Shift+I)
4. Go to the Console tab
5. You should see logs prefixed with `[Whatnot Scraper]`

## What It Does

- **Auto-detects** live dashboard pages
- **Scrapes every 30 seconds**:
  - Gross Sales (dollar amount)
  - Estimated Orders (count)
- **Logs data** to console in JSON format:
  ```json
  {
    "timestamp": "2025-11-23T13:07:21Z",
    "grossSales": 1810.00,
    "estimatedOrders": 154,
    "streamUrl": "whatnot.com/dashboard/live/..."
  }
  ```

## Console Log Levels

- **console.log()**: Successful scrapes and start messages
- **console.warn()**: Failed element detection attempts
- **console.error()**: Critical errors (e.g., 5+ consecutive failures)

## How It Works

1. Uses text-based DOM element discovery (finds "Gross Sales" and "Estimated Orders" labels)
2. Traverses DOM tree to locate associated values
3. Extracts dollar amounts and numeric counts using regex patterns
4. Parses and formats data before logging

## Error Handling

- Missing elements: Logs warnings but continues monitoring
- After 5 consecutive failures: Logs error message but continues trying
- Handles page transitions and loading states gracefully

## Testing

1. Ensure you're logged into Whatnot
2. Navigate to a live stream dashboard
3. Check console for `[Whatnot Scraper]` logs
4. Verify data appears every 30 seconds

## Future Phases

- **Phase 2**: Data transmission to Google Apps Script endpoint
- **Phase 3**: Popup UI with start/stop controls and status display

## Troubleshooting

**Extension not working?**
- Check that you're on a URL matching `*://whatnot.com/dashboard/live/*`
- Verify extension is enabled in `chrome://extensions/`
- Check console for error messages

**Elements not found?**
- Page structure may have changed
- Wait a few seconds - stream might still be loading
- Check console warnings for specific element issues

## Development

- Manifest V3 compliant
- Vanilla JavaScript (no dependencies)
- Content script runs on page load and handles SPA navigation

