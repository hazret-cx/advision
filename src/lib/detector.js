/**
 * AdVision — Ad Slot Detection Engine
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
  // Navigate with realistic settings
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Try to dismiss cookie/consent banners
  await dismissConsentBanners(page);

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
    // Common consent button patterns
    'button[id*="accept"]',
    'button[id*="consent"]',
    'button[class*="accept"]',
    'button[class*="consent"]',
    'button[data-testid*="accept"]',
    '[class*="cookie"] button',
    '[id*="cookie"] button',
    '#onetrust-accept-btn-handler',
    '.fc-cta-consent',
    '.js-accept-cookies',
    '[data-action="accept"]',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("Accept Cookies")',
    'button:has-text("I Agree")',
    'button:has-text("Got it")',
    'button:has-text("OK")',
    'button:has-text("Allow")',
    'button:has-text("Allow All")',
  ];

  const deadline = Date.now() + 5000; // 5s total budget

  for (const selector of consentSelectors) {
    if (Date.now() >= deadline) break;

    try {
      const btn = await page.$(selector);
      if (btn) {
        await btn.click({ timeout: 500 });
        await page.waitForTimeout(500);
        break; // early-exit on first successful click
      }
    } catch {
      // ignore — move to next selector
    }
  }
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

module.exports = {
  detectAdSlots,
  injectCreative,
  dismissConsentBanners,
  isIabSize,
  IAB_SIZES,
};
