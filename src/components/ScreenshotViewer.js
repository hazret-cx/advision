'use client';

import { useState } from 'react';

export default function ScreenshotViewer({ results, campaign, onEdit }) {
  const [selected, setSelected] = useState(0);

  if (!results || !results.results) return null;

  const completedResults = results.results.filter(r => r.status === 'completed' && r.screenshotPath);

  if (completedResults.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#7A7A85', fontFamily: 'var(--font-body)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
        <div style={{ fontSize: 14 }}>No screenshots were generated. Check the match report above for details.</div>
      </div>
    );
  }

  const current = completedResults[selected];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600, color: '#fff', margin: 0 }}>
          Screenshots
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {onEdit && (
            <button
              onClick={() => onEdit(current)}
              style={{
                padding:      '8px 16px',
                background:   'rgba(255,255,255,0.05)',
                color:        '#C8C8D0',
                border:       '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize:     13,
                fontWeight:   500,
                cursor:       'pointer',
                fontFamily:   'var(--font-body)',
                display:      'flex',
                alignItems:   'center',
                gap:          6,
                transition:   'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              <span>✏️</span> Edit Mockup
            </button>
          )}
          <a
            href={`/api/screenshot?path=${encodeURIComponent(current.screenshotPath)}`}
            download
            style={{
              padding:        '8px 16px',
              background:     '#5C26FF',
              color:          '#fff',
              border:         'none',
              borderRadius:   8,
              fontSize:       13,
              fontWeight:     500,
              cursor:         'pointer',
              fontFamily:     'var(--font-body)',
              display:        'flex',
              alignItems:     'center',
              gap:            6,
              textDecoration: 'none',
              boxShadow:      '0 4px 16px rgba(92,38,255,0.3)',
              transition:     'all 0.2s',
            }}
            onMouseOver={e => e.currentTarget.style.background = '#4A1ECC'}
            onMouseOut={e => e.currentTarget.style.background = '#5C26FF'}
          >
            <span>⬇️</span> Download PNG
          </a>
        </div>
      </div>

      {/* ── Tab selector ── */}
      {completedResults.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {completedResults.map((r, i) => (
            <button
              key={r.mockupId}
              onClick={() => setSelected(i)}
              style={{
                padding:      '8px 16px',
                borderRadius: 8,
                border:       'none',
                fontSize:     13,
                fontWeight:   500,
                whiteSpace:   'nowrap',
                cursor:       'pointer',
                fontFamily:   'var(--font-body)',
                transition:   'all 0.2s',
                background:   i === selected ? '#5C26FF' : 'rgba(255,255,255,0.05)',
                color:        i === selected ? '#fff'     : '#C8C8D0',
              }}
            >
              {r.domain}
            </button>
          ))}
        </div>
      )}

      {/* ── Screenshot display ── */}
      <div style={{
        background:   '#121218',
        border:       '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        overflow:     'hidden',
        boxShadow:    '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Browser chrome bar */}
        <div style={{
          background:    '#1A1A22',
          padding:       '8px 16px',
          borderBottom:  '1px solid rgba(255,255,255,0.06)',
          display:       'flex',
          alignItems:    'center',
          gap:           12,
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FF4D6A' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#FFB84D' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#00E87B' }} />
          </div>
          <span style={{ fontSize: 11, color: '#7A7A85', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
            {current.url}
          </span>
          <span style={{ fontSize: 11, color: '#7A7A85', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
            {current.matchReport?.totalMatched || 0} creative(s) injected
          </span>
        </div>

        <div style={{ maxHeight: 700, overflowY: 'auto' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/screenshot?path=${encodeURIComponent(current.screenshotPath)}`}
            alt={`Mockup for ${current.domain}`}
            style={{ width: '100%', display: 'block' }}
          />
        </div>
      </div>

      {/* ── Metadata footer ── */}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7A7A85', fontFamily: 'var(--font-body)' }}>
        <span>{campaign.client_name} / {campaign.name} — {current.domain}</span>
        <span>{new Date().toLocaleDateString()} — Generated by AdVision</span>
      </div>
    </div>
  );
}
