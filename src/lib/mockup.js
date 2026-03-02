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
const { detectAdSlots, cleanPageForScreenshot } = require('./detector');
const { matchSlots } = require('./matcher');
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
    // 1. Launch browser
    ({ page, context } = await createPage());

    // Track page crashes so we can bail out cleanly instead of hitting
    // "Target page, context or browser has been closed" mid-pipeline.
    let pageCrashed = false;
    page.on('crash', () => {
      pageCrashed = true;
      console.error(`Page crashed for ${url}`);
    });

    // 2. Detect ad slots
    const slots = await detectAdSlots(page, url);

    if (slots.length === 0) {
      db.updateMockup(mockupId, {
        status: 'completed',
        slots_detected: 0,
        slots_matched: 0,
      });

      if (!pageCrashed) await cleanPageForScreenshot(page);
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
        status: 'completed',
      };
    }

    // 3. Match slots to creatives
    const matchReport = matchSlots(slots, creatives);

    // 4. Record slot matches in DB
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

    if (pageCrashed) throw new Error(`Page crashed while processing ${url}`);

    // 5. Strip any remaining overlays / paywalls before screenshotting
    await cleanPageForScreenshot(page);

    if (pageCrashed) throw new Error(`Page crashed during cleanup for ${url}`);

    // 6. Capture clean screenshot
    const screenshotPath = await captureScreenshot(page, campaignId, mockupId, domain);

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
 * Capture a full-page screenshot.
 */
async function captureScreenshot(page, campaignId, mockupId, domain) {
  const campaignDir = path.join(SCREENSHOTS_DIR, campaignId);
  if (!fs.existsSync(campaignDir)) {
    fs.mkdirSync(campaignDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${domain}_${timestamp}_${mockupId.slice(0, 8)}.jpg`;
  const filepath = path.join(campaignDir, filename);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  try {
    await page.screenshot({
      path: filepath,
      fullPage: true,
      type: 'jpeg',
      quality: 85,
    });
  } catch (err) {
    // If the page itself is gone, don't retry — re-throw so the caller records
    // a proper error instead of a second "closed" crash.
    if (/closed|crashed|destroyed/i.test(err.message || '')) throw err;
    // Full-page screenshot can OOM headless Chrome on heavy pages (e.g. BBC).
    // Fall back to viewport-only screenshot.
    await page.screenshot({
      path: filepath,
      fullPage: false,
      type: 'jpeg',
      quality: 85,
    });
  }

  return path.relative(process.cwd(), filepath);
}

module.exports = { generateMockup };
