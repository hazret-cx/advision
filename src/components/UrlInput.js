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
  const [entries, setEntries] = useState([{ url: '', fullPage: false }]);

  const addEntry    = useCallback(() => {
    if (entries.length < 10) setEntries(prev => [...prev, { url: '', fullPage: false }]);
  }, [entries]);

  const removeEntry = useCallback((i) => setEntries(prev => prev.filter((_, j) => j !== i)), []);

  const updateUrl = useCallback((i, val) =>
    setEntries(prev => { const e = [...prev]; e[i] = { ...e[i], url: val }; return e; }), []);

  const toggleFullPage = useCallback((i) =>
    setEntries(prev => { const e = [...prev]; e[i] = { ...e[i], fullPage: !e[i].fullPage }; return e; }), []);

  const handleScrape = useCallback(() => {
    const valid = entries.filter(e => e.url.trim().length > 0);
    if (valid.length > 0) onScrape(valid);
  }, [entries, onScrape]);

  const validCount = entries.filter(e => e.url.trim().length > 0).length;

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

      {/* ── Column headers ── */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, paddingLeft: 32 }}>
        <span style={{ flex: 1, fontSize: 11, color: '#7A7A85', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
          URL
        </span>
        <span style={{ fontSize: 11, color: '#7A7A85', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, width: 88, textAlign: 'center' }}>
          Full Page
        </span>
        <span style={{ width: 20 }} />
      </div>

      {/* ── URL inputs ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {entries.map((entry, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#7A7A85', width: 20, textAlign: 'right', fontFamily: 'var(--font-body)', flexShrink: 0 }}>{i + 1}.</span>
            <input
              type="text"
              value={entry.url}
              onChange={e => updateUrl(i, e.target.value)}
              placeholder="e.g. bloomberg.com/technology"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#5C26FF'; e.target.style.boxShadow = '0 0 0 3px rgba(92,38,255,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
            />

            {/* ── Full Page toggle ── */}
            <button
              onClick={() => toggleFullPage(i)}
              title={entry.fullPage ? 'Full page screenshot — slower, may crash on heavy sites' : 'Viewport only — faster and more stable'}
              style={{
                width:        88,
                padding:      '8px 0',
                borderRadius: 999,
                border:       entry.fullPage ? '1px solid #5C26FF' : '1px solid rgba(255,255,255,0.12)',
                background:   entry.fullPage ? 'rgba(92,38,255,0.2)' : 'rgba(255,255,255,0.04)',
                color:        entry.fullPage ? '#A07BFF' : '#7A7A85',
                fontFamily:   'var(--font-body)',
                fontSize:     11,
                fontWeight:   600,
                cursor:       'pointer',
                flexShrink:   0,
                transition:   'all 0.15s',
                letterSpacing: '0.04em',
              }}
            >
              {entry.fullPage ? '↕ Full' : '▭ View'}
            </button>

            {entries.length > 1 ? (
              <button
                onClick={() => removeEntry(i)}
                style={{ background: 'none', border: 'none', color: '#7A7A85', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
                onMouseOver={e => e.target.style.color = '#FF4D6A'}
                onMouseOut={e => e.target.style.color = '#7A7A85'}
              >✕</button>
            ) : (
              <span style={{ width: 20, flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Full page hint ── */}
      {entries.some(e => e.fullPage) && (
        <p style={{ fontSize: 12, color: '#A07BFF', marginBottom: 16, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>↕</span>
          <span>Full page is enabled for {entries.filter(e => e.fullPage && e.url.trim()).length} URL{entries.filter(e => e.fullPage && e.url.trim()).length !== 1 ? 's' : ''}. Avoid on ad-heavy sites like GQ, Cosmopolitan or Vogue — use viewport only there.</span>
        </p>
      )}

      {/* ── Add URL ── */}
      {entries.length < 10 && (
        <button
          onClick={addEntry}
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
                const emptyIdx = entries.findIndex(e => e.url.trim() === '');
                if (emptyIdx >= 0) updateUrl(emptyIdx, ex);
                else if (entries.length < 10) setEntries(prev => [...prev, { url: ex, fullPage: false }]);
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
