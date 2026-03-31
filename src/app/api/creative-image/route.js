import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('id');

    if (!filename) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Security: sanitize filename
    const sanitized = path.basename(filename);
    const fullPath = path.join(process.cwd(), 'uploads', sanitized);

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(sanitized).toLowerCase();

    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
    };

    const contentType = mimeMap[ext] || 'image/png';
    const headers = {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${path.basename(fullPath)}"`,
      'Cache-Control': 'public, max-age=86400',
    };
    if (contentType === 'video/mp4') {
      headers['Accept-Ranges'] = 'bytes';
    }
    return new NextResponse(buffer, { headers });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
