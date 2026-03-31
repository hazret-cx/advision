/**
 * AdVision — Mockup Generator
 *
 * Orchestrates the pipeline: load page → detect slots → match creatives →
 * capture clean screenshot. Creatives are composited later via /api/compose.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { createPage, createVideoPage } = require('./browser');
const { detectAdSlots, detectVideoSlots, cleanPageForScreenshot, autoScroll } = require('./detector');
const { matchSlots } = require('./matcher');
const db = require('./db');

const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');

/**
 * Convert a .webm file to .mp4 using bundled ffmpeg.
 * Deletes the original .webm on success.
 *
 * @param {string} webmPath - Absolute path to the .webm input
 * @param {string} mp4Path  - Absolute path for the .mp4 output
 * @returns {Promise<string>} Resolves with mp4Path on success
 */
function convertWebmToMp4(webmPath, mp4Path) {
  return new Promise((resolve, reject) => {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);

    ffmpeg(webmPath)
      .outputOptions([
        '-vcodec libx264',
        '-acodec aac',
        '-movflags faststart',
        '-preset fast',
        '-crf 23',
      ])
      .output(mp4Path)
      .on('end', () => {
        fs.unlink(webmPath, () => {}); // delete .webm silently
        resolve(mp4Path);
      })
      .on('error', reject)
      .run();
  });
}

/**
 * Generate a mockup for a single publisher URL.
 *
 * @param {string} campaignId - Campaign ID
 * @param {string} url - Publisher URL
 * @param {Array} creatives - Creative objects from DB
 * @returns {Object} Mockup result with screenshot path and match report
 */
