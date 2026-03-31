# Video Mockup Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MP4 video creative upload and browser-recording-based video mockup generation to AdVision, running parallel to the existing image pipeline.

**Architecture:** When a campaign has video creatives, `/api/scrape` calls `generateVideoMockup()` instead of `generateMockup()`. That function launches a Playwright context with `recordVideo` enabled, navigates to the publisher URL, injects the MP4 creative into a detected video player slot via a Playwright-intercepted route, waits for the configured duration, then converts the `.webm` recording to `.mp4` via ffmpeg.

**Tech Stack:** Next.js 14, Playwright (already installed), fluent-ffmpeg + @ffmpeg-installer/ffmpeg + @ffprobe-installer/ffprobe (new), better-sqlite3 (existing), React (existing).

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Add 3 packages |
| `src/lib/db.js` | Migrations for new columns + `addCreative` signature |
| `src/app/api/creative-image/route.js` | Serve MP4 with correct Content-Type |
| `src/app/api/upload/route.js` | Accept `video/mp4`, extract metadata via ffprobe |
| `src/lib/detector.js` | Add Tier 0 video player detection |
| `src/lib/browser.js` | Add `createVideoPage(videoDir)` |
| `src/lib/mockup.js` | Add `generateVideoMockup()` |
| `src/app/api/video/route.js` | New — serve `.mp4` with `Accept-Ranges` |
| `src/app/api/scrape/route.js` | Branch to video pipeline, accept duration options |
| `src/components/CreativeUploader.js` | Accept MP4, video preview card, duration display |
| `src/components/UrlInput.js` | Accept `creatives` prop, show duration control for video campaigns |
| `src/app/page.js` | Pass `creatives` to `UrlInput`, thread `recordingMode`/`durationSeconds` through `handleScrape` |
| `src/components/ScreenshotViewer.js` | Render `<video>` player for `type === 'video'` mockups |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd "/Users/hazretcuraj/Documents/Manual Library/advision"
npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe
```

Expected output: `added N packages` with no errors.

- [ ] **Step 2: Verify install**

```bash
node -e "
  const ffmpeg = require('@ffmpeg-installer/ffmpeg');
  const ffprobe = require('@ffprobe-installer/ffprobe');
  console.log('ffmpeg:', ffmpeg.path);
  console.log('ffprobe:', ffprobe.path);
"
```

Expected: two file paths printed, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add fluent-ffmpeg and ffprobe dependencies for video mockups"
```

---

## Task 2: DB migrations — add new columns

**Files:**
- Modify: `src/lib/db.js`

- [ ] **Step 1: Add migrations to `initTables()`**

In `src/lib/db.js`, locate the existing migration block at the bottom of `initTables()` (currently ends around line 100). Add these three migrations immediately after the last existing `if (!mockupCols.some(...)` block:

```js
  // Migration: type and duration_seconds on mockups
  if (!mockupCols.some(c => c.name === 'type')) {
    db.exec("ALTER TABLE mockups ADD COLUMN type TEXT NOT NULL DEFAULT 'image'");
  }
  if (!mockupCols.some(c => c.name === 'duration_seconds')) {
    db.exec('ALTER TABLE mockups ADD COLUMN duration_seconds INTEGER');
  }

  // Migration: duration_seconds on creatives
  const creativeCols = db.prepare('PRAGMA table_info(creatives)').all();
  if (!creativeCols.some(c => c.name === 'duration_seconds')) {
    db.exec('ALTER TABLE creatives ADD COLUMN duration_seconds INTEGER');
  }
```

Note: `mockupCols` is already declared above this point — reuse it. Do NOT redeclare it.

- [ ] **Step 2: Update `addCreative` to accept and store `durationSeconds`**

Replace the existing `addCreative` function:

```js
function addCreative(id, campaignId, filename, originalName, width, height, filePath, fileSize, mimeType, durationSeconds = null) {
  const db = getDb();
  db.prepare(`
    INSERT INTO creatives (id, campaign_id, filename, original_name, width, height, file_path, file_size, mime_type, duration_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, campaignId, filename, originalName, width, height, filePath, fileSize, mimeType, durationSeconds);
  return getCreative(id);
}
```

- [ ] **Step 3: Verify migration runs without error**

```bash
cd "/Users/hazretcuraj/Documents/Manual Library/advision"
node -e "
  const db = require('./src/lib/db');
  const cols = db.getDb().prepare('PRAGMA table_info(mockups)').all();
  console.log('mockup cols:', cols.map(c => c.name).join(', '));
  const ccols = db.getDb().prepare('PRAGMA table_info(creatives)').all();
  console.log('creative cols:', ccols.map(c => c.name).join(', '));
