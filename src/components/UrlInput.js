'use client';

import { useState, useCallback } from 'react';

const EXAMPLE_URLS = [
  'bloomberg.com/technology',
  'wsj.com/markets',
  'ft.com/technology',
  'yahoo.com/finance',
  'cnbc.com',
];

export default function UrlInput({ onScrape, loading }) {
  const [urls, setUrls] = useState(['']);

  const addUrl    = useCallback(() => { if (urls.length < 10) setUrls(prev => [...prev, '']); }, [urls]);
  const removeUrl = useCallback((i) => setUrls(prev => prev.filter((_, j) => j !== i)), []);
  const updateUrl = useCallback((i, val) => setUrls(prev => { const u = [...prev]; u[i] = val; return u; }), []);

  const handleScrape = useCallback(() => {
    const valid = urls.filter(u => u.trim().length > 0);
    if (valid.length > 0) onScrape(valid);
  }, [urls, onScrape]);

  const validCount = urls.filter(u => u.trim().length > 0).length;

  const inputStyle = {
    flex:         1,
    padding:      '12px 16px',
    background:   'rgba(255,255,255,0.05)',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    color:        '#fff',
    fontFamily:   'var(--font-body)',
    fontSize:     13,
    outline:      'none',
  };

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
        Enter Publisher URLs
      </h2>
      <p style={{ color: '#7A7A85', marginBottom: 24, fontSize: 14, fontFamily: 'var(--font-body)' }}>
        Add the publisher page URLs where you want to preview ad placements. Up to 10 URLs per session.
      </p>

      {/* ── URL inputs ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
        {urls.map((url, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#7A7A85', width: 20, textAlign: 'right', fontFamily: 'var(--font-body)' }}>{i + 1}.</span>
            <input
              type="text"
              value={url}
              onChange={e => updateUrl(i, e.target.value)}
              placeholder="e.g. bloomberg.com/technology"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#5C26FF'; e.target.style.boxShadow = '0 0 0 3px rgba(92,38,255,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
            />
            {urls.length > 1 && (
              <button
                onClick={() => removeUrl(i)}
                style={{ background: 'none', border: 'none', color: '#7A7A85', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                onMouseOver={e => e.target.style.color = '#FF4D6A'}
                onMouseOut={e => e.target.style.color = '#7A7A85'}
              >✕</button>
            )}
          </div>
        ))}
      </div>

      {/* ── Add URL ── */}
      {urls.length < 10 && (
        <button
          onClick={addUrl}
          style={{
            background:  'none',
            border:      'none',
            color:       '#5C26FF',
            cursor:      'pointer',
            fontFamily:  'var(--font-body)',
            fontSize:    13,
            fontWeight:  500,
            marginBottom: 24,
            display:     'flex',
            alignItems:  'center',
            gap:         4,
          }}
          onMouseOver={e => e.currentTarget.style.color = '#8A5CFF'}
          onMouseOut={e => e.currentTarget.style.color = '#5C26FF'}
        >
          <span>+</span> Add another URL
        </button>
      )}

      {/* ── Quick-add examples ── */}
      <div style={{ marginBottom: 32 }}>
        <span style={{ fontSize: 11, color: '#7A7A85', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
          Quick add:
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {EXAMPLE_URLS.map(ex => (
            <button
              key={ex}
              onClick={() => {
                const emptyIdx = urls.findIndex(u => u.trim() === '');
                if (emptyIdx >= 0) updateUrl(emptyIdx, ex);
                else if (urls.length < 10) setUrls(prev => [...prev, ex]);
              }}
              style={{
                padding:      '5px 12px',
                background:   'rgba(255,255,255,0.05)',
                color:        '#C8C8D0',
                border:       '1px solid rgba(255,255,255,0.08)',
                borderRadius: 999,
                fontSize:     12,
                cursor:       'pointer',
                fontFamily:   'var(--font-body)',
                transition:   'all 0.2s',
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(92,38,255,0.15)'; e.currentTarget.style.color = '#8A5CFF'; e.currentTarget.style.borderColor = 'rgba(92,38,255,0.3)'; }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#C8C8D0'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* ── Generate button ── */}
      <button
        onClick={handleScrape}
        disabled={loading || validCount === 0}
        style={{
          width:        '100%',
          padding:      '16px 0',
          background:   loading || validCount === 0 ? 'rgba(92,38,255,0.3)' : '#5C26FF',
          color:        loading || validCount === 0 ? 'rgba(255,255,255,0.4)' : '#fff',
          border:       'none',
          borderRadius: 12,
          fontFamily:   'var(--font-body)',
          fontWeight:   600,
          fontSize:     16,
          cursor:       loading || validCount === 0 ? 'not-allowed' : 'pointer',
          transition:   'all 0.2s',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          gap:          12,
          boxShadow:    loading || validCount === 0 ? 'none' : '0 4px 20px rgba(92,38,255,0.3)',
        }}
        onMouseOver={e => { if (!loading && validCount > 0) e.currentTarget.style.background = '#4A1ECC'; }}
        onMouseOut={e => { if (!loading && validCount > 0) e.currentTarget.style.background = '#5C26FF'; }}
      >
        {loading ? (
          <>
            <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} className="spinner" />
            <span>Scanning pages &amp; generating mockups…</span>
          </>
        ) : (
          <>
            <span>🚀</span>
            <span>Generate Mockups ({validCount} URL{validCount !== 1 ? 's' : ''})</span>
          </>
        )}
      </button>

      {loading && (
        <p style={{ textAlign: 'center', fontSize: 12, color: '#7A7A85', marginTop: 12, fontFamily: 'var(--font-body)' }}>
          This may take 15–30 seconds per URL. We're loading each page, detecting ad slots, and capturing screenshots.
        </p>
      )}
    </div>
  );
}