async function generateMockup(campaignId, url, creatives, options = {}) {
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
      const screenshotPath = await captureScreenshot(page, campaignId, mockupId, domain, options.fullPage);
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
    const screenshotPath = await captureScreenshot(page, campaignId, mockupId, domain, options.fullPage);

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
 * Generate a video mockup by recording the browser while a pre-roll
 * video creative plays in a detected video player slot.
 *
 * @param {string} campaignId
 * @param {string} url - Publisher URL
 * @param {Object} videoCreative - Creative object with mime_type === 'video/mp4'
 * @param {Array}  imageCreatives - Fallback creatives for image pipeline
 * @param {Object} options
 * @param {string} options.recordingMode - 'creative_length' | 'fixed'
 * @param {number} options.durationSeconds - Used when recordingMode === 'fixed'
 * @returns {Object} Mockup result
 */
async function generateVideoMockup(campaignId, url, videoCreative, imageCreatives, options = {}) {
  const { recordingMode = 'fixed', durationSeconds = 15 } = options;
  const mockupId = uuidv4();
  let domain;

  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch {
    domain = 'unknown';
  }

  // Remove old mockup for this campaign + URL
  const existing = db.findExistingMockup(campaignId, url);
  if (existing?.screenshot_path) {
    await fs.promises.unlink(path.join(process.cwd(), existing.screenshot_path)).catch(() => {});
  }

  db.createMockup(mockupId, campaignId, url, domain);
  db.updateMockup(mockupId, { type: 'video' });

  // Temp dir for Playwright .webm output
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'advision-video-'));

  const campaignDir = path.join(process.cwd(), 'screenshots', campaignId);
  if (!fs.existsSync(campaignDir)) fs.mkdirSync(campaignDir, { recursive: true });

  let page, context;

  try {
    ({ page, context } = await createVideoPage(videoDir));

    let pageCrashed = false;
    page.on('crash', () => { pageCrashed = true; });

    // Intercept a fake URL on the publisher's origin to serve the creative locally.
    // Playwright intercepts ALL network requests regardless of hostname.
    const creativeFilePath = path.join(process.cwd(), 'uploads', videoCreative.filename);
    const creativeBuffer = fs.readFileSync(creativeFilePath);
    await page.route(/\/__advision_creative__\//, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: creativeBuffer,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    });

    // Navigate to the publisher page
    const { isCondeNast, handleCondeNastConsent } = require('./cmp/condeNast');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (isCondeNast(url)) {
      await handleCondeNastConsent(page);
    } else {
      const { dismissConsentBanners } = require('./detector');
      await dismissConsentBanners(page);
    }

    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch { /* heavy pages — fine */ }

    await page.waitForTimeout(1500);

    if (pageCrashed) throw new Error(`Page crashed loading ${url}`);

    // Scroll to trigger lazy-loaded content (outstream containers appear mid-article)
    await autoScroll(page);
    await page.waitForTimeout(1000);

    // Detect video slots
    const slots = await detectVideoSlots(page);

    // If no useful slot found, fall back to image mockup
    if (slots.length === 0) {
      await context.close();
      context = null;
      console.warn(`[VideoMockup] No video slots found for ${url} — falling back to image mockup`);
      db.updateMockup(mockupId, { status: 'error', error_message: 'No video player slots detected — fell back to image pipeline' });
      if (imageCreatives.length > 0) {
        return generateMockup(campaignId, url, imageCreatives, options);
      }
      return { mockupId, url, domain, type: 'video', status: 'error', error: 'No video player slots detected on this page' };
    }

    // Use the first detected slot
    const slot = slots[0];

    // Build the creative URL using the publisher's origin so it loads correctly
    const publisherOrigin = new URL(url).origin;
    const creativeUrl = `${publisherOrigin}/__advision_creative__/${videoCreative.filename}`;

    // Clean page overlays before injection
    await cleanPageForScreenshot(page);

    // Scroll the detected slot into view so it's visible in the recording,
    // then re-measure viewport-relative coords for the fixed overlay.
    const viewportCoords = await page.evaluate(({ selector, fallbackX, fallbackY, width, height }) => {
      let el = null;
      try { el = document.querySelector(selector); } catch {}

      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width || width, height: r.height || height };
      }

      // Fallback: element gone by injection time — use original page coords minus current scroll
      return {
        x: fallbackX - window.scrollX,
        y: fallbackY - window.scrollY,
        width,
        height,
      };
    }, { selector: slot.selector, fallbackX: slot.x, fallbackY: slot.y, width: slot.width, height: slot.height });

    // Inject the video creative
    await page.evaluate(({ x, y, width, height, src }) => {
      const video = document.createElement('video');
      video.setAttribute('data-advision', 'true');
      video.src = src;
      video.style.cssText = [
        'position: fixed',
        `left: ${x}px`,
        `top: ${y}px`,
        `width: ${width}px`,
        `height: ${height}px`,
        'z-index: 2147483647',
        'object-fit: contain',
        'background: #000',
        'pointer-events: none',
      ].join(';');
      video.autoplay = true;
      video.muted = true;
      video.loop = false;
      video.controls = false;
      document.body.appendChild(video);
      video.play().catch(() => {});
    }, { x: viewportCoords.x, y: viewportCoords.y, width: viewportCoords.width, height: viewportCoords.height, src: creativeUrl });

    // Wait for video to load before recording meaningfully
    await page.waitForTimeout(500);

    // Wait for the configured duration
    let actualDuration = durationSeconds;
    if (recordingMode === 'creative_length') {
      try {
        await page.waitForFunction(
          () => {
            const v = document.querySelector('video[data-advision]');
            return v && v.ended;
          },
          { timeout: 120000 }
        );
        actualDuration = await page.evaluate(() => {
          const v = document.querySelector('video[data-advision]');
          return v ? Math.round(v.duration) : 0;
        });
      } catch {
        console.warn(`[VideoMockup] creative_length timeout for ${url} — using ${durationSeconds}s`);
        actualDuration = durationSeconds;
      }
    } else {
      await page.waitForTimeout(durationSeconds * 1000);
      actualDuration = durationSeconds;
    }

    if (pageCrashed) throw new Error(`Page crashed during recording for ${url}`);

    // Save video reference BEFORE closing context
    const videoObj = page.video();
    await context.close();
    context = null;

    // Get the .webm path written by Playwright
    const webmPath = videoObj ? await videoObj.path() : null;

    if (!webmPath || !fs.existsSync(webmPath)) {
      throw new Error('Playwright did not produce a video recording');
    }

    // Convert .webm → .mp4
    const timestamp = new Date().toISOString().slice(0, 10);
    const mp4Filename = `${domain}_${timestamp}_${mockupId.slice(0, 8)}.mp4`;
    const mp4Path = path.join(campaignDir, mp4Filename);

    await convertWebmToMp4(webmPath, mp4Path);

    const relPath = path.relative(process.cwd(), mp4Path);

    db.updateMockup(mockupId, {
      status: 'completed',
      screenshot_path: relPath,
      type: 'video',
      duration_seconds: actualDuration,
      slots_detected: slots.length,
      slots_matched: 1,
    });

    db.addSlotMatch(
      uuidv4(), mockupId, videoCreative.id,
      slot.selector, slot.x, slot.y,
      slot.width, slot.height,
      true, true, 'video-tier-0'
    );

    // Clean up temp dir
    fs.rmSync(videoDir, { recursive: true, force: true });

    return {
      mockupId,
      url,
      domain,
      type: 'video',
      slots: [slot],
      matchReport: {
        totalSlotsDetected: slots.length,
        totalMatched: 1,
        totalUnmatchedSlots: 0,
        totalUnusedCreatives: 0,
        matched: [{ creative: videoCreative, slot, matchTier: 'video-tier-0' }],
        unmatchedSlots: [],
        unusedCreatives: [],
        summary: `Video creative injected into ${slot.source} slot on ${domain}.`,
      },
      screenshotPath: relPath,
      status: 'completed',
    };

  } catch (err) {
    console.error(`Video mockup failed for ${url}:`, err.message);
    db.updateMockup(mockupId, { status: 'error', error_message: err.message });
    fs.rmSync(videoDir, { recursive: true, force: true });
    return { mockupId, url, domain, type: 'video', status: 'error', error: err.message };
  } finally {
    if (context) await context.close();
  }
}

