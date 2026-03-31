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
