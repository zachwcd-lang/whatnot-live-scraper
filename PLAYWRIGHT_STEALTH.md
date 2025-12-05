# Playwright Stealth Configuration

## Problem
Whatnot detects automated browsers and blocks login with "This browser or app may not be secure" error.

## Solution
The script now uses **playwright-extra** with the **stealth plugin** plus persistent context to make the browser appear more like a real user's browser and maintain login sessions.

## What Was Added

### 1. Playwright-Extra with Stealth Plugin ⭐
- Uses `playwright-extra` library for enhanced stealth
- `playwright-extra-plugin-stealth` automatically handles:
  - Removes `navigator.webdriver` property
  - Hides automation indicators
  - Patches canvas, WebGL, and other fingerprinting vectors
  - Adds realistic browser properties
  - Much more effective than manual stealth techniques

### 2. Persistent Context
- Uses `launchPersistentContext()` instead of regular context
- **Saves cookies and session data** to disk
- **Login persists across browser restarts**
- This helps avoid repeated "browser not secure" errors after first login

### 3. Browser Launch Arguments
- `--disable-blink-features=AutomationControlled` - Removes automation flag
- Additional flags to reduce detection and improve compatibility

### 4. Realistic Browser Fingerprint
- **User Agent**: Real Chrome on macOS user agent
- **Viewport**: 1920x1080 (common screen size)
- **Locale**: en-US
- **Timezone**: America/Los_Angeles
- **Permissions**: Realistic geolocation permissions

### 5. HTTP Headers
Added headers that real browsers send:
- Accept-Language
- Accept-Encoding
- Sec-Fetch-* headers
- Upgrade-Insecure-Requests

## Usage

### First Time Setup
The stealth plugin is already installed. Just run:
```bash
npm run playwright:record
```

### How It Works

1. **First Run**: Browser opens, you login manually
   - Your login session is saved to `playwright-context/` directory
   - Cookies and authentication are preserved

2. **Subsequent Runs**: 
   - Browser opens with your saved session
   - **You may already be logged in!**
   - Much less likely to see "browser not secure" error

### If You Get "Browser Not Secure" Error

1. **Try logging in manually** in the Playwright browser window
2. Once logged in successfully, the session will be saved
3. Next time you run the script, you should already be logged in

### Clear Saved Session

If you need to start fresh:
```bash
rm -rf playwright-context/
```

Then run the script again.

## Additional Tips

1. **Use a real browser first**: Sometimes it helps to login once in a real Chrome browser, export cookies, then import them into Playwright

2. **Slow down interactions**: The script already has `slowMo: 100` to slow down actions

3. **Try different times**: Some sites are stricter during certain times

4. **Use persistent context**: If login works, you can modify the script to use `launchPersistentContext()` to save your session

## If Still Detected

1. **Login manually in the browser window** - Once successful, session is saved
2. Check if Whatnot requires 2FA or email verification - complete these manually
3. Wait a few minutes and try again - sometimes there's a cooldown period
4. Clear the context directory and try fresh: `rm -rf playwright-context/`
5. Use a proxy/VPN if IP-based blocking is suspected

## Key Advantages of This Setup

✅ **Stealth plugin** handles most detection automatically  
✅ **Persistent context** saves your login - only login once  
✅ **Real browser fingerprint** with proper headers and properties  
✅ **Session persistence** means you won't have to login every time  

The combination of stealth plugin + persistent context is much more effective than basic stealth techniques!

