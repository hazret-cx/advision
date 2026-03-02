/**
 * AdVision — Ad Slot Detection Engine
 * @requires ./cmp/condeNast
 *
 * Scans a publisher page's DOM for ad containers using a priority-ordered
 * set of selectors and heuristics. Returns an array of detected slots with
 * their positions, dimensions, and selector paths.
 */

// Standard IAB sizes we recognise (width x height)
const IAB_SIZES = new Set([
  '300x250', '728x90', '160x600', '970x250', '300x600',
  '320x50', '970x90', '336x280', '120x600', '468x60',
  '300x50', '320x100', '250x250', '200x200', '180x150',
  '125x125', '234x60', '300x1050', '970x66', '580x400',
  '750x100', '750x200', '750x300', '980x120', '930x180',
  '1800x1000', '320x480', '300x100', '120x240',
]);

function isIabSize(w, h) {
  return IAB_SIZES.has(`${w}x${h}`);
}

/**
 * Runs inside the browser context via page.evaluate().
 * Returns an array of detected ad slot objects.
 */
function buildDetectionScript() {
  return () => {
    const slots = [];
    const seen = new Set(); // avoid duplicates

    function addSlot(el, source) {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);

      // Skip tiny or invisible elements
      if (w < 50 || h < 10) return;

      // Build a unique key to deduplicate
      const key = `${Math.round(rect.x)}-${Math.round(rect.y)}-${w}-${h}`;
      if (seen.has(key)) return;
      seen.add(key);

      // Build a CSS selector path for this element
      let selector = '';
      if (el.id) {
        selector = `#${el.id}`;
      } else {
        const classes = Array.from(el.classList).slice(0, 3).join('.');
        selector = classes ? `${el.tagName.toLowerCase()}.${classes}` : el.tagName.toLowerCase();
      }

      slots.push({
        selector,
        x: Math.round(rect.x + window.scrollX),
        y: Math.round(rect.y + window.scrollY),
        width: w,
        height: h,
        source,
        visible: rect.top < window.innerHeight + 500, // within viewport + buffer
      });
    }

    // ── 1. Google Publisher Tag (GPT) ───────────────────────────────
    document.querySelectorAll('[id^="div-gpt-ad"], [data-google-query-id]').forEach(el => {
      addSlot(el, 'gpt');
    });

    // ── 2. Prebid.js slots ─────────────────────────────────────────
    document.querySelectorAll('[data-adslot-name], [data-adunit], [data-ad-slot]').forEach(el => {
      addSlot(el, 'prebid');
    });

    // ── 3. Generic ad containers by class/id patterns ──────────────
    const adPatterns = [
      'ad-slot', 'ad-unit', 'ad-container', 'ad-wrapper', 'ad-banner',
      'advertisement', 'ad-placement', 'ad-position', 'ad-zone',
      'dfp-ad', 'ad-leaderboard', 'ad-sidebar', 'ad-inline',
      'banner-ad', 'display-ad', 'ad-block', 'advert',
    ];

    const allElements = document.querySelectorAll('div, section, aside');
    allElements.forEach(el => {
      const idAndClass = `${el.id} ${el.className}`.toLowerCase();
      for (const pattern of adPatterns) {
        if (idAndClass.includes(pattern)) {
          addSlot(el, 'pattern');
          break;
        }
      }
    });

    // ── 4. Iframes with ad-related sources ─────────────────────────
    document.querySelectorAll('iframe').forEach(iframe => {
      const src = (iframe.src || iframe.dataset.src || '').toLowerCase();
      const adDomains = [
        'doubleclick', 'googlesyndication', 'googleads', 'adnxs',
        'criteo', 'amazon-adsystem', 'pubmatic', 'openx',
        'rubiconproject', 'casalemedia', 'indexexchange',
        'smartadserver', 'adform', 'outbrain', 'taboola',
      ];

      const isAdIframe = adDomains.some(d => src.includes(d));
      if (isAdIframe) {
        addSlot(iframe, 'iframe');
      }
    });

    // ── 5. Size-based heuristic fallback ───────────────────────────
    const iabSizes = new Set([
      '300x250', '728x90', '160x600', '970x250', '300x600',
      '320x50', '970x90', '336x280', '120x600', '468x60',
      '300x50', '320x100', '250x250', '980x120', '750x100',
      '750x200', '300x1050',
    ]);

    document.querySelectorAll('div, iframe').forEach(el => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const sizeKey = `${w}x${h}`;

      if (iabSizes.has(sizeKey)) {
        const key = `${Math.round(rect.x)}-${Math.round(rect.y)}-${w}-${h}`;
        if (!seen.has(key)) {
          addSlot(el, 'size-heuristic');
        }
      }
    });

    return slots;
  };
}

