# Browser-Harness Preflight Integration — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-harness preflight layer to AdVision that dismisses CMPs, handles unknown consent flows, and exports clean browser state (cookies + localStorage) to Playwright before the screenshot pipeline runs.

**Architecture:** A standalone `preflight.js` module wraps browser-harness via Node's `child_process`. It runs against a URL, attempts CMP dismissal, and writes a state file (`preflight-state.json`) that `mockup.js` imports into the Playwright context before loading the page. Falls back silently if browser-harness fails — Playwright continues with its existing CMP logic.

**Tech Stack:** Node.js, browser-harness (Python/CDP), child_process, existing Playwright pipeline

---

## Chunk 1: Preflight Module

### Task 1: Create `src/lib/preflight.js`

**Files:**
- Create: `src/lib/preflight.js`
- Create: `src/lib/preflight/run.py`

- [ ] **Step 1: Create the Python runner script**

Create `src/lib/preflight/run.py`:

```python
"""
AdVision browser-harness preflight runner.
Visits a URL, dismisses CMP, exports cookies + localStorage to stdout as JSON.
"""
import json, sys, os

# Allow importing helpers from browser-harness install
HARNESS_DIR = os.path.expanduser("~/Documents/GitHub/browser-harness")
sys.path.insert(0, HARNESS_DIR)

# Set CDP websocket from env
cdp_ws = os.environ.get("BU_CDP_WS", "")
if not cdp_ws:
    print(json.dumps({"error": "BU_CDP_WS not set"}))
    sys.exit(1)

url = sys.argv[1] if len(sys.argv) > 1 else ""
if not url:
    print(json.dumps({"error": "No URL provided"}))
    sys.exit(1)

# Import harness helpers
os.environ["BU_CDP_WS"] = cdp_ws
exec(open(f"{HARNESS_DIR}/helpers.py").read())

try:
    goto(url)
    wait_for_load()

    # Give CMP time to appear and attempt standard dismissal
    sleep(2)

    # Try common accept buttons
    dismissed = False
    accept_selectors = [
        "button[id*='accept']",
        "button[class*='accept']",
        "[aria-label*='Accept']",
        "[aria-label*='accept']",
        "button[id*='agree']",
        ".css-accept",
        "#onetrust-accept-btn-handler",
        ".js-accept-all-cookies",
    ]
    for sel in accept_selectors:
        try:
            click(sel)
            dismissed = True
            sleep(1)
            break
        except:
            pass

    # Export state
    cookies = get_cookies()
    storage = get_local_storage()

    result = {
        "success": True,
        "dismissed": dismissed,
        "cookies": cookies,
        "localStorage": storage,
        "url": url,
    }
    print(json.dumps(result))

except Exception as e:
    print(json.dumps({"error": str(e), "success": False}))
    sys.exit(1)
```

- [ ] **Step 2: Create `src/lib/preflight.js`**

```javascript
/**
 * AdVision — Browser-Harness Preflight
 *
 * Runs browser-harness against a URL to dismiss CMPs and export
 * browser state (cookies + localStorage) for Playwright to import.
 *
 * Falls back gracefully — if preflight fails, Playwright continues
 * with its existing CMP logic unchanged.
 */

const { spawn } = require('child_process');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const HARNESS_DIR = path.join(process.env.HOME, 'Documents/GitHub/browser-harness');
const RUNNER_SCRIPT = path.join(__dirname, 'preflight/run.py');
const CHROME_PORT = 9222;
const CHROME_DATA_DIR = path.join(process.env.HOME, '.bh-chrome');
const PREFLIGHT_TIMEOUT_MS = 20000;

/**
 * Ensure browser-harness Chrome is running and return the CDP websocket URL.
 */
function ensureChrome() {
  try {
    const res = execSync(`curl -s http://localhost:${CHROME_PORT}/json/version`, { timeout: 3000 });
    const json = JSON.parse(res.toString());
    return json.webSocketDebuggerUrl;
  } catch (_) {
    // Chrome not running — start it
    spawn('google-chrome-stable', [
      `--remote-debugging-port=${CHROME_PORT}`,
      `--user-data-dir=${CHROME_DATA_DIR}`,
      '--no-first-run',
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    ], { detached: true, stdio: 'ignore' }).unref();

    // Wait for it to come up (max 5s)
    for (let i = 0; i < 10; i++) {
      try {
        execSync('sleep 0.5', { timeout: 1000 });
        const res = execSync(`curl -s http://localhost:${CHROME_PORT}/json/version`, { timeout: 2000 });
        const json = JSON.parse(res.toString());
        if (json.webSocketDebuggerUrl) return json.webSocketDebuggerUrl;
      } catch (_) {}
    }
    return null;
  }
}

