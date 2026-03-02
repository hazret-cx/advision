/**
 * AdVision — Browser Manager
 *
 * Manages Playwright browser lifecycle. Provides a shared browser instance
 * with realistic settings to avoid bot detection on publisher sites.
 */

const { chromium } = require('playwright');

let _browser = null;

const BROWSER_OPTIONS = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--window-size=1440,900',
  ],
};

const CONTEXT_OPTIONS = {
  viewport: { width: 1440, height: 900 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  locale: 'en-GB',
  timezoneId: 'Europe/London',
  deviceScaleFactor: 1,
  // Block unnecessary resource types to speed up loading
  bypassCSP: true,
};

async function getBrowser() {
  if (!_browser || !_browser.isConnected()) {
    _browser = await chromium.launch(BROWSER_OPTIONS);
  }
  return _browser;
}

async function createPage() {
  const browser = await getBrowser();
  const context = await browser.newContext(CONTEXT_OPTIONS);

  // Block heavy media and fonts to speed up page load (keep images for visual accuracy)
  await context.route('**/*.{mp4,webm,ogg,mp3,wav}', route => route.abort());
  await context.route('**/*.{woff,woff2,ttf,otf,eot}', route => route.abort());

  const page = await context.newPage();
  return { page, context };
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

module.exports = { getBrowser, createPage, closeBrowser };