/**
 * Scrapes a URL for ad slots using Playwright.
 *
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {string} url - Publisher URL to scrape
 * @returns {Promise<Array>} Detected ad slots
 */
async function detectAdSlots(page, url) {
  const { isCondeNast, handleCondeNastConsent } = require('./cmp/condeNast');

  // Navigate with realistic settings
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Use publication-specific CMP handler if available, otherwise generic
  if (isCondeNast(url)) {
    await handleCondeNastConsent(page);
  } else {
    await dismissConsentBanners(page);
  }

  // Wait for ads to load (network idle + extra buffer)
  try {
    await page.waitForLoadState('networkidle', { timeout: 4000 });
  } catch {
    // networkidle timeout is fine — heavy news sites have persistent ad connections
  }

  // Additional wait for async ad loading
  await page.waitForTimeout(1500);

  // Scroll down to trigger lazy-loaded ads, then back to top
  await autoScroll(page);
  await page.waitForTimeout(1000);

  // Run detection script
  const slots = await page.evaluate(buildDetectionScript());

  return slots;
}

/**
 * Attempt to dismiss common cookie/consent banners.
 * Total time budget: 5s. Per-selector click timeout: 500ms.
 */
async function dismissConsentBanners(page) {
  const consentSelectors = [
    // ── Sourcepoint (Condé Nast — Vogue, GQ, Wired, Vanity Fair, etc.) ──
    '.sp_choice_type_ACCEPT_ALL',
    'button[title="Accept all"]',
    'button[title="Accept All"]',
    '[data-choice-type="ACCEPT_ALL"]',
    'button[data-sp-id]',

    // ── OneTrust ────────────────────────────────────────────────────────
    '#onetrust-accept-btn-handler',
    '.onetrust-accept-btn-handler',
    '#accept-recommended-btn-handler',

    // ── Cookiebot ───────────────────────────────────────────────────────
    '#CybotCookiebotDialogBodyButtonAccept',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '[data-cookiebotdialog]',

    // ── Didomi ──────────────────────────────────────────────────────────
    '#didomi-notice-agree-button',
    '.didomi-continue-without-agreeing',
    '[data-didomi-action="agree"]',

    // ── TrustArc ────────────────────────────────────────────────────────
    '.trustarc-agree-btn',
    '#truste-consent-button',
    '.truste-button.primary',

    // ── Quantcast CMP ───────────────────────────────────────────────────
    '.qc-cmp2-summary-buttons button:first-child',
    '[data-tmdatatrack="consent-accept"]',
    '.qc-cmp2-buttons-desktop button:first-child',

    // ── Functional / Guardian / FT ───────────────────────────────────
    '.fc-cta-consent',
    '.js-accept-cookies',
    '[data-action="accept"]',
    '.fc-button--primary',

    // ── CookieYes ───────────────────────────────────────────────────────
    '.cky-btn-accept',
    '[data-cky-tag="accept-button"]',

    // ── Borlabs ─────────────────────────────────────────────────────────
    '#borlabs-cookie-btn-accept-all',
    '.borlabs-cookie__btn--accept-all',

    // ── Usercentrics ────────────────────────────────────────────────────
    '[data-testid="uc-accept-all-button"]',
    'button[data-testid="accept-all"]',

    // ── Axeptio ─────────────────────────────────────────────────────────
    '#axeptio_btn_acceptAll',
    '.axeptio_accept_all',

    // ── Iubenda ─────────────────────────────────────────────────────────
    '.iubenda-cs-accept-btn',
    '#iubFooterBtn',

    // ── Klaro ───────────────────────────────────────────────────────────
    '.klaro .cm-btn-accept-all',

    // ── WordPress GDPR / Cookiebot variants ─────────────────────────────
    '.cookie-notice-container #cn-accept-cookie',
    '.cookie-law-info-bar #cookie_action_close_header_accept',

    // ── Generic attribute patterns ──────────────────────────────────────
    'button[id*="accept-all"]',
    'button[id*="acceptAll"]',
    'button[id*="accept"]',
    'button[id*="consent"]',
    'button[id*="agree"]',
    'button[class*="accept-all"]',
    'button[class*="acceptAll"]',
    'button[class*="accept"]',
    'button[class*="consent"]',
    'button[data-testid*="accept"]',
    'button[data-action*="accept"]',
    '[class*="cookie"] button[class*="primary"]',
    '[id*="cookie"] button[class*="primary"]',
    '[class*="consent"] button[class*="primary"]',

    // ── Text-based fallbacks ─────────────────────────────────────────────
    'button:has-text("Accept all")',
    'button:has-text("Accept All")',
    'button:has-text("Accept all & continue")',
    'button:has-text("Accept Cookies")',
    'button:has-text("Accept all cookies")',
    'button:has-text("Accept All Cookies")',
    'button:has-text("Accept")',
    'button:has-text("I Accept")',
    'button:has-text("I Agree")',
    'button:has-text("Agree")',
    'button:has-text("Agree all")',
    'button:has-text("Allow all")',
    'button:has-text("Allow All")',
    'button:has-text("Allow all cookies")',
    'button:has-text("Allow")',
    'button:has-text("Got it")',
    'button:has-text("OK")',
    'button:has-text("Continue")',
    'button:has-text("Consent")',
  ];

  // Give the consent dialog time to render before we start looking
  await page.waitForTimeout(2000);

  const deadline = Date.now() + 10000;

  /**
   * Try to click a consent button in a frame.
   * Returns true if something was clicked.
   */
  async function tryClickConsent(frame) {
    for (const selector of consentSelectors) {
      if (Date.now() >= deadline) return false;
      try {
        const btn = await frame.$(selector);
        if (btn) {
          const visible = await btn.isVisible().catch(() => false);
          if (visible) {
            await btn.click({ timeout: 1500, force: false });
            await page.waitForTimeout(1200);
            return true;
          }
        }
      } catch {
        // ignore — move to next selector
      }
    }
    return false;
  }

  // 1. Try main frame first
  const mainClicked = await tryClickConsent(page);
  if (mainClicked) return;

  // 2. Try child frames (Sourcepoint, TrustArc, some OneTrust installs load in iframes)
  for (const frame of page.frames()) {
    if (Date.now() >= deadline) break;
    if (frame === page.mainFrame()) continue;

    const url = frame.url();
    // Focus on frames that look CMP-related
    const isCmpFrame = /sourcepoint|consent|cookie|gdpr|cmp|privacy|didomi|onetrust|trustarc|cookiebot/i.test(url);
    if (!isCmpFrame && url !== 'about:blank') continue;

    const clicked = await tryClickConsent(frame);
    if (clicked) return;
  }

  // 3. Last resort — hide overlay elements via CSS injection
  // This catches CMPs that don't use a standard button pattern
  await page.evaluate(() => {
    const overlaySelectors = [
      '[class*="cookie-banner"]', '[class*="cookie-consent"]',
      '[class*="cookie-notice"]', '[class*="consent-banner"]',
      '[class*="gdpr-banner"]', '[id*="cookie-banner"]',
      '[id*="cookie-consent"]', '[id*="gdpr"]',
      '#onetrust-banner-sdk', '.cc-window', '.cookiefirst-root',
    ];
    overlaySelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el.offsetHeight > 50) el.style.display = 'none';
      });
    });
    // Also unfreeze body scroll (some CMPs lock it)
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }).catch(() => {});
}

