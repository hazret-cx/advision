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
    };

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeMap[ext] || 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