/**
 * Run preflight against a URL.
 * Returns { success, dismissed, cookies, localStorage } or null on failure.
 *
 * @param {string} url - Publisher URL to preflight
 * @returns {Promise<object|null>}
 */
async function runPreflight(url) {
  const cdpWs = ensureChrome();
  if (!cdpWs) {
    console.warn('[preflight] Could not start Chrome — skipping preflight');
    return null;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn('[preflight] Timeout — skipping preflight for', url);
      child.kill();
      resolve(null);
    }, PREFLIGHT_TIMEOUT_MS);

    // Use uv from browser-harness to run the script
    const uvPath = path.join(process.env.HOME, '.local/bin/uv');
    const child = spawn(uvPath, ['run', 'python3', RUNNER_SCRIPT, url], {
      cwd: HARNESS_DIR,
      env: { ...process.env, BU_CDP_WS: cdpWs },
    });

    let output = '';
    let errOutput = '';

    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { errOutput += d.toString(); });

    child.on('close', (code) => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(output.trim());
        if (result.success) {
          console.log(`[preflight] ✓ ${url} — CMP dismissed: ${result.dismissed}`);
        } else {
          console.warn(`[preflight] ✗ ${url} — ${result.error}`);
        }
        resolve(result.success ? result : null);
      } catch (e) {
        console.warn('[preflight] Failed to parse output:', output, errOutput);
        resolve(null);
      }
    });
  });
}

/**
 * Apply preflight state to a Playwright browser context.
 * Call this after createContext() but before goto().
 *
 * @param {object} context - Playwright BrowserContext
 * @param {object} preflightResult - Result from runPreflight()
 */
async function applyPreflightState(context, preflightResult) {
  if (!preflightResult) return;

  try {
    // Apply cookies
    if (preflightResult.cookies?.length) {
      await context.addCookies(preflightResult.cookies);
    }

    // Apply localStorage via init script
    if (preflightResult.localStorage && Object.keys(preflightResult.localStorage).length) {
      const storage = preflightResult.localStorage;
      await context.addInitScript((storageData) => {
        for (const [key, value] of Object.entries(storageData)) {
          try { localStorage.setItem(key, value); } catch (_) {}
        }
      }, storage);
    }

    console.log(`[preflight] Applied ${preflightResult.cookies?.length || 0} cookies + ${Object.keys(preflightResult.localStorage || {}).length} localStorage entries`);
  } catch (e) {
    console.warn('[preflight] Failed to apply state:', e.message);
  }
}

module.exports = { runPreflight, applyPreflightState };
```

- [ ] **Step 3: Verify files exist**

```bash
ls /root/Documents/GitHub/advision/src/lib/preflight.js
ls /root/Documents/GitHub/advision/src/lib/preflight/run.py
```
Expected: both files present

- [ ] **Step 4: Commit**

```bash
cd /root/Documents/GitHub/advision
git add src/lib/preflight.js src/lib/preflight/run.py
git commit -m "feat: add browser-harness preflight module"
```

---

## Chunk 2: Wire Preflight into mockup.js

### Task 2: Integrate preflight into the mockup pipeline

**Files:**
- Modify: `src/lib/mockup.js` (top imports + generateMockup function)
- Modify: `src/lib/browser.js` (export createContext separately)

- [ ] **Step 1: Export `createContext` from browser.js**

Open `src/lib/browser.js`. Find the `createPage` function and ensure `createContext` is exported separately so preflight state can be applied before page creation.

Add after the existing `getBrowser()` function:

```javascript
/**
 * Create a browser context. Exported so callers can apply preflight state
 * before creating a page.
 */