/**
 * Scroll through the page to trigger lazy-loaded ad slots.
 * Scroll count is proportional to page height, capped at 20.
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    const distance = 500;
    const delay = 200;
    const maxScrolls = Math.min(10, Math.ceil(document.body.scrollHeight / 500));

    let scrolled = 0;
    while (scrolled < maxScrolls) {
      window.scrollBy(0, distance);
      await new Promise(r => setTimeout(r, delay));
      scrolled++;

      if (window.scrollY + window.innerHeight >= document.body.scrollHeight) break;
    }

    // Scroll back to top
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 500));
  });
}

/**
 * Inject a creative image into a specific ad slot on the page.
 * Uses a flex container with objectFit:contain to preserve aspect ratio.
 *
 * @param {import('playwright').Page} page
 * @param {Object} slot - Detected slot object
 * @param {string} imageDataUrl - Base64 data URL of the creative
 * @returns {Promise<boolean>} Whether the injection succeeded
 */
async function injectCreative(page, slot, imageDataUrl) {
  return page.evaluate(({ selector, width, height, x, y, imageDataUrl }) => {
    // Find the element — try by selector first, then by position
    let el = null;
    try {
      el = document.querySelector(selector);
    } catch { }

    if (!el) {
      // Fallback: find by position and size
      const candidates = document.querySelectorAll('div, iframe, section');
      for (const c of candidates) {
        const rect = c.getBoundingClientRect();
        const cx = Math.round(rect.x + window.scrollX);
        const cy = Math.round(rect.y + window.scrollY);
        const cw = Math.round(rect.width);
        const ch = Math.round(rect.height);

        if (Math.abs(cx - x) < 5 && Math.abs(cy - y) < 5 && Math.abs(cw - width) < 5 && Math.abs(ch - height) < 5) {
          el = c;
          break;
        }
      }
    }

    if (!el) return false;

    // Pin slot element dimensions and force it visible above page content
    el.innerHTML = '';
    el.style.width = width + 'px';
    el.style.height = height + 'px';
    el.style.minWidth = width + 'px';
    el.style.minHeight = height + 'px';
    el.style.overflow = 'hidden';
    el.style.position = 'relative';
    el.style.display = 'block';
    el.style.visibility = 'visible';
    el.style.opacity = '1';

    // Flex container — sits above page content, centres the creative
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.style.position = 'relative';
    container.style.zIndex = '999999';

    // width/height 100% + objectFit:contain = fills the slot, preserves AR, never distorts
    const img = document.createElement('img');
    img.src = imageDataUrl;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.display = 'block';
    img.style.border = 'none';
    img.style.margin = '0';
    img.style.padding = '0';

    container.appendChild(img);
    el.appendChild(container);
    return true;
  }, { selector: slot.selector, width: slot.width, height: slot.height, x: slot.x, y: slot.y, imageDataUrl });
}

