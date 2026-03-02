'use client';

export default function MatchReport({ results }) {
  if (!results) return null;
  const { summary, results: mockupResults } = results;

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
        Match Report
      </h2>
      <p style={{ color: '#7A7A85', marginBottom: 24, fontSize: 14, fontFamily: 'var(--font-body)' }}>
        Overview of detected ad slots and creative matches across all publisher URLs.
      </p>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: 32 }}>
        <SummaryCard label="URLs Processed"  value={summary.urlsProcessed}        icon="🌐" />
        <SummaryCard label="Slots Detected"  value={summary.totalSlotsDetected}   icon="🎯" />
        <SummaryCard label="Slots Matched"   value={summary.totalSlotsMatched}    icon="✅" highlight={summary.totalSlotsMatched > 0} />
        <SummaryCard label="Errors"          value={summary.errors}               icon="⚠️" warning={summary.errors > 0} />
      </div>

      {/* ── Per-URL breakdown ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mockupResults.map((result, i) => (
          <div
            key={result.mockupId || i}
            style={{
              background:   'rgba(255,255,255,0.03)',
              border:       '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding:      20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-body)' }}>
                  {result.status === 'completed' ? '✅' : result.status === 'blocked' ? '🚫' : '❌'}
                  {result.domain}
                </div>
                <div style={{ fontSize: 11, color: '#7A7A85', marginTop: 4, fontFamily: 'var(--font-body)' }}>{result.url}</div>
              </div>
              <StatusBadge status={result.status} />
            </div>

            {result.brandSafety && result.brandSafety.action !== 'safe' && (
              <BrandSafetyBanner safety={result.brandSafety} />
            )}

            {result.status === 'error' ? (
              <div style={{ fontSize: 13, color: '#FF4D6A', background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.2)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-body)' }}>
                {result.error}
              </div>
            ) : result.matchReport ? (
              <div>
                <div style={{ display: 'flex', gap: 24, fontSize: 13, marginBottom: 12, fontFamily: 'var(--font-body)' }}>
                  <span style={{ color: '#7A7A85' }}>
                    <strong style={{ color: '#fff' }}>{result.matchReport.totalSlotsDetected}</strong> slots detected
                  </span>
                  <span style={{ color: '#7A7A85' }}>
                    <strong style={{ color: '#00E87B' }}>{result.matchReport.totalMatched}</strong> matched
                  </span>
                  <span style={{ color: '#7A7A85' }}>
                    <strong style={{ color: '#FFB84D' }}>{result.matchReport.totalUnmatchedSlots}</strong> unmatched
                  </span>
                </div>

                {result.matchReport.matched.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {result.matchReport.matched.map((m, j) => (
                      <span
                        key={j}
                        style={{
                          padding:    '3px 10px',
                          background: 'rgba(0,232,123,0.1)',
                          color:      '#00E87B',
                          border:     '1px solid rgba(0,232,123,0.2)',
                          borderRadius: 6,
                          fontSize:   12,
                          fontWeight: 500,
                          display:    'inline-flex',
                          alignItems: 'center',
                          gap:        6,
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        {m.sizeKey} ✓ <TierBadge tier={m.matchTier} />
                      </span>
                    ))}
                  </div>
                )}

                {result.matchReport.unmatchedSlots.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[...new Set(result.matchReport.unmatchedSlots.map(u => u.sizeKey))].map((size, j) => (
                      <span
                        key={j}
                        style={{
                          padding:      '3px 10px',
                          background:   'rgba(255,184,77,0.1)',
                          color:        '#FFB84D',
                          border:       '1px solid rgba(255,184,77,0.2)',
                          borderRadius: 6,
                          fontSize:     12,
                          fontWeight:   500,
                          fontFamily:   'var(--font-body)',
                        }}
                      >
                        {size} — no creative
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TierBadge({ tier }) {
  if (!tier) return null;
  const styles = {
    exact:          { bg: 'rgba(0,232,123,0.2)',    color: '#00E87B' },
    'aspect-ratio': { bg: 'rgba(92,38,255,0.2)',    color: '#8A5CFF' },
    'fit-within':   { bg: 'rgba(255,184,77,0.2)',   color: '#FFB84D' },
  };
  const labels = { exact: 'Exact', 'aspect-ratio': 'Aspect', 'fit-within': 'Fit' };
  const s     = styles[tier] || { bg: 'rgba(255,255,255,0.08)', color: '#C8C8D0' };
  return (
    <span style={{ padding: '1px 6px', background: s.bg, color: s.color, borderRadius: 4, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-body)' }}>
      {labels[tier] || tier}
    </span>
  );
}

function SummaryCard({ label, value, icon, highlight, warning }) {
  let bg     = 'rgba(255,255,255,0.03)';
  let border = 'rgba(255,255,255,0.08)';
  if (highlight) { bg = 'rgba(0,232,123,0.06)';   border = 'rgba(0,232,123,0.2)'; }
  if (warning)   { bg = 'rgba(255,77,106,0.06)';  border = 'rgba(255,77,106,0.2)'; }

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: 16, textAlign: 'center' }}>
      <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-title)', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#7A7A85', marginTop: 4, fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    completed: { bg: 'rgba(0,232,123,0.15)',  color: '#00E87B',  label: 'Completed' },
    blocked:   { bg: 'rgba(255,77,106,0.15)', color: '#FF4D6A',  label: 'Brand Safety Block' },
    error:     { bg: 'rgba(255,77,106,0.15)', color: '#FF4D6A',  label: 'Error' },
  };
  const s = map[status] || { bg: 'rgba(255,255,255,0.08)', color: '#C8C8D0', label: status };
  return (
    <span style={{ padding: '4px 12px', background: s.bg, color: s.color, borderRadius: 999, fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-body)' }}>
      {s.label}
    </span>
  );
}

function BrandSafetyBanner({ safety }) {
  const isBlock   = safety.action === 'block';
  const bg        = isBlock ? 'rgba(255,77,106,0.08)'   : 'rgba(255,184,77,0.08)';
  const border    = isBlock ? 'rgba(255,77,106,0.25)'   : 'rgba(255,184,77,0.25)';
  const textColor = isBlock ? '#FF4D6A'                 : '#FFB84D';
  const icon      = isBlock ? '🚫' : '⚠️';
  const label     = isBlock ? 'Brand Safety Block' : 'Brand Safety Warning';

  const blockViolations = safety.violations.filter(v => v.severity === 'block');
  const warnViolations  = safety.violations.filter(v => v.severity === 'warn');

  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: 12, marginBottom: 12, fontFamily: 'var(--font-body)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, color: textColor, marginBottom: 4 }}>
        <span>{icon}</span><span>{label}</span>
      </div>
      <p style={{ fontSize: 12, color: textColor, marginBottom: 8 }}>{safety.summary}</p>

      {blockViolations.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#FF4D6A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Blocked categories</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {blockViolations.map((v, i) => (
              <span key={i} style={{ padding: '2px 8px', background: 'rgba(255,77,106,0.15)', color: '#FF4D6A', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
                {v.category.replace(/_/g, ' ')} ({v.matchCount})
              </span>
            ))}
          </div>
        </div>
      )}

      {warnViolations.length > 0 && (
        <div>
          <span style={{ fontSize: 10, fontWeight: 600, color: '#FFB84D', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Flagged categories</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {warnViolations.map((v, i) => (
              <span key={i} style={{ padding: '2px 8px', background: 'rgba(255,184,77,0.15)', color: '#FFB84D', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
                {v.category.replace(/_/g, ' ')} ({v.matchCount})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
