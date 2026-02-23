# AdVision

**Ad Placement Discovery & Creative Preview Tool**

An internal tool for the Alkimi Exchange Commercial team to generate realistic ad placement mockups on live publisher pages. Paste a URL, upload creatives, and get a screenshot with your ads rendered in the actual ad slots.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browser (runs automatically via postinstall, or manually)
npx playwright install chromium

# 3. Start the dev server
npm run dev

# 4. Open http://localhost:3000
```

## How It Works

1. **Create a campaign** — name it by client and project
2. **Upload creatives** — drag & drop your ad images (PNG, JPG, GIF). Dimensions are detected automatically
3. **Enter publisher URLs** — paste one or more URLs (e.g., bloomberg.com/technology)
4. **AdVision does the rest:**
   - Loads each page in a headless browser
   - Detects ad slots (GPT tags, Prebid, iframes, common ad containers)
   - Matches slots to your creatives by exact size
   - Injects your creatives into matching slots
   - Captures a full-page screenshot
5. **Download** the screenshot and drop it straight into your deck

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + Tailwind CSS |
| Backend | Next.js API Routes (Node.js) |
| Browser Engine | Playwright (Chromium) |
| Database | SQLite via better-sqlite3 |
| Image Processing | Sharp |

## Project Structure

```
advision/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── api/
│   │   │   ├── campaign/     # Campaign CRUD
│   │   │   ├── upload/       # Creative upload + dimension detection
│   │   │   ├── scrape/       # URL scraping + mockup generation
│   │   │   ├── screenshot/   # Serve generated screenshots
│   │   │   └── creative-image/ # Serve creative thumbnails
│   │   ├── layout.js
│   │   ├── page.js
│   │   └── globals.css
│   ├── components/
│   │   ├── CampaignSelector.js
│   │   ├── CreativeUploader.js
│   │   ├── UrlInput.js
│   │   ├── MatchReport.js
│   │   └── ScreenshotViewer.js
│   └── lib/
│       ├── db.js             # SQLite database layer
│       ├── detector.js       # Ad slot detection engine
│       ├── matcher.js        # Size matching engine
│       ├── browser.js        # Playwright browser manager
│       └── mockup.js         # Mockup orchestrator
├── uploads/                  # Uploaded creative files
├── screenshots/              # Generated mockup screenshots
├── db/                       # SQLite database file
└── package.json
```

## Ad Slot Detection

AdVision detects ad containers using a priority-ordered approach:

1. **Google Publisher Tag (GPT)** — `div-gpt-ad-*` IDs, `data-google-query-id`
2. **Prebid.js** — `data-adslot-name`, `data-adunit` attributes
3. **Generic patterns** — class/ID names containing `ad-slot`, `ad-unit`, `advertisement`, etc.
4. **Ad iframes** — iframes sourcing from known ad domains (DoubleClick, AdNxS, Criteo, etc.)
5. **Size heuristic** — elements matching standard IAB dimensions as a fallback

## Supported IAB Sizes

300×250, 728×90, 160×600, 970×250, 300×600, 320×50, 970×90, 336×280, 120×600, 468×60, and more.

## Configuration

The tool works out of the box with sensible defaults. Key settings are in:

- `src/lib/browser.js` — viewport size, user agent, proxy settings
- `src/lib/detector.js` — ad slot detection selectors and IAB size list
- `next.config.js` — API timeout settings

## Troubleshooting

**Publisher page blocks the headless browser:**
Edit `src/lib/browser.js` to use a different user agent or add proxy configuration.

**Ad slots not detected:**
Some publishers use non-standard containers. Use the browser DevTools to find the CSS selector and add it to the detection patterns in `src/lib/detector.js`.

**Screenshots are slow:**
Each URL takes 15-30 seconds due to page loading, ad rendering, and scroll detection. This is expected for the MVP.

---

Built for the Alkimi Exchange Commercial team. Internal use only.
