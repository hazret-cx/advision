import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

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

// We use the web API for file handling in Next.js App Router
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(request) {
  try {
    const formData = await request.formData();
    const campaignId = formData.get('campaignId');

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const files = formData.getAll('creatives');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    // Lazy load DB to avoid issues at import time
    const db = require('../../../lib/db');

    const uploaded = [];

    for (const file of files) {
      if (!file || typeof file === 'string') continue;

      const id = uuidv4();
      const ext = path.extname(file.name).toLowerCase() || '.png';
      const filename = `${id}${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);

      // Write file to disk
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      fs.writeFileSync(filepath, buffer);

      // Detect dimensions (and duration for video)
      let width = 0;
      let height = 0;
      let durationSeconds = null;

      // Determine MIME type
      const mimeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
      };
      const mimeType = mimeMap[ext] || file.type || 'image/png';

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

      uploaded.push(creative);
    }

    return NextResponse.json({
      uploaded,
      count: uploaded.length,
    }, { status: 201 });

  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/upload?campaignId=xxx — list creatives for a campaign
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    const db = require('../../../lib/db');
    const creatives = db.listCreatives(campaignId);
    return NextResponse.json({ creatives });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
