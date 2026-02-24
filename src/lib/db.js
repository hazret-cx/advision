const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'db', 'advision.db');

let _db = null;

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initTables(_db);
  }
  return _db;
}

function initTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      brand_safety_rules TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS creatives (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      mime_type TEXT,
      uploaded_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mockups (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      publisher_url TEXT NOT NULL,
      publisher_domain TEXT,
      screenshot_path TEXT,
      status TEXT DEFAULT 'pending',
      slots_detected INTEGER DEFAULT 0,
      slots_matched INTEGER DEFAULT 0,
      brand_safety_action TEXT DEFAULT 'safe',
      brand_safety_result TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slot_matches (
      id TEXT PRIMARY KEY,
      mockup_id TEXT NOT NULL,
      creative_id TEXT,
      slot_selector TEXT,
      slot_x INTEGER,
      slot_y INTEGER,
      slot_width INTEGER NOT NULL,
      slot_height INTEGER NOT NULL,
      matched INTEGER DEFAULT 0,
      injected INTEGER DEFAULT 0,
      match_tier TEXT,
      FOREIGN KEY (mockup_id) REFERENCES mockups(id) ON DELETE CASCADE,
      FOREIGN KEY (creative_id) REFERENCES creatives(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_creatives_campaign ON creatives(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_creatives_size ON creatives(width, height);
    CREATE INDEX IF NOT EXISTS idx_mockups_campaign ON mockups(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_slot_matches_mockup ON slot_matches(mockup_id);
  `);

  // Migration: match_tier on slot_matches
  const slotCols = db.prepare('PRAGMA table_info(slot_matches)').all();
  if (!slotCols.some(c => c.name === 'match_tier')) {
    db.exec('ALTER TABLE slot_matches ADD COLUMN match_tier TEXT');
  }

  // Migration: brand_safety_rules on campaigns
  const campaignCols = db.prepare('PRAGMA table_info(campaigns)').all();
  if (!campaignCols.some(c => c.name === 'brand_safety_rules')) {
    db.exec('ALTER TABLE campaigns ADD COLUMN brand_safety_rules TEXT');
  }

  // Migration: brand safety result columns on mockups
  const mockupCols = db.prepare('PRAGMA table_info(mockups)').all();
  if (!mockupCols.some(c => c.name === 'brand_safety_action')) {
    db.exec('ALTER TABLE mockups ADD COLUMN brand_safety_action TEXT DEFAULT \'safe\'');
  }
  if (!mockupCols.some(c => c.name === 'brand_safety_result')) {
    db.exec('ALTER TABLE mockups ADD COLUMN brand_safety_result TEXT');
  }
}

// ─── Campaign queries ───────────────────────────────────────────────

function createCampaign(id, name, clientName, brandSafetyRules = null) {
  const db = getDb();
  db.prepare('INSERT INTO campaigns (id, name, client_name, brand_safety_rules) VALUES (?, ?, ?, ?)').run(
    id, name, clientName, brandSafetyRules ? JSON.stringify(brandSafetyRules) : null
  );
  return getCampaign(id);
}

function getCampaign(id) {
  return getDb().prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
}

function listCampaigns() {
  return getDb().prepare('SELECT * FROM campaigns ORDER BY updated_at DESC').all();
}

// ─── Creative queries ───────────────────────────────────────────────

function addCreative(id, campaignId, filename, originalName, width, height, filePath, fileSize, mimeType) {
  const db = getDb();
  db.prepare(`
    INSERT INTO creatives (id, campaign_id, filename, original_name, width, height, file_path, file_size, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, campaignId, filename, originalName, width, height, filePath, fileSize, mimeType);
  return getCreative(id);
}

function getCreative(id) {
  return getDb().prepare('SELECT * FROM creatives WHERE id = ?').get(id);
}

function listCreatives(campaignId) {
  return getDb().prepare('SELECT * FROM creatives WHERE campaign_id = ? ORDER BY uploaded_at DESC').all(campaignId);
}

function getCreativesBySize(campaignId, width, height) {
  return getDb().prepare('SELECT * FROM creatives WHERE campaign_id = ? AND width = ? AND height = ?').all(campaignId, width, height);
}

// ─── Mockup queries ─────────────────────────────────────────────────

function createMockup(id, campaignId, publisherUrl, publisherDomain) {
  const db = getDb();
  db.prepare(`
    INSERT INTO mockups (id, campaign_id, publisher_url, publisher_domain)
    VALUES (?, ?, ?, ?)
  `).run(id, campaignId, publisherUrl, publisherDomain);
  return getMockup(id);
}

function getMockup(id) {
  return getDb().prepare('SELECT * FROM mockups WHERE id = ?').get(id);
}

function updateMockup(id, fields) {
  const db = getDb();
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values = Object.values(fields);
  db.prepare(`UPDATE mockups SET ${sets} WHERE id = ?`).run(...values, id);
  return getMockup(id);
}

function listMockups(campaignId) {
  return getDb().prepare('SELECT * FROM mockups WHERE campaign_id = ? ORDER BY created_at DESC').all(campaignId);
}

function findExistingMockup(campaignId, publisherUrl) {
  return getDb().prepare(
    'SELECT * FROM mockups WHERE campaign_id = ? AND publisher_url = ? ORDER BY created_at DESC LIMIT 1'
  ).get(campaignId, publisherUrl);
}

// ─── Slot match queries ─────────────────────────────────────────────

function addSlotMatch(id, mockupId, creativeId, selector, x, y, width, height, matched, injected, matchTier = null) {
  const db = getDb();
  db.prepare(`
    INSERT INTO slot_matches (id, mockup_id, creative_id, slot_selector, slot_x, slot_y, slot_width, slot_height, matched, injected, match_tier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, mockupId, creativeId, selector, x, y, width, height, matched ? 1 : 0, injected ? 1 : 0, matchTier);
}

function getSlotMatches(mockupId) {
  return getDb().prepare('SELECT * FROM slot_matches WHERE mockup_id = ?').all(mockupId);
}

module.exports = {
  getDb,
  createCampaign, getCampaign, listCampaigns,
  addCreative, getCreative, listCreatives, getCreativesBySize,
  createMockup, getMockup, updateMockup, listMockups, findExistingMockup,
  addSlotMatch, getSlotMatches,
};