/**
 * Aggressively hide CMP overlays, subscription walls, and scroll locks
 * from the live page DOM before taking a screenshot.
 * Called after ad-slot detection, right before captureScreenshot().
 */
async function cleanPageForScreenshot(page) {
  await page.evaluate(() => {
    // ── 1. Named overlay patterns ───────────────────────────────────────
    const patterns = [
      // Sourcepoint (Condé Nast)
      '.sp-message-container', '.sp_message_container', '[class*="sp_message"]',
      // OneTrust
      '#onetrust-banner-sdk', '#onetrust-pc-sdk', '#onetrust-consent-sdk',
      '.onetrust-pc-dark-filter',
      // Piano / TP (used by many publishers as a paywall)
      '[class*="piano-"]', '[class*="tp-modal"]', '[class*="tp-backdrop"]',
      '[id*="piano"]',
      // Subscription / registration walls
      '[class*="paywall"]', '[id*="paywall"]',
      '[class*="subscribe-wall"]', '[class*="subscription-wall"]',
      '[class*="regwall"]', '[id*="regwall"]',
      '[class*="metered-content"]', '[class*="meter-wall"]',
      '[class*="content-gate"]', '[id*="content-gate"]',
      // Cookie banners
      '[class*="cookie-banner"]', '[class*="cookie-consent"]',
      '[class*="cookie-notice"]', '[class*="consent-banner"]',
      '[class*="gdpr-banner"]', '[id*="cookie-banner"]', '[id*="gdpr"]',
      '.cc-window', '.cookiefirst-root',
      // Specific vendors
      '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay',
      '#didomi-popup', '.didomi-popup-backdrop',
      '#truste-consent-track', '.truste-messageBox',
      '.modal-backdrop', '[class*="modal-overlay"]',
    ];

    patterns.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          el.style.setProperty('display', 'none', 'important');
        });
      } catch {}
    });

    // ── 2. Heuristic — hide large fixed/sticky elements with high z-index ─
    // (catches paywall gates that don't use predictable class names)
    // Cap at 1500 block-level elements to avoid forcing getComputedStyle on
    // every node on heavy pages (which can crash the tab before screenshot).
    try {
      const candidates = Array.from(
        document.querySelectorAll('div, aside, section, nav, header, footer, form')
      ).slice(0, 1500);
      candidates.forEach(el => {
        const s = window.getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'sticky') return;
        const zIndex = parseInt(s.zIndex) || 0;
        if (zIndex < 100) return;
        const r = el.getBoundingClientRect();
        if (r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.4) {
          el.style.setProperty('display', 'none', 'important');
        }
      });
    } catch {}

    // ── 3. Unfreeze scroll locks ────────────────────────────────────────
    try {
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('overflow-y');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('top');
      document.documentElement.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('overflow-y');
    } catch {}
  }).catch(() => {});
}

module.exports = {
  detectAdSlots,
  injectCreative,
  dismissConsentBanners,
  cleanPageForScreenshot,
  isIabSize,
  IAB_SIZES,
};
