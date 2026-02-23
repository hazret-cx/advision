/**
 * AdVision — Mockup Generator
 *
 * Orchestrates the full pipeline: load page → detect slots → match creatives →
 * inject creatives → capture screenshot. This is the main engine.
 */

const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { createPage } = require('./browser');
const { detectAdSlots, injectCreative } = require('./detector');
const { matchSlots } = require('./matcher');
const db = require('./db');

const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

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
        status: 'completed',
      };
    }

    // 3. Match slots to creatives
    const matchReport = matchSlots(slots, creatives);

    // 4. Inject matched creatives into the page
    let injectedCount = 0;
    for (const match of matchReport.matched) {
      try {
        const creativePath = path.join(UPLOADS_DIR, match.creative.filename);

        // Read file asynchronously, then pre-resize to fit inside the slot
        const imageBuffer = await fs.promises.readFile(creativePath);
        const resizedBuffer = await sharp(imageBuffer)
          .resize(match.slot.width, match.slot.height, {
            fit: 'inside',           // scale down proportionally
            withoutEnlargement: true, // never upscale
          })
          .png()
          .toBuffer();

        const dataUrl = `data:image/png;base64,${resizedBuffer.toString('base64')}`;

        const injected = await injectCreative(page, match.slot, dataUrl);
        if (injected) injectedCount++;

        // Record slot match in DB
        db.addSlotMatch(
          uuidv4(), mockupId, match.creative.id,
          match.slot.selector, match.slot.x, match.slot.y,
          match.slot.width, match.slot.height,
          true, injected, match.matchTier
        );
      } catch (err) {
        console.error(`Failed to inject creative into slot ${match.slot.selector}:`, err.message);
        db.addSlotMatch(
          uuidv4(), mockupId, match.creative.id,
          match.slot.selector, match.slot.x, match.slot.y,
          match.slot.width, match.slot.height,
          true, false, match.matchTier
        );
      }
    }

    // Record unmatched slots
    for (const unmatched of matchReport.unmatchedSlots) {
      db.addSlotMatch(
        uuidv4(), mockupId, null,
        unmatched.slot.selector, unmatched.slot.x, unmatched.slot.y,
        unmatched.slot.width, unmatched.slot.height,
        false, false, null
      );
    }

    // Wait for injected images to render
    await page.waitForTimeout(1000);

    // 5. Capture screenshot
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
      injectedCount,
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
