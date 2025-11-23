# Debugging Guide: Extension Not Loading

If you're not seeing `[Whatnot Scraper]` logs in the console, follow these steps:

## Step 1: Verify Extension is Loaded

1. Go to `chrome://extensions/`
2. Find "Whatnot Live Scraper"
3. Make sure it's **enabled** (toggle switch is ON)
4. Note the extension ID

## Step 2: Check Extension Errors

1. In `chrome://extensions/`, find your extension
2. Click **"Errors"** or **"Inspect views: service worker"** (for background script)
3. Look for any red error messages
4. Take a screenshot or copy the error text

## Step 3: Verify URL Pattern Match

The extension only works on URLs matching:
- `*://whatnot.com/dashboard/live/*`
- `*://www.whatnot.com/dashboard/live/*`

**Check your current URL:**
- Should be like: `https://whatnot.com/dashboard/live/acc6b2ac-4978-449a-a65a-6ae99ff9358f`
- NOT: `https://whatnot.com/dashboard` (missing `/live/`)
- NOT: `https://whatnot.com/live/...` (missing `/dashboard/`)

## Step 4: Reload Extension

After making changes, you MUST:
1. Go to `chrome://extensions/`
2. Click the **refresh/reload icon** (circular arrow) on the extension card
3. **Reload the Whatnot page** (F5 or Cmd+R)

## Step 5: Check Console Filter

The console might be filtering out logs:

1. Open DevTools Console (F12)
2. Click the **filter icon** (funnel) or look for "Filter" textbox
3. Make sure **ALL log levels** are enabled (Verbose, Info, Warnings, Errors)
4. Try typing `[Whatnot Scraper]` in the filter to see if logs appear
5. Clear the filter completely to see all logs

## Step 6: Check for Script Injection

1. Open DevTools Console
2. Type: `document.querySelector('script[src*="content.js"]')`
3. If this returns `null`, the script wasn't injected
4. Try: `window.location.href` to verify the exact URL

## Step 7: Manual Test

Try injecting the script manually to test:

1. Open Console on the Whatnot live dashboard page
2. Copy and paste this code:

```javascript
// Manual injection test
console.log('[Whatnot Scraper] MANUAL TEST - Script execution works');
alert('If you see this alert, JavaScript execution works');
```

If this doesn't work, there's a JavaScript blocking issue.

## Step 8: Check Content Script Console

Content scripts run in the page context but have their own console:

1. Open DevTools on the Whatnot page
2. Make sure you're looking at the **main page console** (not an iframe)
3. The logs should appear in the same console as page logs

## Step 9: Verify Manifest Syntax

Check `manifest.json` for syntax errors:

1. Open `manifest.json`
2. Use a JSON validator or check for:
   - Missing commas
   - Trailing commas
   - Quote marks around keys
   - Proper array/object syntax

## Step 10: Test with Console Clear

1. Clear console (trash icon or Cmd+K / Ctrl+L)
2. Reload extension
3. Reload page
4. Watch console immediately - you should see logs within 1-2 seconds

## Common Issues

### Issue: Extension is disabled
**Solution:** Enable it in `chrome://extensions/`

### Issue: URL doesn't match pattern
**Solution:** Make sure URL contains `/dashboard/live/`

### Issue: Console filter hiding logs
**Solution:** Clear all filters, enable all log levels

### Issue: Extension not reloaded after changes
**Solution:** Always reload extension AND reload the page

### Issue: Content script blocked by page CSP
**Solution:** Check console for CSP errors, may need manifest permissions

## Still Not Working?

1. **Check the extension popup:**
   - Click the extension icon in Chrome toolbar
   - The popup should show if you're on a live dashboard page

2. **Check background script console:**
   - Go to `chrome://extensions/`
   - Click "Inspect views: service worker" (if available)
   - Look for logs there

3. **Share these details:**
   - Exact URL you're testing on
   - Any errors from `chrome://extensions/`
   - Screenshot of console (with filters cleared)
   - Browser version (Chrome version)

