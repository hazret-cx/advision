/**
 * AdVision — Browser-Harness Preflight
 *
 * Runs browser-harness against a URL to dismiss CMPs and export
 * browser state (cookies + localStorage) for Playwright to import.
 *
 * Falls back gracefully — if preflight fails, Playwright continues
 * with its existing CMP logic unchanged.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');

const HARNESS_DIR = path.join(process.env.HOME, 'Documents/GitHub/browser-harness');
const RUNNER_SCRIPT = path.join(__dirname, 'preflight/run.py');
const CHROME_PORT = 9222;
const CHROME_DATA_DIR = path.join(process.env.HOME, '.bh-chrome');
const PREFLIGHT_TIMEOUT_MS = 20000;
const UV_PATH = path.join(process.env.HOME, '.local/bin/uv');

/**
 * Ensure browser-harness Chrome is running and return the CDP websocket URL.
 * @returns {string|null} CDP websocket URL or null on failure
 */
function ensureChrome() {
  try {
    const res = execSync(`curl -s http://localhost:${CHROME_PORT}/json/version`, { timeout: 3000 });
    const json = JSON.parse(res.toString());
    return json.webSocketDebuggerUrl || null;
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

    // Poll for up to 6s
    for (let i = 0; i < 12; i++) {
      try {
        execSync('sleep 0.5');
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
      console.warn(`[preflight] Timeout (${PREFLIGHT_TIMEOUT_MS}ms) — skipping for ${url}`);
      child.kill();
      resolve(null);
    }, PREFLIGHT_TIMEOUT_MS);

    const child = spawn(UV_PATH, ['run', 'python3', RUNNER_SCRIPT, url], {
      cwd: HARNESS_DIR,
      env: { ...process.env, BU_CDP_WS: cdpWs },
    });

    let output = '';
    let errOutput = '';

    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { errOutput += d.toString(); });

    child.on('close', () => {
      clearTimeout(timeout);
      try {
        // Extract last JSON line (uv may prefix with setup noise)
        const jsonLine = output.trim().split('\n').filter(l => l.startsWith('{')).pop();
        if (!jsonLine) throw new Error('No JSON in output');
        const result = JSON.parse(jsonLine);
        if (result.success) {
          console.log(`[preflight] ✓ ${url} — CMP dismissed: ${result.dismissed}`);
        } else {
          console.warn(`[preflight] ✗ ${url} — ${result.error}`);
        }
        resolve(result.success ? result : null);
      } catch (e) {
        console.warn('[preflight] Parse error:', e.message, '| raw:', output.slice(0, 200));
        resolve(null);
      }
    });
  });
}

/**
 * Apply preflight state to a Playwright browser context.
 * Call this after createContext() but before page.goto().
 *
 * @param {object} context - Playwright BrowserContext
 * @param {object|null} preflightResult - Result from runPreflight()
 */
async function applyPreflightState(context, preflightResult) {
  if (!preflightResult) return;

  try {
    // Apply cookies
    if (preflightResult.cookies?.length) {
      await context.addCookies(preflightResult.cookies);
    }

    // Apply localStorage via init script (runs before any page JS)
    const storage = preflightResult.localStorage || {};
    if (Object.keys(storage).length) {
      await context.addInitScript((storageData) => {
        for (const [key, value] of Object.entries(storageData)) {
          try { localStorage.setItem(key, value); } catch (_) {}
        }
      }, storage);
    }

    const cookieCount = preflightResult.cookies?.length || 0;
    const storageCount = Object.keys(storage).length;
    console.log(`[preflight] Applied ${cookieCount} cookies + ${storageCount} localStorage entries`);
  } catch (e) {
    console.warn('[preflight] Failed to apply state:', e.message);
  }
}

module.exports = { runPreflight, applyPreflightState };