"
```

Expected: output includes `type`, `duration_seconds` in mockup cols and `duration_seconds` in creative cols.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.js
git commit -m "feat: add type and duration_seconds columns for video mockup support"
```

---

## Task 3: Extend `/api/creative-image` to serve MP4

**Files:**
- Modify: `src/app/api/creative-image/route.js`

- [ ] **Step 1: Read the current file**

Read `src/app/api/creative-image/route.js` to understand the existing content-type logic.

- [ ] **Step 2: Add MP4 MIME type support**

In the content-type lookup map (wherever `image/png`, `image/jpeg` etc. are returned), add `.mp4`:

```js
const mimeMap = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.mp4':  'video/mp4',
};
```

Also ensure the response for `.mp4` files includes `Accept-Ranges: bytes` (needed for video playback). Add this to the response headers when the MIME type is `video/mp4`:

```js
const headers = {
  'Content-Type': contentType,
  'Content-Disposition': `inline; filename="${filename}"`,
  'Cache-Control': 'public, max-age=86400',
};
if (contentType === 'video/mp4') {
  headers['Accept-Ranges'] = 'bytes';
}
return new NextResponse(buffer, { headers });
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/creative-image/route.js
git commit -m "feat: serve MP4 creatives via creative-image route"
```

---

## Task 4: Extend `/api/upload` to accept MP4 with metadata extraction

**Files:**
- Modify: `src/app/api/upload/route.js`

- [ ] **Step 1: Add `.mp4` to the MIME map and extract metadata via ffprobe**

Replace the top of the `POST` handler (after the `UPLOADS_DIR` constant) with ffprobe setup:

```js
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Lazy-loaded to avoid import-time issues
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    ffmpeg.setFfprobePath(ffprobeInstaller.path);

    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const videoStream = metadata.streams.find(s => s.codec_type === 'video');
      resolve({
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        duration: Math.round(metadata.format.duration || 0),
      });
    });
  });
}
```

- [ ] **Step 2: Update the MIME map and dimension detection logic in `POST`**

In the `for (const file of files)` loop, replace the existing MIME map and sharp detection block:

```js
      // Determine MIME type
      const mimeMap = {
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif':  'image/gif',
        '.webp': 'image/webp',
        '.svg':  'image/svg+xml',
        '.mp4':  'video/mp4',
      };
      const mimeType = mimeMap[ext] || file.type || 'image/png';

      // Detect dimensions (and duration for video)
      let width = 0;
      let height = 0;
      let durationSeconds = null;

      if (mimeType === 'video/mp4') {
        try {
          const meta = await getVideoMetadata(filepath);
          width = meta.width;
          height = meta.height;
          durationSeconds = meta.duration || null;
        } catch (err) {
          console.warn(`Could not extract video metadata for ${file.name}:`, err.message);
        }
      } else {
        try {
          const metadata = await sharp(buffer).metadata();
          width = metadata.width || 0;
          height = metadata.height || 0;
        } catch (err) {
          console.warn(`Could not detect dimensions for ${file.name}:`, err.message);
        }
      }

      // Save to DB
      const creative = db.addCreative(
        id, campaignId, filename, file.name,
        width, height, filepath, buffer.length, mimeType, durationSeconds
      );
```

- [ ] **Step 3: Update the `<input accept>` description in the drop zone (done in UI task — skip here)**

- [ ] **Step 4: Verify MP4 upload works**

```bash
# Start the dev server in one terminal
cd "/Users/hazretcuraj/Documents/Manual Library/advision" && npm run dev

# In another terminal, test with curl (replace CAMPAIGN_ID with a real one from the DB)
# (This is a manual test — use the UI to upload an MP4 and check the console for metadata)
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/upload/route.js
git commit -m "feat: accept MP4 uploads with ffprobe dimension and duration extraction"
```

---

## Task 5: Add Tier 0 video player detection to `detector.js`

**Files:**
- Modify: `src/lib/detector.js`

- [ ] **Step 1: Add Tier 0 detection inside `buildDetectionScript()`**

In `src/lib/detector.js`, inside the `buildDetectionScript()` function (the returned arrow function), add the following **before** the existing `// ── 1. Google Publisher Tag (GPT)` comment:

