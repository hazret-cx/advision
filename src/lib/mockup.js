/**
 * AdVision — Mockup Generator
 *
 * Orchestrates the pipeline: load page → detect slots → match creatives →
 * capture clean screenshot. Creatives are composited later via /api/compose.
 */

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createPage } = require('./browser');
const { detectAdSlots } = require('./detector');
const { matchSlots } = require('./matcher');
const { checkPageSafety } = require('./brandSafety');
const db = require('./db');

const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');

/**
 * Generate a mockup for a single publisher URL.
 *
 * @param {string} campaignId - Campaign ID
 * @param {string} url - Publisher URL
 * @param {Array} creatives - Creative objects from DB
 * @returns {Object} Mockup result with screenshot path and match report
 */
async function generateMockup(campaignId, url, creatives) {
  const mockupId = uuidv4();
  let domain;

  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch {
    domain = 'unknown';
  }

  // Delete old screenshot for the same campaign + URL before creating a new record
  const existing = db.findExistingMockup(campaignId, url);
  if (existing?.screenshot_path) {
    await fs.promises.unlink(path.join(process.cwd(), existing.screenshot_path)).catch(() => {});
  }

  // Create mockup record
  db.createMockup(mockupId, campaignId, url, domain);

  let page, context;

  try {
    // 1. Launch browser and load page
    ({ page, context } = await createPage());

    // 2. Detect ad slots
    const slots = await detectAdSlots(page, url);

    // 3. Brand safety check (page is already loaded — extract article text + image metadata)
    const pageText = await page.evaluate(() => {
      const main = document.querySelector('article, main, [role="main"]');
      return (main || document.body).innerText;
    });

    const imageText = await extractImageText(page);
    const combinedText = `${pageText} ${imageText}`;

    const campaign = db.getCampaign(campaignId);
    const rules = campaign?.brand_safety_rules ? JSON.parse(campaign.brand_safety_rules) : null;
    const safetyResult = rules?.enabled
      ? checkPageSafety(combinedText, rules)
      : { safe: true, action: 'safe', violations: [], summary: 'Brand safety not configured.' };

    db.updateMockup(mockupId, {
      brand_safety_action: safetyResult.action,
      brand_safety_result: JSON.stringify(safetyResult),
    });

    // Hard block — capture screenshot for reference but skip matching & injection
    if (safetyResult.action === 'block') {
      const screenshotPath = await captureScreenshot(page, campaignId, mockupId, domain);
      db.updateMockup(mockupId, {
        status: 'blocked',
        slots_detected: slots.length,
        slots_matched: 0,
        screenshot_path: screenshotPath,
      });
      return {
        mockupId,
        url,
        domain,
        slots,
        matchReport: null,
        screenshotPath,
        brandSafety: safetyResult,
        status: 'blocked',
      };
    }

    if (slots.length === 0) {
      db.updateMockup(mockupId, {
        status: 'completed',
        slots_detected: 0,
        slots_matched: 0,
      });

      // Still take a screenshot of the page
      const screenshotPath = await captureScreenshot(page, campaignId, mockupId, domain);
      db.updateMockup(mockupId, { screenshot_path: screenshotPath });

      return {
        mockupId,
        url,
        domain,
        slots: [],
        matchReport: {
          totalSlotsDetected: 0,
          totalMatched: 0,
          totalUnmatchedSlots: 0,
          totalUnusedCreatives: creatives.length,
          matched: [],
          unmatchedSlots: [],
          unusedCreatives: creatives.map(c => ({
            sizeKey: `${c.width}x${c.height}`,
            creative: c,
          })),
          summary: `No ad slots detected on ${domain}. The page may block headless browsers or use non-standard ad containers.`,
        },
        screenshotPath,
        brandSafety: safetyResult,
        status: 'completed',
      };
    }

    // 3. Match slots to creatives
    const matchReport = matchSlots(slots, creatives);

    // 4. Record slot matches in DB (no injection — compositing happens later via /api/compose)
    for (const match of matchReport.matched) {
      db.addSlotMatch(
        uuidv4(), mockupId, match.creative.id,
        match.slot.selector, match.slot.x, match.slot.y,
        match.slot.width, match.slot.height,
        true, false, match.matchTier
      );
    }

    for (const unmatched of matchReport.unmatchedSlots) {
      db.addSlotMatch(
        uuidv4(), mockupId, null,
        unmatched.slot.selector, unmatched.slot.x, unmatched.slot.y,
        unmatched.slot.width, unmatched.slot.height,
        false, false, null
      );
    }

    // 5. Capture clean screenshot (no creatives on the page)
    const screenshotPath = await captureScreenshot(page, campaignId, mockupId, domain);

    // Update mockup record
    db.updateMockup(mockupId, {
      status: 'completed',
      slots_detected: slots.length,
      slots_matched: matchReport.totalMatched,
      screenshot_path: screenshotPath,
    });

    return {
      mockupId,
      url,
      domain,
      slots,
      matchReport,
      screenshotPath,
      brandSafety: safetyResult,
      status: 'completed',
    };

  } catch (err) {
    console.error(`Mockup generation failed for ${url}:`, err.message);
    db.updateMockup(mockupId, {
      status: 'error',
      error_message: err.message,
    });

    return {
      mockupId,
      url,
      domain,
      status: 'error',
      error: err.message,
    };
  } finally {
    if (context) await context.close();
  }
}

