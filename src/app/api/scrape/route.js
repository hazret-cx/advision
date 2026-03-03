import { NextResponse } from 'next/server';

export const maxDuration = 60; // Allow up to 60s for this route

export async function POST(request) {
  try {
    const { campaignId, urls } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: 'campaignId is required' }, { status: 400 });
    }

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'urls array is required' }, { status: 400 });
    }

    if (urls.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 URLs per request' }, { status: 400 });
    }

    // Lazy imports to avoid issues
    const db = require('../../../lib/db');
    const { generateMockup } = require('../../../lib/mockup');

    // Get creatives for this campaign
    const creatives = db.listCreatives(campaignId);

    if (creatives.length === 0) {
      return NextResponse.json({ error: 'No creatives uploaded for this campaign. Upload creatives first.' }, { status: 400 });
    }

    // Normalise — accept both plain strings (legacy) and { url, fullPage } objects
    const normalizedEntries = urls.map(u => {
      const raw      = typeof u === 'string' ? u : u.url;
      const fullPage = typeof u === 'object' ? !!u.fullPage : false;
      const href     = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
      return { url: href, fullPage };
    });

    // Process each URL
    const results = [];
    for (const entry of normalizedEntries) {
      const result = await generateMockup(campaignId, entry.url, creatives, { fullPage: entry.fullPage });
      results.push(result);
    }

    // Build overall summary
    const totalSlots = results.reduce((sum, r) => sum + (r.matchReport?.totalSlotsDetected || 0), 0);
    const totalMatched = results.reduce((sum, r) => sum + (r.matchReport?.totalMatched || 0), 0);
    const totalErrors = results.filter(r => r.status === 'error').length;

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
