# Video Mockup Feature — Design Spec

**Date:** 2026-03-31
**Status:** Approved
**Project:** AdVision

---

## Overview

Add support for video ad creatives (MP4 pre-roll assets) in AdVision. When a video creative is uploaded, the tool records a browser video of the publisher page with the creative injected into a detected video player slot — instead of generating a static screenshot mockup.

---

## Goals

- Upload MP4 video creatives alongside existing image creatives
- Detect video player slots on publisher pages (Tier 0 detection)
- Inject the MP4 creative into the detected slot via a `<video>` element overlay
- Record the full 1440×900 browser viewport using Playwright's built-in `recordVideo`
- Convert the `.webm` output to `.mp4` via ffmpeg (bundled, no system dependency)
- Display the resulting `.mp4` in a video player in Step 4 (ScreenshotViewer)
- Give users control over recording duration: creative length or fixed seconds

---

## Non-Goals

- No support for VAST/VPAID ad serving (creative is injected directly, not via ad server)
- No support for formats other than MP4 (WebM, MOV out of scope)
- No video editing or trimming in the UI
- No changes to the image mockup pipeline

---

## Architecture

The video path runs parallel to the existing image path. MIME type on the `creatives` record (`video/mp4`) determines which path is taken at scrape time.

```
Upload (MP4)
    │
    ▼
/api/upload           ← extend to accept video/mp4
    │
    ▼
CreativeUploader      ← show video preview + duration for MP4 creatives
    │
    ▼
/api/scrape           ← branch on creative MIME type: image → generateMockup(), video → generateVideoMockup()
    │
    ▼
mockup.js             ← new generateVideoMockup() function
    │
    ├── Playwright context with recordVideo enabled
    ├── Navigate + CMP bypass (existing logic reused)
    ├── Detect video slots (Tier 0 + fallback to existing tiers)
    ├── Inject <video autoplay muted> at slot coordinates
    ├── Wait for duration (creative length OR fixed seconds)
    ├── Close context → .webm written by Playwright
    └── ffmpeg: .webm → .mp4 (H.264, -movflags faststart)
    │
    ▼
/api/video            ← new route, serves .mp4 with Accept-Ranges support
    │
    ▼
ScreenshotViewer      ← render <video> player if mockup.type === 'video'
```

---

## Data Model Changes

### `mockups` table — 2 new columns

```sql
ALTER TABLE mockups ADD COLUMN type TEXT NOT NULL DEFAULT 'image';
-- Values: 'image' | 'video'

ALTER TABLE mockups ADD COLUMN duration_seconds INTEGER;
-- null for image mockups; set to actual recording duration for video mockups
```

### `creatives` table — no changes

The existing `mime_type` column already distinguishes `video/mp4` from image types. No schema changes needed.

### File storage

| Asset | Path | Notes |
|-------|------|-------|
| Uploaded MP4 creative | `/uploads/{uuid}.mp4` | Same pattern as images |
| Playwright recording (temp) | `/screenshots/{campaignId}/{name}.webm` | Deleted after conversion |
| Final output | `/screenshots/{campaignId}/{name}.mp4` | Served via `/api/video` |

---

## Pre-Roll Slot Detection (Tier 0)

A new **Tier 0** detection pass is added to `detector.js`, running before all existing tiers. It targets video player elements specifically.

**Detection rules:**

1. **Native `<video>` elements** — any `<video>` element with rendered dimensions ≥ 400×300
2. **Video player class/ID patterns:**
   - `jwplayer`, `jw-video`, `jw-wrapper`
   - `video-js`, `vjs-tech`, `vjs-video-container`
   - `brightcove`, `bc-player`, `bmpui-video`
   - `flowplayer`, `kaltura-player`, `mews-video`
3. **VAST/VPAID container attributes:**
   - `data-vast`, `data-vpaid`, `data-video-ad`, `data-player`

**Output shape:** identical to existing slot objects — `{ x, y, width, height, selector, source: 'video-player', visible }`.

**Fallback:** if no Tier 0 slots are found, falls through to existing Tier 1–5 detection (banner sizes). This allows the tool to still attempt a match if the page uses non-standard video player markup.

---

## Video Mockup Pipeline (`generateVideoMockup`)

New function in `src/lib/mockup.js`:

### Steps

