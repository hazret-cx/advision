import { NextResponse } from 'next/server';

export const maxDuration = 300; // Allow up to 5 minutes for video recording + conversion

export async function POST(request) {
  try {
    const { campaignId, urls, recordingMode = 'fixed', durationSeconds = 15 } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'urls array is required' }, { status: 400 });
    }

    if (urls.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 URLs per request' }, { status: 400 });
    }

    const db = require('../../../lib/db');
    const { generateMockup, generateVideoMockup } = require('../../../lib/mockup');

    const creatives = db.listCreatives(campaignId);

    if (creatives.length === 0) {
      return NextResponse.json({ error: 'No creatives uploaded for this campaign. Upload creatives first.' }, { status: 400 });
    }

    // Separate video and image creatives
    const videoCreatives = creatives.filter(c => c.mime_type === 'video/mp4');
    const imageCreatives = creatives.filter(c => c.mime_type !== 'video/mp4');
    const hasVideo = videoCreatives.length > 0;

    const normalizedEntries = urls.map(u => {
      const raw      = typeof u === 'string' ? u : u.url;
      const fullPage = typeof u === 'object' ? !!u.fullPage : false;
      const href     = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
      return { url: href, fullPage };
    });

    const results = [];
    for (const entry of normalizedEntries) {
      let result;
      if (hasVideo) {
        result = await generateVideoMockup(
          campaignId,
          entry.url,
          videoCreatives[0],
          imageCreatives,
          { recordingMode, durationSeconds: Number(durationSeconds), fullPage: entry.fullPage }
        );
      } else {
        result = await generateMockup(campaignId, entry.url, imageCreatives, { fullPage: entry.fullPage });
      }
      results.push(result);
    }

    const totalSlots   = results.reduce((sum, r) => sum + (r.matchReport?.totalSlotsDetected || 0), 0);
    const totalMatched = results.reduce((sum, r) => sum + (r.matchReport?.totalMatched || 0), 0);
    const totalErrors  = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      campaignId,
      results,
      summary: {
        urlsProcessed: results.length,
        totalSlotsDetected: totalSlots,
        totalSlotsMatched: totalMatched,
        errors: totalErrors,
      },
    });

  } catch (err) {
    console.error('Scrape error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/scrape?campaignId=xxx — list mockups for a campaign
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    const db = require('../../../lib/db');
    const mockups = db.listMockups(campaignId);
    return NextResponse.json({ mockups });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
