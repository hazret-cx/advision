import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Map file extensions to MIME types
const MIME_MAP = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.ico':  'image/x-icon',
};

/**
 * GET /api/creative-html/<creativeId>/<...rest>
 *
 * Serves static files from uploads/<creativeId>/ directory.
 * Used by the Phase 2 iframe injection: Playwright loads the publisher page,
 * we inject an <iframe src="http://localhost:3000/api/creative-html/<id>/index.html">
 * and the banner's JS/CSS/image assets are served through here.
 *
 * slug = ['<creativeId>', 'index.html']
 *     or ['<creativeId>', 'images', 'abc.png']  etc.
 */
export async function GET(request, { params }) {
  try {
    const { slug } = await params;

    if (!slug || slug.length < 2) {
      return new NextResponse('Not found', { status: 404 });
    }

    const [creativeId, ...rest] = slug;

    // Security: reject any path traversal attempts
    const decodedParts = rest.map(decodeURIComponent);
    if (decodedParts.some(p => p.includes('..'))) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const filePath = path.join(UPLOADS_DIR, creativeId, ...decodedParts);

    // Security: ensure the resolved path is inside uploads/<creativeId>/
    const bannerDir = path.join(UPLOADS_DIR, creativeId);
    if (!filePath.startsWith(bannerDir)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return new NextResponse('Not found', { status: 404 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_MAP[ext] || 'application/octet-stream';
    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'no-store',
        // Allow the iframe inside Playwright to load all sub-resources
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('[creative-html] Error:', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