1. **Launch Playwright context** with `recordVideo: { dir: tempDir, size: { width: 1440, height: 900 } }`
2. **Navigate** to publisher URL using existing CMP bypass logic
3. **Detect slots** — Tier 0 first, fallback to existing tiers
4. **Serve creative locally** — the uploaded MP4 is served via the existing `/api/creative-image` route (extended to handle MP4 MIME type)
5. **Inject creative** via `page.evaluate()`:
   ```js
   const video = document.createElement('video')
   video.src = '/api/creative-image?id={filename}'
   video.style.cssText = `position:fixed;left:{x}px;top:{y}px;width:{width}px;height:{height}px;z-index:9999;object-fit:contain`
   video.autoplay = true
   video.muted = true
   video.loop = false
   document.body.appendChild(video)
   ```
6. **Wait for duration:**
   - `creative_length`: `page.waitForFunction(() => document.querySelector('video[data-advision]').ended, { timeout: 120000 })`
   - `fixed`: `await new Promise(r => setTimeout(r, durationSeconds * 1000))`
7. **Close context** — Playwright writes `.webm` to temp dir
8. **Convert** via `fluent-ffmpeg`: `.webm` → `.mp4` with `-vcodec libx264 -movflags faststart`
9. **Delete** temp `.webm`
10. **Save** `.mp4` path to `mockups.screenshot_path`, set `type = 'video'`, `duration_seconds`

### Error handling

- If no video slot detected: fall back to standard screenshot mockup, log warning
- If ffmpeg conversion fails: retain `.webm`, return error in mockup record
- Timeout (120s) on `waitForFunction` for creative-length mode

---

## API Changes

### `/api/upload` (extended)

- Add `video/mp4` to accepted MIME types
- Skip Sharp dimension detection for video files
- Use `ffprobe` (bundled with ffmpeg) to extract video width, height, duration
- Store duration in a new `creatives.duration_seconds` column

### `/api/scrape` (extended)

- After matching creatives to slots, check if any matched creative is `video/mp4`
- If yes: call `generateVideoMockup(url, creative, slot, options)` instead of `generateMockup()`
- Pass `recordingMode` (`creative_length` | `fixed`) and `durationSeconds` from request body

### `/api/video` (new)

Mirrors `/api/screenshot` exactly, with two additions:
- `Content-Type: video/mp4`
- `Accept-Ranges: bytes` header (required for browser video seeking/scrubbing)

### `/api/creative-image` (extended)

- Handle MP4 MIME type: serve with `Content-Type: video/mp4`
- Existing image logic unchanged

---

## UI Changes

### Step 2 — `CreativeUploader`

- Add `video/mp4` to accepted types in `<input accept>` and drag-drop validation
- For MP4 uploads: show `<video>` element as preview instead of `<img>`
- Display detected duration (from ffprobe metadata) alongside dimensions
- Visual badge: "Pre-Roll Video" label on video creative cards

### Step 3 — `UrlInput`

- Add **Recording Duration** control, visible only when the active campaign has ≥1 video creative:
  - Radio group: `Creative length` | `Fixed duration`
  - If `Fixed duration` selected: number input (seconds), default 15, min 5, max 120
- Pass `recordingMode` and `durationSeconds` in the scrape API request body

### Step 4 — `ScreenshotViewer`

- Check `mockup.type` for each result card:
  - `'image'` → existing `<img>` display (no change)
  - `'video'` → `<video controls autoplay={false} src="/api/video?path=...">` player
- Download button: serves `.mp4` directly (existing download logic, path already correct)
- Video cards show a "Video Mockup" badge and duration label

---

## Dependencies

| Package | Purpose | Bundled binary? |
|---------|---------|----------------|
| `fluent-ffmpeg` | Node.js ffmpeg wrapper | No |
| `@ffmpeg-installer/ffmpeg` | Bundles ffmpeg binary | Yes — no system install needed |

No other new dependencies. Playwright is already installed.

---

## Migration

```sql
-- Run once on next startup (db.js initialisation block)
ALTER TABLE mockups ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'image';
ALTER TABLE mockups ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
```

SQLite does not support `IF NOT EXISTS` on `ALTER TABLE` — wrap each in a try/catch in `db.js` to handle re-runs safely.

---

## Testing Checklist

- [ ] MP4 upload accepted, dimensions + duration extracted correctly
- [ ] Non-MP4 video formats rejected with clear error message
- [ ] Tier 0 detection finds `<video>` elements on a page with a video player
- [ ] Creative injected at correct coordinates with correct dimensions
- [ ] `creative_length` mode: recording stops when video ends
- [ ] `fixed` mode: recording stops at specified seconds
- [ ] `.webm` deleted after successful conversion
- [ ] `.mp4` plays correctly in ScreenshotViewer
- [ ] Video seeking works (Accept-Ranges header present)
- [ ] Download button retrieves `.mp4`
- [ ] Image mockup pipeline unaffected by all changes
- [ ] DB migration runs cleanly on existing database
