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
    // 1. Launch browser + fetch page text for brand safety in parallel
    // Brand safety uses a lightweight HTTP fetch — completely outside Playwright
    // so it never blocks or slows the browser pipeline.
    const [{ page: p, context: c }, safetyText] = await Promise.all([
      createPage(),
      fetchPageTextForSafety(url),
    ]);
    page = p;
    context = c;

    // 2. Run brand safety check on the fetched text (pure JS, instant)
    const campaign = db.getCampaign(campaignId);
    const rules = campaign?.brand_safety_rules ? JSON.parse(campaign.brand_safety_rules) : null;
    const safetyResult = rules?.enabled
      ? checkPageSafety(safetyText, rules)
      : { safe: true, action: 'safe', violations: [], summary: 'Brand safety not configured.' };

    db.updateMockup(mockupId, {
      brand_safety_action: safetyResult.action,
      brand_safety_result: JSON.stringify(safetyResult),
    });

    // 3. Detect ad slots
    const slots = await detectAdSlots(page, url);

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

    // 4. Match slots to creatives
    const matchReport = matchSlots(slots, creatives);

    // 5. Record slot matches in DB
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

    // 6. Capture clean screenshot
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
 * Fetch plain text from a URL for brand safety analysis.
 * Uses a lightweight Node.js fetch — completely outside Playwright,
 * so it never adds time to the browser pipeline.
 */
async function fetchPageTextForSafety(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const html = await res.text();

    // Strip scripts, styles, tags — keep only visible text
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50000);
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
  const filename = `${domain}_${timestamp}_${mockupId.slice(0, 8)}.jpg`;
  const filepath = path.join(campaignDir, filename);

  // Scroll to top before capturing
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // Cap screenshot height — full-page capture of a long article can take 30s+.
  // 5000px covers roughly 5 viewport heights, enough to show all above-the-fold
  // and mid-page ad placements without stitching an entire article.
  const MAX_SCREENSHOT_HEIGHT = 5000;
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  await page.screenshot({
    path: filepath,
    type: 'jpeg',
    quality: 85,
    ...(pageHeight > MAX_SCREENSHOT_HEIGHT
      ? { clip: { x: 0, y: 0, width: 1440, height: MAX_SCREENSHOT_HEIGHT } }
      : { fullPage: true }),
  });

  // Return relative path for storage
  return path.relative(process.cwd(), filepath);
}

module.exports = { generateMockup };
