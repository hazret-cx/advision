import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

/**
 * POST /api/upload-html
 *
 * Receives a flat list of files from a webkitdirectory folder picker.
 * Each file's relative path is sent alongside as a matching 'relativePaths' field.
 *
 * Saves the folder to uploads/<uuid>/ preserving the internal structure
 * (index.html + images/ etc). Parses the IAB ad.size meta tag for dimensions.
 * Stores a single 'text/html' creative record in the DB.
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const campaignId = formData.get('campaignId');

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    const files = formData.getAll('files');
    const relativePaths = formData.getAll('relativePaths');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files received' }, { status: 400 });
    }

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // All files belong to a single HTML banner — assign one UUID
    const id = uuidv4();
    const bannerDir = path.join(UPLOADS_DIR, id);
    fs.mkdirSync(bannerDir, { recursive: true });

    let indexHtmlContent = null;
    let originalName = null; // top-level folder name e.g. "2026_Choose_LIC_300x600_UK"
    let totalSize = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = relativePaths[i] || file.name;

      if (typeof file === 'string') continue;

      // Strip .DS_Store and other hidden files
      const basename = path.basename(relPath);
      if (basename.startsWith('.')) continue;

      // relPath looks like: "2026_Choose_LIC_300x600_UK/index.html"
      //                 or: "2026_Choose_LIC_300x600_UK/images/abc.png"
      // We strip the top-level folder so the banner dir contains index.html directly.
      const parts = relPath.split('/');
      if (!originalName && parts.length > 1) originalName = parts[0];
      const localPath = parts.length > 1 ? parts.slice(1).join('/') : relPath;

      // Skip empty local paths (the folder entry itself)
      if (!localPath) continue;

      const fullPath = path.join(bannerDir, localPath);

      // Security: ensure destination is inside bannerDir
      if (!fullPath.startsWith(bannerDir)) continue;

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      fs.writeFileSync(fullPath, buffer);
      totalSize += buffer.length;

      if (localPath === 'index.html') {
        indexHtmlContent = buffer.toString('utf8');
      }
    }

    if (!indexHtmlContent) {
      // Clean up partial write
      fs.rmSync(bannerDir, { recursive: true, force: true });
      return NextResponse.json({ error: 'No index.html found. Make sure you select the banner folder directly.' }, { status: 400 });
    }

    // ── Parse dimensions ───────────────────────────────────────────────
    // Priority 1: IAB standard <meta name="ad.size" content="width=300,height=600">
    // The attribute order in the tag can vary, so try both orderings.
    let width = 0;
    let height = 0;

    const metaPatterns = [
      /name=["']ad\.size["'][^>]*content=["']width=(\d+),\s*height=(\d+)["']/i,
      /content=["']width=(\d+),\s*height=(\d+)["'][^>]*name=["']ad\.size["']/i,
    ];

    for (const pattern of metaPatterns) {
      const m = indexHtmlContent.match(pattern);
      if (m) {
        width = parseInt(m[1], 10);
        height = parseInt(m[2], 10);
        break;
      }
    }

    // Priority 2: Inline style on the root banner div (e.g. width:300px;height:600px)
    if (!width || !height) {
      const styleMatch = indexHtmlContent.match(/width:\s*(\d+)px[^"']*height:\s*(\d+)px/i);
      if (styleMatch) {
        width = parseInt(styleMatch[1], 10);
        height = parseInt(styleMatch[2], 10);
      }
    }

    // Priority 3: NxN pattern in the folder name
    if (!width || !height) {
      const sizeMatch = (originalName || '').match(/(\d{2,4})x(\d{2,4})/i);
      if (sizeMatch) {
        width = parseInt(sizeMatch[1], 10);
        height = parseInt(sizeMatch[2], 10);
      }
    }

    // ── Persist to DB ──────────────────────────────────────────────────
    // filename == id so the rest of the pipeline can find the folder at uploads/<filename>/
    const db = require('../../../lib/db');
    const creative = db.addCreative(
      id,
      campaignId,
      id,                              // filename = UUID = folder name
      originalName || 'html-banner',   // original_name = folder name for display
      width,
      height,
      bannerDir,                       // file_path = absolute path to banner folder
      totalSize,
      'text/html',
      null                             // no duration
    );

    return NextResponse.json({ uploaded: [creative], count: 1 }, { status: 201 });

  } catch (err) {
    console.error('[upload-html] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