/**
 * Capture a full-page screenshot.
 */
async function captureScreenshot(page, campaignId, mockupId, domain, fullPage = false) {
  const campaignDir = path.join(SCREENSHOTS_DIR, campaignId);
  if (!fs.existsSync(campaignDir)) {
    fs.mkdirSync(campaignDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${domain}_${timestamp}_${mockupId.slice(0, 8)}.jpg`;
  const filepath = path.join(campaignDir, filename);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  // Pause videos and freeze CSS animations before screenshotting.
  // On ad-heavy pages, running videos and animations hold GPU/memory resources
  // that can push the renderer over the edge during the full-page capture.
  await page.evaluate(() => {
    document.querySelectorAll('video').forEach(v => { try { v.pause(); v.src = ''; } catch {} });
    const s = document.createElement('style');
    s.textContent = '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }';
    document.head.appendChild(s);
  }).catch(() => {});

  try {
    await page.screenshot({
      path: filepath,
      fullPage,
      type: 'jpeg',
      quality: 85,
      timeout: 30000,
    });
  } catch (err) {
    // If the page itself is gone, don't retry — re-throw so the caller records
    // a proper error instead of a second "closed" crash.
    if (/closed|crashed|destroyed/i.test(err.message || '')) throw err;
    // Full-page screenshot can OOM headless Chrome on heavy pages.
    // If full-page was requested and failed, fall back to viewport-only.
    if (fullPage) {
      await page.screenshot({
        path: filepath,
        fullPage: false,
        type: 'jpeg',
        quality: 85,
        timeout: 30000,
      });
    } else {
      throw err;
    }
  }

  return path.relative(process.cwd(), filepath);
}

module.exports = { generateMockup, generateVideoMockup };