```js
    // ── 0. Video player slots (Tier 0 — highest priority) ──────────
    // Detect native <video> elements and common video player wrappers.
    // These are the injection targets for pre-roll video creatives.

    // 0a. Native <video> elements ≥ 400×300
    document.querySelectorAll('video').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width >= 400 && rect.height >= 300) {
        addSlot(el, 'video-player');
      }
    });

    // 0b. Video player wrapper class/id patterns
    const videoPlayerPatterns = [
      'jwplayer', 'jw-video', 'jw-wrapper', 'jw-container',
      'video-js', 'vjs-tech', 'vjs-video-container', 'vjs-fluid',
      'brightcove', 'bc-player', 'bmpui-video',
      'flowplayer', 'kaltura-player', 'mews-video',
    ];

    document.querySelectorAll('div, section, figure').forEach(el => {
      const idAndClass = `${el.id} ${el.className}`.toLowerCase();
      for (const pattern of videoPlayerPatterns) {
        if (idAndClass.includes(pattern)) {
          const rect = el.getBoundingClientRect();
          if (rect.width >= 300 && rect.height >= 200) {
            addSlot(el, 'video-player');
          }
          break;
        }
      }
    });

    // 0c. VAST/VPAID container attributes
    document.querySelectorAll('[data-vast], [data-vpaid], [data-video-ad], [data-player]').forEach(el => {
      addSlot(el, 'video-player');
    });
```

- [ ] **Step 2: Export `detectVideoSlots` as a standalone function for use in `generateVideoMockup`**

Add this function at the bottom of `detector.js`, before `module.exports`:

```js
/**
 * Runs video-specific Tier 0 slot detection on a page.
 * Returns only video player slots. Falls back to all slots if none found.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<Array>} Detected video slots (or all slots as fallback)
 */
async function detectVideoSlots(page) {
  const allSlots = await page.evaluate(buildDetectionScript());
  const videoSlots = allSlots.filter(s => s.source === 'video-player');
  return videoSlots.length > 0 ? videoSlots : allSlots;
}
```

And add `detectVideoSlots` to `module.exports`:

```js
module.exports = {
  detectAdSlots,
  detectVideoSlots,
  injectCreative,
  dismissConsentBanners,
  cleanPageForScreenshot,
  isIabSize,
  IAB_SIZES,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/detector.js
git commit -m "feat: add Tier 0 video player slot detection"
```

---

## Task 6: Add `createVideoPage()` to `browser.js`

**Files:**
- Modify: `src/lib/browser.js`

The key difference from `createPage()`:
1. Accepts a `videoDir` parameter and passes `recordVideo` to the context
2. Does NOT add the route that aborts `**/*.{mp4,webm,...}` (we need the video to load)

- [ ] **Step 1: Add `createVideoPage` function**

In `src/lib/browser.js`, add this function after `createPage`:

```js
/**
 * Like createPage(), but with video recording enabled and without blocking mp4/webm.
 * Used exclusively for video mockup generation.
 *
 * @param {string} videoDir - Directory where Playwright saves the .webm recording
 * @returns {Promise<{page: import('playwright').Page, context: import('playwright').BrowserContext}>}
 */
async function createVideoPage(videoDir) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });

  // Same consent pre-seeding as createPage()
  await context.addInitScript(CONSENT_INIT_SCRIPT);
  await context.addInitScript(SOURCEPOINT_PRESEED_SCRIPT);

  // Block fonts only — do NOT block mp4/webm (we need the video creative to load)
  await context.route('**/*.{woff,woff2,ttf,otf,eot}', route => route.abort());

  // Block ad network scripts (same as createPage)
  const AD_DOMAIN_RE = /doubleclick\.net|googlesyndication\.com|adsafeprotected\.com|amazon-adsystem\.com|pubmatic\.com|rubiconproject\.com|criteo\.com|outbrain\.com|taboola\.com|scorecardresearch\.com|chartbeat\.com|moatads\.com|adnxs\.com|safeframe\.|pagead\//i;
  await context.route('**/*', route =>
    AD_DOMAIN_RE.test(route.request().url()) ? route.abort() : route.continue()
  );

  const page = await context.newPage();
  return { page, context };
}
```

- [ ] **Step 2: Export `createVideoPage`**

Update the `module.exports` at the bottom of `browser.js`:

