const { NextResponse } = require('next/server');
const { v4: uuidv4 } = require('uuid');
const db = require('../../../lib/db');
const { getProfileRules } = require('../../../lib/brandSafety');

// GET /api/campaign — list all campaigns
export async function GET() {
  try {
    const campaigns = db.listCampaigns();
    return NextResponse.json({ campaigns });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/campaign — create a new campaign
export async function POST(request) {
  try {
    const { name, clientName, brandSafetyProfile, customKeywords, brandSafetyAction } = await request.json();

    if (!name || !clientName) {
      return NextResponse.json({ error: 'name and clientName are required' }, { status: 400 });
    }

    // Build brand safety rules from profile if provided
    let brandSafetyRules = null;
    if (brandSafetyProfile && brandSafetyProfile !== 'none') {
      brandSafetyRules = getProfileRules(
        brandSafetyProfile,
        customKeywords || [],
        brandSafetyAction || 'warn'
      );
    }

    const id = uuidv4();
    const campaign = db.createCampaign(id, name, clientName, brandSafetyRules);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
