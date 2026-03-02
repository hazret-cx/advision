/**
 * AdVision — Browser Manager
 *
 * Manages Playwright browser lifecycle. Provides a shared browser instance
 * with realistic settings to avoid bot detection on publisher sites.
 */

const { chromium } = require('playwright');
const { SOURCEPOINT_PRESEED_SCRIPT } = require('./cmp/condeNast');

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

/**
 * Pre-seed consent signals via localStorage + cookies before the page loads.
 * This is the most reliable way to bypass CMPs that check consent state on init.
 * Covers: OneTrust, Cookiebot, TrustArc, Didomi, CookieYes, Borlabs, GDPR Cookie Consent.
 */
const CONSENT_INIT_SCRIPT = `
  (() => {
    try {
      const now = new Date().toISOString();
      const yr  = new Date(Date.now() + 365*24*60*60*1000).toISOString();

      // ── OneTrust ──────────────────────────────────────────────────────────
      localStorage.setItem('OptanonAlertBoxClosed', now);
      localStorage.setItem('OptanonConsent',
        'isGpcEnabled=0&datestamp=' + encodeURIComponent(now) +
        '&version=202209.2.0&isIABGlobal=false&hosts=&consentId=rook-bypass' +
        '&interactionCount=1&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1&geolocation=GB%3BENG'
      );

      // ── Cookiebot ─────────────────────────────────────────────────────────
      document.cookie = 'CookieConsent={stamp:%27rook%27,necessary:true,preferences:true,statistics:true,marketing:true,ver:1,utc:' + Date.now() + ',region:%22gb%22}; path=/; expires=' + new Date(Date.now() + 365*24*60*60*1000).toUTCString();
      localStorage.setItem('cookieconsent_status', 'allow');

      // ── Didomi ────────────────────────────────────────────────────────────
      localStorage.setItem('didomi_token', JSON.stringify({
        created: now, updated: now, version: 0,
        purposes: { enabled: ['cookies','analytics','advertising'] },
        vendors:  { enabled: [] },
      }));
      localStorage.setItem('euconsent-v2', 'CProok0Prook0AcABBENDpCgAP_AAH_AACiQFhxV4A');

      // ── TrustArc ──────────────────────────────────────────────────────────
      document.cookie = 'notice_behavior=implied,eu; path=/';
      document.cookie = 'notice_gdpr_prefs=0,1,2:; path=/';
      document.cookie = 'cmapi_gtm_bl=; path=/';
      document.cookie = 'cmapi_cookie_privacy=permit 1,2,3; path=/';

      // ── CookieYes ─────────────────────────────────────────────────────────
      localStorage.setItem('cookieyes-consent', 'consentid:rook,consent:yes,action:yes,necessary:yes,functional:yes,analytics:yes,performance:yes,advertisement:yes,other:yes');
      document.cookie = 'cookieyes-consent=consentid:rook,consent:yes,action:yes,necessary:yes,functional:yes,analytics:yes,performance:yes,advertisement:yes,other:yes; path=/';

      // ── Borlabs Cookie ────────────────────────────────────────────────────
      document.cookie = 'borlabs-cookie=%7B%22consents%22%3A%7B%22statistics%22%3Atrue%2C%22marketing%22%3Atrue%7D%7D; path=/';

      // ── GDPR Cookie Compliance (Moove) ────────────────────────────────────
      document.cookie = 'moove_gdpr_popup=%7B%22strict%22%3A%221%22%2C%22thirdparty%22%3A%221%22%2C%22advanced%22%3A%221%22%7D; path=/';

      // ── Sourcepoint (Condé Nast — Vogue, GQ, Wired, etc.) ────────────────
      // Sourcepoint checks window.__sp_shared_state & localStorage
      localStorage.setItem('sp_local_state', JSON.stringify({ gdpr: { consentedAll: true } }));

      // ── Generic catch-all ─────────────────────────────────────────────────
      ['cookie_consent','cookie_accepted','cookies_accepted','gdpr_consent',
       'cookies_policy','analytics_consent','user_consent'].forEach(k => {
        localStorage.setItem(k, '1');
        document.cookie = k + '=1; path=/';
      });

    } catch(e) { /* silently fail — never block page load */ }
  })();
`;

async function createPage() {
  const browser = await getBrowser();
  const context = await browser.newContext(CONTEXT_OPTIONS);

  // Inject consent signals before any page script runs
  await context.addInitScript(CONSENT_INIT_SCRIPT);
  // Inject Sourcepoint/Condé Nast pre-seed on top
  await context.addInitScript(SOURCEPOINT_PRESEED_SCRIPT);

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