```js
module.exports = { getBrowser, createPage, createVideoPage, closeBrowser };
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/browser.js
git commit -m "feat: add createVideoPage() with recordVideo enabled for video mockups"
```

---

## Task 7: Add `generateVideoMockup()` to `mockup.js`

**Files:**
- Modify: `src/lib/mockup.js`

- [ ] **Step 1: Add imports at top of `mockup.js`**

The current imports are:
```js
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { createPage } = require('./browser');
const { detectAdSlots, cleanPageForScreenshot } = require('./detector');
const { matchSlots } = require('./matcher');
const db = require('./db');
```

Replace with:
```js
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { createPage, createVideoPage } = require('./browser');
const { detectAdSlots, detectVideoSlots, cleanPageForScreenshot } = require('./detector');
const { matchSlots } = require('./matcher');
const db = require('./db');
```

- [ ] **Step 2: Add the ffmpeg converter helper**

Add this helper function in `mockup.js` after the `SCREENSHOTS_DIR` constant and before `generateMockup`:

```js
/**
 * Convert a .webm file to .mp4 using bundled ffmpeg.
 * Returns the path to the new .mp4 file.
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
```

- [ ] **Step 3: Add `generateVideoMockup()` function**

Add this function after `generateMockup` and before `captureScreenshot`:

```js
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
    // Playwright intercepts ALL network requests regardless of hostname,
    // so we can use any URL that matches this pattern.
    const creativeFilePath = path.join(process.cwd(), 'uploads', videoCreative.filename);
    await page.route(/\/__advision_creative__\//, (route) => {
      const buffer = fs.readFileSync(creativeFilePath);
      route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: buffer,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    });

    // Navigate to the publisher page (uses the CMP bypass already in createVideoPage)
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

    // Detect video slots
    const slots = await detectVideoSlots(page);

    // If no useful slot found, fall back to image mockup
    if (slots.length === 0 && imageCreatives.length > 0) {
      await context.close();
      console.warn(`[VideoMockup] No video slots found for ${url} — falling back to image mockup`);
      db.updateMockup(mockupId, { type: 'image' });
      return generateMockup(campaignId, url, imageCreatives, options);
    }

    // Use the first detected slot
    const slot = slots[0];

    // Build the creative URL using the publisher's origin so it's treated as same-origin
    const publisherOrigin = new URL(url).origin;
    const creativeUrl = `${publisherOrigin}/__advision_creative__/${videoCreative.filename}`;

    // Clean page before injection
    await cleanPageForScreenshot(page);

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
    }, { x: slot.x, y: slot.y, width: slot.width, height: slot.height, src: creativeUrl });

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
        // Get actual duration from video element
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
    // Clean up temp dir on failure
    fs.rmSync(videoDir, { recursive: true, force: true });
    return { mockupId, url, domain, type: 'video', status: 'error', error: err.message };
  } finally {
    if (context) await context.close();
  }
}
```

- [ ] **Step 4: Export `generateVideoMockup`**

Replace the `module.exports` line at the bottom:

```js
module.exports = { generateMockup, generateVideoMockup };
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/mockup.js
git commit -m "feat: add generateVideoMockup() with Playwright recording and ffmpeg conversion"
```

---

## Task 8: Add `/api/video` route

**Files:**
- Create: `src/app/api/video/route.js`

- [ ] **Step 1: Create the route**

```js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 });
    }

    const fullPath = path.join(process.cwd(), filePath);
    const screenshotsDir = path.join(process.cwd(), 'screenshots');

    if (!fullPath.startsWith(screenshotsDir)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const buffer = fs.readFileSync(fullPath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `inline; filename="${path.basename(fullPath)}"`,
        'Cache-Control': 'public, max-age=3600',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/video/route.js
git commit -m "feat: add /api/video route to serve MP4 mockup recordings"
```

---

## Task 9: Extend `/api/scrape` for video pipeline

**Files:**
- Modify: `src/app/api/scrape/route.js`

- [ ] **Step 1: Replace the POST handler**

