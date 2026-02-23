import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'screenshots');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(request) {
  try {
    const { mockupId, screenshotPath, placements } = await request.json();

    if (!mockupId || !screenshotPath || !Array.isArray(placements)) {
      return NextResponse.json(
        { error: 'mockupId, screenshotPath, and placements are required' },
        { status: 400 }
      );
    }

    const db = require('../../../lib/db');
    const mockup = db.getMockup(mockupId);
    if (!mockup) {
      return NextResponse.json({ error: 'Mockup not found' }, { status: 404 });
    }

    // Validate screenshotPath is within screenshots dir
    const fullScreenshotPath = path.join(process.cwd(), screenshotPath);
    if (!fullScreenshotPath.startsWith(SCREENSHOTS_DIR)) {
      return NextResponse.json({ error: 'Invalid screenshot path' }, { status: 403 });
    }

    const screenshotBuffer = await fs.promises.readFile(fullScreenshotPath);

    // Build composite inputs
    const compositeInputs = [];

    for (const placement of placements) {
      const { x, y, width, height, creativeId, fitMode } = placement;

      if (!creativeId || width <= 0 || height <= 0) continue;

      const creative = db.getCreative(creativeId);
      if (!creative) continue;

      const creativeBuffer = await fs.promises.readFile(
        path.join(UPLOADS_DIR, creative.filename)
      );

      const resized = await sharp(creativeBuffer)
        .resize(Math.round(width), Math.round(height), {
          fit: fitMode || 'contain',
          background:
            fitMode === 'contain' || !fitMode
              ? { r: 255, g: 255, b: 255, alpha: 0 }
              : undefined,
          position: 'centre',
        })
        .png()
        .toBuffer();

      compositeInputs.push({ input: resized, left: Math.round(x), top: Math.round(y) });
    }

    // Build output path
    const campaignId = mockup.campaign_id;
    const domain = mockup.publisher_domain || 'unknown';
    const outputFilename = `${domain}_edited_${mockupId.slice(0, 8)}.png`;
    const campaignDir = path.join(SCREENSHOTS_DIR, campaignId);
    await fs.promises.mkdir(campaignDir, { recursive: true });
    const outputPath = path.join(campaignDir, outputFilename);

    // Composite and save
    await sharp(screenshotBuffer)
      .composite(compositeInputs)
      .png()
      .toFile(outputPath);

    const relativePath = path.relative(process.cwd(), outputPath);

    // Update mockup record
    db.updateMockup(mockupId, { screenshot_path: relativePath });

    return NextResponse.json({ screenshotPath: relativePath });
  } catch (err) {
    console.error('Compose error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
