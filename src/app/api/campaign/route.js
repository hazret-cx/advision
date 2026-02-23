const { NextResponse } = require('next/server');
const { v4: uuidv4 } = require('uuid');
const db = require('../../../lib/db');

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
    const { name, clientName } = await request.json();

    if (!name || !clientName) {
      return NextResponse.json({ error: 'name and clientName are required' }, { status: 400 });
    }

    const id = uuidv4();
    const campaign = db.createCampaign(id, name, clientName);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