```js
import { NextResponse } from 'next/server';

export const maxDuration = 300; // Allow up to 5 minutes for video recording + conversion

export async function POST(request) {
  try {
    const { campaignId, urls, recordingMode = 'fixed', durationSeconds = 15 } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'urls array is required' }, { status: 400 });
    }

    if (urls.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 URLs per request' }, { status: 400 });
    }

    const db = require('../../../lib/db');
    const { generateMockup, generateVideoMockup } = require('../../../lib/mockup');

    const creatives = db.listCreatives(campaignId);

    if (creatives.length === 0) {
      return NextResponse.json({ error: 'No creatives uploaded for this campaign. Upload creatives first.' }, { status: 400 });
    }

    // Separate video and image creatives
    const videoCreatives = creatives.filter(c => c.mime_type === 'video/mp4');
    const imageCreatives = creatives.filter(c => c.mime_type !== 'video/mp4');
    const hasVideo = videoCreatives.length > 0;

    const normalizedEntries = urls.map(u => {
      const raw      = typeof u === 'string' ? u : u.url;
      const fullPage = typeof u === 'object' ? !!u.fullPage : false;
      const href     = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
      return { url: href, fullPage };
    });

    const results = [];
    for (const entry of normalizedEntries) {
      let result;
      if (hasVideo) {
        result = await generateVideoMockup(
          campaignId,
          entry.url,
          videoCreatives[0],
          imageCreatives,
          { recordingMode, durationSeconds: Number(durationSeconds), fullPage: entry.fullPage }
        );
      } else {
        result = await generateMockup(campaignId, entry.url, imageCreatives, { fullPage: entry.fullPage });
      }
      results.push(result);
    }

    const totalSlots   = results.reduce((sum, r) => sum + (r.matchReport?.totalSlotsDetected || 0), 0);
    const totalMatched = results.reduce((sum, r) => sum + (r.matchReport?.totalMatched || 0), 0);
    const totalErrors  = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      campaignId,
      results,
      summary: {
        urlsProcessed: results.length,
        totalSlotsDetected: totalSlots,
        totalSlotsMatched: totalMatched,
        errors: totalErrors,
      },
    });

  } catch (err) {
    console.error('Scrape error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/scrape?campaignId=xxx — list mockups for a campaign
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    const db = require('../../../lib/db');
    const mockups = db.listMockups(campaignId);
    return NextResponse.json({ mockups });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/scrape/route.js
git commit -m "feat: branch scrape route to video pipeline for MP4 creatives"
```

---

## Task 10: Update `CreativeUploader` for MP4 support

**Files:**
- Modify: `src/components/CreativeUploader.js`

- [ ] **Step 1: Update the file input `accept` attribute and drop zone text**

Find this line:
```js
<input ref={inputRef} type="file" multiple accept="image/*" onChange={handleChange} className="hidden" />
```

Replace with:
```js
<input ref={inputRef} type="file" multiple accept="image/*,video/mp4" onChange={handleChange} className="hidden" />
```

Find the drop zone hint text:
```js
              Supports PNG, JPG, GIF, WebP — dimensions detected automatically
```

Replace with:
```js
              Supports PNG, JPG, GIF, WebP, MP4 — dimensions detected automatically
```

- [ ] **Step 2: Update the creative thumbnail card to render video preview for MP4**

Find the `creatives.map(c => ...)` block. Inside it, find the thumbnail section:
```js
                <div style={{ aspectRatio: '16/9', background: '#121218', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/creative-image?id=${c.filename}`}
                    alt={c.original_name}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<div style="color:#7A7A85;font-size:11px">Preview unavailable</div>';
                    }}
                  />
                </div>