/**
 * Extract brand-safety-relevant text from images on the page:
 * - alt attributes (descriptive text set by the publisher)
 * - src filenames (e.g. "toddler-playing.jpg" → "toddler playing")
 * - data-src for lazy-loaded images
 *
 * Returns a single string that gets appended to page body text before
 * the safety check runs. Failures are silently ignored — image metadata
 * is best-effort.
 */
async function extractImageText(page) {
  try {
    return await page.evaluate(() => {
      const parts = [];

      document.querySelectorAll('img').forEach(img => {
        // Alt text — most reliable signal
        const alt = (img.alt || '').trim();
        if (alt.length > 2) parts.push(alt);

        // Filename from src or data-src
        for (const attr of [img.src, img.dataset?.src, img.dataset?.lazySrc]) {
          if (!attr) continue;
          try {
            const pathname = new URL(attr, window.location.href).pathname;
            const filename = pathname.split('/').pop() || '';
            // Strip extension, decode percent-encoding, normalise separators
            const cleaned = decodeURIComponent(filename)
              .replace(/\.[a-z]{2,5}$/i, '')   // remove .jpg, .webp, .jpeg etc.
              .replace(/[-_+]/g, ' ')            // hyphens/underscores → spaces
              .replace(/\d{4,}/g, '')            // strip long numeric ids
              .trim();
            if (cleaned.length > 3) parts.push(cleaned);
          } catch {
            // Invalid URL — skip
          }
          break; // only need one src per image
        }

        // title attribute as a fallback
        const title = (img.title || '').trim();
        if (title.length > 2) parts.push(title);
      });

      return parts.join(' ');
    });
  } catch {
    return '';
  }
}

/**
 * Capture a full-page screenshot.
 */
async function captureScreenshot(page, campaignId, mockupId, domain) {
  // Ensure screenshots directory exists
  const campaignDir = path.join(SCREENSHOTS_DIR, campaignId);
  if (!fs.existsSync(campaignDir)) {
    fs.mkdirSync(campaignDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${domain}_${timestamp}_${mockupId.slice(0, 8)}.png`;
  const filepath = path.join(campaignDir, filename);

  // Scroll to top before capturing
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  await page.screenshot({
    path: filepath,
    fullPage: true,
    type: 'png',
  });

  // Return relative path for storage
  return path.relative(process.cwd(), filepath);
}

module.exports = { generateMockup };
