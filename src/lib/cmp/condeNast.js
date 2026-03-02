/**
 * AdVision — Condé Nast / Sourcepoint CMP Handler
 *
 * Condé Nast uses Sourcepoint across all publications. Their setup is
 * the most complex of any major publisher — it loads the consent UI inside
 * a cross-origin iframe (sp_message_iframe_*) served from cmpv2.sourcepoint.com,
 * and checks several localStorage keys before rendering.
 *
 * Publications covered:
 *   Vogue, GQ, Wired, Vanity Fair, The New Yorker, Condé Nast Traveller,
 *   Tatler, House & Garden, Architectural Digest, Allure, Glamour, Self,
 *   Bon Appétit, Epicurious, Ars Technica, Pitchfork, Teen Vogue,
 *   W Magazine, Them, Brides, Golf Digest, Condé Nast Traveller.
 *
 * Strategy (three layers):
 *   1. Pre-seed Sourcepoint localStorage keys (injected via addInitScript in browser.js)
 *   2. Wait for & click the accept button inside the sp_message_iframe
 *   3. If iframe approach fails — directly call window.__tcfapi to set consent
 */

const CONDE_NAST_DOMAINS = [
  'vogue.com', 'vogue.co.uk', 'vogue.fr', 'vogue.de', 'vogue.it',
  'vogue.es', 'vogue.com.au', 'vogue.in', 'vogue.jp', 'vogue.mx',
  'vogue.nl', 'vogue.ru', 'vogue.com.br', 'vogue.pl', 'vogue.gr',
  'vogue.pt', 'vogue.ua', 'vogue.cz', 'vogue.ro',
  'gq.com', 'gq.co.uk', 'gq-magazine.co.uk', 'gq.de', 'gq.fr',
  'gq.it', 'gq.es', 'gq.com.au', 'gq.in', 'gq.jp', 'gq.mx',
  'wired.com', 'wired.co.uk', 'wired.de', 'wired.it',
  'vanityfair.com', 'vanityfair.co.uk', 'vanityfair.fr', 'vanityfair.de',
  'vanityfair.it', 'vanityfair.es', 'vanityfair.in',
  'newyorker.com',
  'cntraveller.com', 'cntraveler.com',
  'tatler.com',
  'houseandgarden.co.uk',
  'architecturaldigest.com', 'ad.nl',
  'allure.com',
  'glamour.com', 'glamour.co.uk', 'glamour.de', 'glamour.fr',
  'glamour.es', 'glamour.it', 'glamour.com.mx', 'glamour.ru',
  'self.com',
  'bonappetit.com',
  'epicurious.com',
  'arstechnica.com',
  'pitchfork.com',
  'teenvogue.com',
  'wmagazine.com',
  'them.us',
  'brides.com',
  'golfdigest.com',
  'condenast.com', 'condenast.co.uk', 'condenast.de',
  'condenast.fr', 'condenast.es', 'condenast.it',
];

/**
 * Check if a URL belongs to a Condé Nast publication.
 */
