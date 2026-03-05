import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(request) {
  try {
    const { campaignId, files, accessToken } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }
    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
    }
    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const db = require('../../../lib/db');
    const uploaded = [];

    const mimeToExt = {
      'image/png':  '.png',
      'image/jpeg': '.jpg',
      'image/gif':  '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };

    for (const driveFile of files) {
      const { id: driveId, name: originalName, mimeType } = driveFile;

      // Download file content from Google Drive
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!driveRes.ok) {
        console.warn(`Failed to download Drive file ${driveId}: ${driveRes.status}`);
        continue;
      }

      const arrayBuffer = await driveRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const ext = mimeToExt[mimeType] || path.extname(originalName).toLowerCase() || '.png';
      const id = uuidv4();
      const filename = `${id}${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);

      fs.writeFileSync(filepath, buffer);

      let width = 0, height = 0;
      try {
        const metadata = await sharp(buffer).metadata();
        width  = metadata.width  || 0;
        height = metadata.height || 0;
      } catch (err) {
        console.warn(`Could not detect dimensions for ${originalName}:`, err.message);
      }

      const resolvedMime = mimeType || 'image/png';
      const creative = db.addCreative(
        id, campaignId, filename, originalName,
        width, height, filepath, buffer.length, resolvedMime
      );

      uploaded.push(creative);
    }

    return NextResponse.json({ uploaded, count: uploaded.length }, { status: 201 });

  } catch (err) {
    console.error('Drive upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