```

Replace with:
```js
                <div style={{ aspectRatio: '16/9', background: '#121218', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, position: 'relative' }}>
                  {c.mime_type === 'video/mp4' ? (
                    <video
                      src={`/api/creative-image?id=${c.filename}`}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      muted
                      preload="metadata"
                      onMouseOver={e => e.currentTarget.play()}
                      onMouseOut={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/creative-image?id=${c.filename}`}
                      alt={c.original_name}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div style="color:#7A7A85;font-size:11px">Preview unavailable</div>';
                      }}
                    />
                  )}
                </div>
```

- [ ] **Step 3: Update the metadata line under each creative card to show duration and Pre-Roll badge**

Find this block inside `creatives.map`:
```js
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#C8C8D0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                    {c.original_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#5C26FF', fontWeight: 600, marginTop: 4, fontFamily: 'var(--font-body)' }}>
                    {c.width} × {c.height}
                  </div>
                </div>
```

Replace with:
```js
                <div style={{ padding: '10px 12px' }}>
                  {c.mime_type === 'video/mp4' && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#FF8C00', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4, fontFamily: 'var(--font-body)' }}>
                      Pre-Roll Video
                    </div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#C8C8D0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                    {c.original_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#5C26FF', fontWeight: 600, marginTop: 4, fontFamily: 'var(--font-body)' }}>
                    {c.width > 0 && c.height > 0 ? `${c.width} × ${c.height}` : 'Video'}
                    {c.duration_seconds ? ` · ${c.duration_seconds}s` : ''}
                  </div>
                </div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/CreativeUploader.js
git commit -m "feat: add MP4 upload support with video preview and pre-roll badge in CreativeUploader"
```

---

## Task 11: Update `UrlInput` with recording duration control

**Files:**
- Modify: `src/components/UrlInput.js`

- [ ] **Step 1: Add `creatives` prop and recording duration state**

Change the component signature from:
```js
export default function UrlInput({ onScrape, loading }) {
```
To:
```js
export default function UrlInput({ onScrape, loading, creatives = [] }) {
```

Add recording state after the existing `entries` state:
```js
  const hasVideoCreatives = creatives.some(c => c.mime_type === 'video/mp4');
  const [recordingMode, setRecordingMode] = useState('fixed');
  const [recordingDuration, setRecordingDuration] = useState(15);
```

- [ ] **Step 2: Update `handleScrape` to pass recording options**

Replace:
```js
  const handleScrape = useCallback(() => {
    const valid = entries.filter(e => e.url.trim().length > 0);
    if (valid.length > 0) onScrape(valid);
  }, [entries, onScrape]);
```

With:
```js
  const handleScrape = useCallback(() => {
    const valid = entries.filter(e => e.url.trim().length > 0);
    if (valid.length > 0) onScrape(valid, { recordingMode, durationSeconds: recordingDuration });
  }, [entries, onScrape, recordingMode, recordingDuration]);
```

- [ ] **Step 3: Add the duration control UI**

Add the following block between the "Full page hint" block and the "Add URL" button (after the `entries.some(e => e.fullPage)` block):

```js
      {/* ── Video recording duration (shown only when campaign has video creatives) ── */}
      {hasVideoCreatives && (
        <div style={{
          marginBottom:  16,
          padding:       '16px 20px',
          background:    'rgba(255,140,0,0.06)',
          border:        '1px solid rgba(255,140,0,0.2)',
          borderRadius:  12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#FF8C00', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, fontFamily: 'var(--font-body)' }}>
            Video Recording Duration
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {['creative_length', 'fixed'].map(mode => (
              <button
                key={mode}
                onClick={() => setRecordingMode(mode)}
                style={{
                  padding:      '7px 16px',
                  borderRadius: 999,
                  border:       recordingMode === mode ? '1px solid #FF8C00' : '1px solid rgba(255,255,255,0.12)',
                  background:   recordingMode === mode ? 'rgba(255,140,0,0.15)' : 'rgba(255,255,255,0.04)',
                  color:        recordingMode === mode ? '#FF8C00' : '#7A7A85',
                  fontFamily:   'var(--font-body)',
                  fontSize:     12,
                  fontWeight:   600,
                  cursor:       'pointer',
                  transition:   'all 0.15s',
                }}
              >
                {mode === 'creative_length' ? 'Creative length' : 'Fixed duration'}
              </button>
            ))}
            {recordingMode === 'fixed' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={recordingDuration}
                  onChange={e => setRecordingDuration(Math.min(120, Math.max(5, Number(e.target.value))))}
                  style={{
                    width:        64,
                    padding:      '7px 12px',
                    background:   'rgba(255,255,255,0.05)',
                    border:       '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color:        '#fff',
                    fontFamily:   'var(--font-body)',
                    fontSize:     13,
                    outline:      'none',
                  }}
                />
                <span style={{ fontSize: 12, color: '#7A7A85', fontFamily: 'var(--font-body)' }}>seconds (5–120)</span>
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/UrlInput.js
git commit -m "feat: add recording duration control to UrlInput for video campaigns"
```

---

## Task 12: Update `page.js` and `ScreenshotViewer` for video mockups

**Files:**
- Modify: `src/app/page.js`
- Modify: `src/components/ScreenshotViewer.js`

### 12a — `page.js`

- [ ] **Step 1: Pass `creatives` to `UrlInput` and thread recording options through `handleScrape`**

Update the `handleScrape` callback:

```js
  const handleScrape = useCallback(async (entries, videoOptions = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/scrape', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          campaignId:      campaign.id,
          urls:            entries,
          recordingMode:   videoOptions.recordingMode || 'fixed',
          durationSeconds: videoOptions.durationSeconds || 15,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scrape failed');
      setResults(data);
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaign]);
```

Pass `creatives` to `UrlInput`:

```js
        {step === 3 && campaign && <UrlInput onScrape={handleScrape} loading={loading} creatives={creatives} />}
```

### 12b — `ScreenshotViewer.js`

- [ ] **Step 2: Detect video mockups and render a video player**

In `ScreenshotViewer`, find the `/* ── Screenshot display ── */` section. The inner `<div style={{ maxHeight: 700, overflowY: 'auto' }}>` block contains the `<img>` element.

Replace:
```js
        <div style={{ maxHeight: 700, overflowY: 'auto' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/screenshot?path=${encodeURIComponent(current.screenshotPath)}`}
            alt={`Mockup for ${current.domain}`}
            style={{ width: '100%', display: 'block' }}
          />
        </div>
```

With:
```js
        <div style={{ maxHeight: 700, overflowY: 'auto' }}>
          {current.type === 'video' ? (
            <video
              key={current.screenshotPath}
              controls
              style={{ width: '100%', display: 'block', background: '#000' }}
              src={`/api/video?path=${encodeURIComponent(current.screenshotPath)}`}
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/screenshot?path=${encodeURIComponent(current.screenshotPath)}`}
              alt={`Mockup for ${current.domain}`}
              style={{ width: '100%', display: 'block' }}
            />
          )}
        </div>
```

- [ ] **Step 3: Update the download button to use `/api/video` for video mockups**

Find the download `<a>` tag:
```js
          <a
            href={`/api/screenshot?path=${encodeURIComponent(current.screenshotPath)}`}
            download
```

Replace with:
```js
          <a
            href={current.type === 'video'
              ? `/api/video?path=${encodeURIComponent(current.screenshotPath)}`
              : `/api/screenshot?path=${encodeURIComponent(current.screenshotPath)}`}
            download
```

- [ ] **Step 4: Hide the "Edit Mockup" button for video mockups (editing isn't applicable)**

Find the `{onEdit && (` block for the Edit button. Wrap it with a video check:

```js
          {onEdit && current.type !== 'video' && (
```

- [ ] **Step 5: Add a "Video Mockup" badge in the browser chrome bar for video mockups**

In the browser chrome bar info section, find:
```js
          <span style={{ fontSize: 11, color: '#7A7A85', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
            {current.matchReport?.totalMatched || 0} creative(s) injected
          </span>
```

Replace with:
```js
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {current.type === 'video' && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#FF8C00', background: 'rgba(255,140,0,0.15)', border: '1px solid rgba(255,140,0,0.3)', borderRadius: 4, padding: '2px 6px', fontFamily: 'var(--font-body)', letterSpacing: '0.06em' }}>
                VIDEO MOCKUP
              </span>
            )}
            <span style={{ fontSize: 11, color: '#7A7A85', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
              {current.matchReport?.totalMatched || 0} creative(s) injected
            </span>
          </div>
```

- [ ] **Step 6: Commit**

```bash
git add src/app/page.js src/components/ScreenshotViewer.js
git commit -m "feat: wire video recording options through page.js and render video player in ScreenshotViewer"
```

---

## Task 13: Smoke test the full flow

- [ ] **Step 1: Start dev server**

```bash
cd "/Users/hazretcuraj/Documents/Manual Library/advision" && npm run dev
```

- [ ] **Step 2: Manual end-to-end test**

1. Open `http://localhost:3000`
2. Create or select a campaign
3. Upload an MP4 video file — verify:
   - Upload succeeds
   - Creative card shows "Pre-Roll Video" badge
   - Video preview plays on hover
   - Duration is shown (if ffprobe extracted it)
4. Enter a publisher URL that has a video player (e.g. `cnn.com`)
5. Verify the "Video Recording Duration" control appears
6. Select "Fixed duration" and set 10 seconds
7. Click "Generate Mockups"
8. Verify the result shows a video player (not a static image)
9. Verify the "VIDEO MOCKUP" badge appears
10. Click Download — verify an `.mp4` file downloads

- [ ] **Step 3: Verify image pipeline still works**

1. Create a new campaign
2. Upload a PNG image (not MP4)
3. Generate mockups — verify static screenshot still works exactly as before

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: video mockup — full end-to-end implementation complete"
```