function isCondeNast(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return CONDE_NAST_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Sourcepoint localStorage pre-seed script.
 * Inject this via context.addInitScript() BEFORE navigating to the page.
 * When Sourcepoint's script runs, it finds consent already given and skips the dialog.
 */
const SOURCEPOINT_PRESEED_SCRIPT = `
  (() => {
    try {
      const propertyHref = window.location.href;
      const now = Date.now();

      // Core Sourcepoint consent object
      const spConsent = {
        // IAB TCF v2 consent string — all purposes/vendors consented
        euconsent: 'CProok0Prook0AcABBENDpCgAP_AAH_AACiQAZHAFMAeQAmABUADIAHIAQAAuABgAEMAIgARAAyAB0AEEAIQAQgAhABGACQAKQAW',
        addtlConsent: '1~',
        consentedAll: true,
        rejectedAll: false,
        consentedToAll: true,
        savedConsent: true,
        applies: true,
        dateCreated: new Date(now - 86400000).toISOString(),
        lastUpdated: new Date(now).toISOString(),
      };

      // Sourcepoint stores consent under a property-specific key
      // Try several key patterns they use across publications
      const keys = [
        '_sp_user_consent_',
        '_sp_v1_data',
        'sp_user_consent',
        '_sp_consent_',
      ];

      keys.forEach(k => {
        try { localStorage.setItem(k, JSON.stringify(spConsent)); } catch(e) {}
      });

      // IAB TCF v2 — used by ad systems to check consent directly
      try {
        localStorage.setItem('euconsent-v2', spConsent.euconsent);
        localStorage.setItem('_sp_enable_dfp_targeting_', 'true');
      } catch(e) {}

      // Sourcepoint also checks a cookie
      const expires = new Date(now + 365 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie = '_sp_v1_data=' + encodeURIComponent(JSON.stringify(spConsent)) + '; path=/; expires=' + expires;

    } catch(e) { /* never block page load */ }
  })();
`;

/**
 * Handle Condé Nast / Sourcepoint consent dialog.
 * Call this after page.goto() has settled.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>} true if consent was handled
 */
async function handleCondeNastConsent(page) {
  const TIMEOUT = 12000;
  const deadline = Date.now() + TIMEOUT;

  // ── Strategy 1: Wait for the Sourcepoint iframe and click inside it ──────
  try {
    // The iframe id always starts with sp_message_iframe_
    await page.waitForSelector('iframe[id^="sp_message_iframe_"]', { timeout: 6000 });

    const frames = page.frames();
    for (const frame of frames) {
      if (Date.now() >= deadline) break;

      const frameUrl = frame.url();
      if (!frameUrl.includes('sourcepoint') && !frameUrl.includes('sp_message')) continue;

      // Sourcepoint accept button selectors (inside the iframe)
      const spSelectors = [
        '.sp_choice_type_ACCEPT_ALL',
        '[data-choice-type="ACCEPT_ALL"]',
        'button[title="Accept all"]',
        'button[title="Accept All"]',
        'button:has-text("Accept all")',
        'button:has-text("Accept All")',
        'button:has-text("ACCEPT ALL")',
        '.message-component.submit-button',
        '[class*="accept-all"]',
      ];

      for (const sel of spSelectors) {
        if (Date.now() >= deadline) break;
        try {
          const btn = await frame.$(sel);
          if (btn && await btn.isVisible()) {
            await btn.click({ timeout: 2000 });
            await page.waitForTimeout(1500);
            // Dismiss any follow-up overlay (some publications show a second step)
            await page.waitForTimeout(500);
            return true;
          }
        } catch { /* try next */ }
      }
    }
  } catch {
    // iframe didn't appear — consent was already pre-seeded, or different CMP
  }

  // ── Strategy 2: TCF API direct call ──────────────────────────────────────
  // Call window.__tcfapi directly to set consent without clicking anything
  try {
    const tcfResult = await page.evaluate(() => {
      return new Promise((resolve) => {
        if (typeof window.__tcfapi !== 'function') {
          resolve(false);
          return;
        }
        // Set consent via TCF API
        window.__tcfapi('addEventListener', 2, (tcData, success) => {
          if (success && tcData.eventStatus === 'cmpuishown') {
            // CMP UI is shown — try to accept programmatically
            if (typeof window.__tcfapi === 'function') {
              // Some Sourcepoint installs expose a direct consent setter
              window.__tcfapi('setConsent', 2, () => {}, { consentedAll: true });
            }
          }
        });
        setTimeout(() => resolve(false), 2000);
      });
    });
  } catch { /* silently fail */ }

  // ── Strategy 3: Force-remove the overlay ─────────────────────────────────
  await page.evaluate(() => {
    try {
      // Remove Sourcepoint overlay elements
      document.querySelectorAll([
        '[id^="sp_message_container_"]',
        '[id^="sp_privacy_manager_"]',
        '.sp-message-container',
        '[class*="sp_message"]',
        'iframe[id^="sp_message_iframe_"]',
        '#sp-cc-root',
        '.message-overlay',
      ].join(',')).forEach(el => el.remove());

      // Unlock scroll
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.documentElement.style.overflow = '';

      // Remove any backdrop/blur the CMP adds
      document.querySelectorAll('[class*="backdrop"], [class*="overlay"]').forEach(el => {
        if (el.style.position === 'fixed' && el.style.zIndex > 1000) {
          el.remove();
        }
      });
    } catch(e) {}
  }).catch(() => {});

  return false;
}

module.exports = {
  isCondeNast,
  handleCondeNastConsent,
  SOURCEPOINT_PRESEED_SCRIPT,
  CONDE_NAST_DOMAINS,
};