async function createContext(extraOptions = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext({ ...CONTEXT_OPTIONS, ...extraOptions });

  // Pre-seed consent signals
  await context.addInitScript(CONSENT_INIT_SCRIPT);

  // Sourcepoint/Condé Nast pre-seed
  await context.addInitScript(SOURCEPOINT_PRESEED_SCRIPT);

  return context;
}
```

Add `createContext` to the `module.exports` at the bottom of `browser.js`.

- [ ] **Step 2: Run a quick syntax check**

```bash
cd /root/Documents/GitHub/advision
node -e "require('./src/lib/browser.js'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Add preflight to mockup.js**

At the top of `src/lib/mockup.js`, add the import:

```javascript
const { runPreflight, applyPreflightState } = require('./preflight');
```

- [ ] **Step 4: Update `generateMockup` to call preflight**

In `generateMockup`, find where `createPage` is called. Replace the context+page creation block with:

```javascript
  // --- Preflight: dismiss CMP via browser-harness before Playwright loads ---
  let preflightResult = null;
  try {
    preflightResult = await runPreflight(url);
  } catch (e) {
    console.warn('[preflight] Error during preflight (non-fatal):', e.message);
  }

  // Create context and apply preflight state if available
  const { createContext } = require('./browser');
  const context = await createContext();
  if (preflightResult) {
    await applyPreflightState(context, preflightResult);
  }
  const page = await context.newPage();
  // ... rest of existing page setup continues unchanged
```

- [ ] **Step 5: Syntax check mockup.js**

```bash
cd /root/Documents/GitHub/advision
node -e "require('./src/lib/mockup.js'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
cd /root/Documents/GitHub/advision
git add src/lib/mockup.js src/lib/browser.js
git commit -m "feat: wire browser-harness preflight into mockup pipeline"
```

---

## Chunk 3: Preflight Status in API Response

### Task 3: Surface preflight result in mockup API response

**Files:**
- Modify: `src/lib/mockup.js` (return preflightResult metadata)
- Modify: relevant API route that calls generateMockup

- [ ] **Step 1: Add preflight metadata to mockup result**

In `generateMockup`, find the return object at the end of the function. Add:

```javascript
  return {
    // ... existing fields ...
    preflight: preflightResult ? {
      dismissed: preflightResult.dismissed,
      cookiesApplied: preflightResult.cookies?.length || 0,
      localStorageApplied: Object.keys(preflightResult.localStorage || {}).length,
    } : { skipped: true },
  };
```

- [ ] **Step 2: Commit**

```bash
cd /root/Documents/GitHub/advision
git add src/lib/mockup.js
git commit -m "feat: include preflight metadata in mockup result"
```

---

## Chunk 4: Manual Integration Test

### Task 4: End-to-end test against a known CMP site

- [ ] **Step 1: Start Chrome for browser-harness**

```bash
google-chrome-stable \
  --remote-debugging-port=9222 \
  --user-data-dir=/root/.bh-chrome \
  --no-first-run --headless=new \
  --no-sandbox --disable-gpu 2>/dev/null &
sleep 3
curl -s http://localhost:9222/json/version | python3 -c "import sys,json; print(json.load(sys.stdin)['webSocketDebuggerUrl'])"
```
Expected: a `ws://localhost:9222/devtools/browser/...` URL

- [ ] **Step 2: Run preflight against Vogue (Sourcepoint CMP)**

```bash
cd /root/Documents/GitHub/advision
BU_CDP_WS="<ws-url-from-step-1>" node -e "
const { runPreflight } = require('./src/lib/preflight');
runPreflight('https://www.vogue.com').then(r => console.log(JSON.stringify(r, null, 2)));
"
```
Expected: JSON with `success: true`, cookies array, localStorage entries

- [ ] **Step 3: Run preflight against The Times**

```bash
BU_CDP_WS="<ws-url>" node -e "
const { runPreflight } = require('./src/lib/preflight');
runPreflight('https://www.thetimes.co.uk').then(r => console.log(JSON.stringify(r, null, 2)));
"
```
Expected: JSON with `success: true`

- [ ] **Step 4: Commit test results note to Obsidian**

After testing, results get logged to Obsidian (handled post-implementation).

---

## Chunk 5: Push & Obsidian Update

- [ ] **Step 1: Push all commits**

```bash
cd /root/Documents/GitHub/advision
git push origin main
```

- [ ] **Step 2: Update Obsidian changelog**

Write changelog entry to `/root/Documents/GitHub/obsidian-alkimi/AdVision/CHANGELOG.md` and push.
