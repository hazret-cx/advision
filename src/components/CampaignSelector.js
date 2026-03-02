'use client';

import { useState, useEffect } from 'react';

export default function CampaignSelector({ onSelect }) {
  const [campaigns, setCampaigns]   = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName]             = useState('');
  const [clientName, setClientName] = useState('');
  const [creating, setCreating]     = useState(false);

  useEffect(() => { fetchCampaigns(); }, []);

  async function fetchCampaigns() {
    try {
      const res  = await fetch('/api/campaign');
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim() || !clientName.trim()) return;
    setCreating(true);
    try {
      const res  = await fetch('/api/campaign', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), clientName: clientName.trim() }),
      });
      const data = await res.json();
      if (data.campaign) onSelect(data.campaign);
    } catch (err) {
      console.error('Failed to create campaign:', err);
    } finally {
      setCreating(false);
    }
  }

  const inputStyle = {
    width:        '100%',
    padding:      '10px 14px',
    background:   'rgba(255,255,255,0.05)',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color:        '#fff',
    fontFamily:   'var(--font-body)',
    fontSize:     14,
    outline:      'none',
    boxSizing:    'border-box',
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
        Select or Create a Campaign
      </h2>
      <p style={{ color: '#7A7A85', marginBottom: 24, fontSize: 14, fontFamily: 'var(--font-body)' }}>
        Campaigns group your creatives and mockups together by client and project.
      </p>

      {/* ── Existing campaigns ── */}
      {campaigns.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A7A85', marginBottom: 12, fontFamily: 'var(--font-body)' }}>
            Existing Campaigns
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                style={{
                  textAlign:    'left',
                  padding:      20,
                  background:   'rgba(255,255,255,0.03)',
                  border:       '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  cursor:       'pointer',
                  transition:   'all 0.2s',
                  fontFamily:   'var(--font-body)',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.borderColor = '#5C26FF';
                  e.currentTarget.style.background  = 'rgba(92,38,255,0.06)';
                  e.currentTarget.style.boxShadow   = '0 4px 24px rgba(92,38,255,0.15)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                  e.currentTarget.style.background  = 'rgba(255,255,255,0.03)';
                  e.currentTarget.style.boxShadow   = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{c.name}</div>
                    <div style={{ fontSize: 13, color: '#7A7A85', marginTop: 4 }}>{c.client_name}</div>
                  </div>
                  <span style={{ color: '#5C26FF', fontSize: 18 }}>→</span>
                </div>
                <div style={{ fontSize: 11, color: '#7A7A85', marginTop: 12 }}>
                  Created {new Date(c.created_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Create new ── */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          style={{
            width:        '100%',
            padding:      20,
            border:       '2px dashed rgba(255,255,255,0.1)',
            borderRadius: 12,
            background:   'transparent',
            color:        '#7A7A85',
            cursor:       'pointer',
            textAlign:    'center',
            fontFamily:   'var(--font-body)',
            transition:   'all 0.2s',
          }}
          onMouseOver={e => {
            e.currentTarget.style.borderColor = '#5C26FF';
            e.currentTarget.style.color       = '#8A5CFF';
          }}
          onMouseOut={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color       = '#7A7A85';
          }}
        >
          <span style={{ fontSize: 24, display: 'block', marginBottom: 8 }}>+</span>
          <span style={{ fontWeight: 500, fontSize: 14 }}>Create New Campaign</span>
        </button>
      ) : (
        <form
          onSubmit={handleCreate}
          style={{
            background:   'rgba(255,255,255,0.03)',
            border:       '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding:      24,
          }}
        >
          <h3 style={{ fontWeight: 600, color: '#fff', marginBottom: 16, fontSize: 15, fontFamily: 'var(--font-body)' }}>
            New Campaign
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#C8C8D0', marginBottom: 6, fontFamily: 'var(--font-body)' }}>
                Client Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="e.g. PMI, Kraken, PayPal"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#5C26FF'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                autoFocus
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#C8C8D0', marginBottom: 6, fontFamily: 'var(--font-body)' }}>
                Campaign Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Q1 2026 Display, Brand Awareness"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = '#5C26FF'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button
              type="submit"
              disabled={creating || !name.trim() || !clientName.trim()}
              style={{
                padding:      '10px 20px',
                background:   '#5C26FF',
                color:        '#fff',
                border:       'none',
                borderRadius: 999,
                fontFamily:   'var(--font-body)',
                fontWeight:   500,
                fontSize:     13,
                cursor:       creating || !name.trim() || !clientName.trim() ? 'not-allowed' : 'pointer',
                opacity:      creating || !name.trim() || !clientName.trim() ? 0.5 : 1,
                transition:   'all 0.2s',
              }}
            >
              {creating ? 'Creating…' : 'Create Campaign'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              style={{ background: 'none', border: 'none', color: '#7A7A85', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13 }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
