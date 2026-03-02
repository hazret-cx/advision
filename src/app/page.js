'use client';

import { useState, useCallback } from 'react';
import CampaignSelector from '../components/CampaignSelector';
import CreativeUploader from '../components/CreativeUploader';
import UrlInput from '../components/UrlInput';
import MatchReport from '../components/MatchReport';
import ScreenshotViewer from '../components/ScreenshotViewer';
import MockupEditor from '../components/MockupEditor';

const STEPS = [
  { id: 1, label: 'Campaign',       icon: '📁' },
  { id: 2, label: 'Creatives',      icon: '🎨' },
  { id: 3, label: 'Publisher URLs', icon: '🌐' },
  { id: 4, label: 'Results',        icon: '📸' },
];

export default function Home() {
  const [step, setStep]                   = useState(1);
  const [campaign, setCampaign]           = useState(null);
  const [creatives, setCreatives]         = useState([]);
  const [results, setResults]             = useState(null);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);
  const [editingMockup, setEditingMockup] = useState(null);

  const handleCampaignSelected = useCallback((c) => {
    setCampaign(c);
    setStep(2);
  }, []);

  const handleCreativesUploaded = useCallback((uploaded) => {
    setCreatives(prev => [...prev, ...uploaded]);
  }, []);

  const handleProceedToUrls = useCallback(() => {
    if (creatives.length > 0) setStep(3);
  }, [creatives]);

  const handleScrape = useCallback(async (urls) => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/scrape', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ campaignId: campaign.id, urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scrape failed');
      setResults(data);
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaign]);

  const handleReset = useCallback(() => {
    setStep(1);
    setCampaign(null);
    setCreatives([]);
    setResults(null);
    setError(null);
    setEditingMockup(null);
  }, []);

  const handleOpenEditor  = useCallback((mockupResult) => setEditingMockup(mockupResult), []);
  const handleComposed    = useCallback((mockupId, newScreenshotPath) => {
    setResults(prev => ({
      ...prev,
      results: prev.results.map(r =>
        r.mockupId === mockupId ? { ...r, screenshotPath: newScreenshotPath } : r
      ),
    }));
    setEditingMockup(null);
  }, []);

  return (
    <div>
      {/* ── Step indicator ── */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <button
              onClick={() => s.id <= step && setStep(s.id)}
              disabled={s.id > step}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          8,
                padding:      '8px 16px',
                borderRadius: 999,
                border:       'none',
                cursor:       s.id <= step ? 'pointer' : 'not-allowed',
                fontSize:     13,
                fontFamily:   'var(--font-body)',
                fontWeight:   500,
                transition:   'all 0.2s',
                background:   step === s.id
                  ? '#5C26FF'
                  : step > s.id
                    ? 'rgba(92,38,255,0.15)'
                    : 'rgba(255,255,255,0.05)',
                color: step === s.id
                  ? '#fff'
                  : step > s.id
                    ? '#8A5CFF'
                    : '#7A7A85',
              }}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div style={{
                width:      32,
                height:     1,
                margin:     '0 4px',
                background: step > s.id ? '#5C26FF' : 'rgba(255,255,255,0.1)',
              }} />
            )}
          </div>
        ))}

        {campaign && (
          <div className="ml-auto flex items-center gap-3">
            <span style={{ fontSize: 13, color: '#7A7A85', fontFamily: 'var(--font-body)' }}>
              {campaign.client_name} / {campaign.name}
            </span>
            <button
              onClick={handleReset}
              style={{ fontSize: 12, color: '#7A7A85', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              onMouseOver={e => e.target.style.color = '#FF4D6A'}
              onMouseOut={e => e.target.style.color = '#7A7A85'}
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* ── Error display ── */}
      {error && (
        <div style={{
          marginBottom: 24,
          padding:      '12px 16px',
          background:   'rgba(255,77,106,0.1)',
          border:       '1px solid rgba(255,77,106,0.3)',
          borderRadius: 12,
          color:        '#FF4D6A',
          fontSize:     13,
          display:      'flex',
          alignItems:   'center',
          gap:          12,
          fontFamily:   'var(--font-body)',
        }}>
          <span>⚠️</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#FF4D6A', cursor: 'pointer', fontSize: 16 }}
          >✕</button>
        </div>
      )}

      {/* ── Step content ── */}
      <div className="fade-in">
        {step === 1 && <CampaignSelector onSelect={handleCampaignSelected} />}

        {step === 2 && campaign && (
          <div>
            <CreativeUploader
              campaignId={campaign.id}
              creatives={creatives}
              onUpload={handleCreativesUploaded}
            />
            {creatives.length > 0 && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleProceedToUrls}
                  style={{
                    padding:      '12px 24px',
                    background:   '#5C26FF',
                    color:        '#fff',
                    border:       'none',
                    borderRadius: 999,
                    fontFamily:   'var(--font-body)',
                    fontWeight:   500,
                    fontSize:     14,
                    cursor:       'pointer',
                    transition:   'all 0.2s',
                    boxShadow:    '0 4px 20px rgba(92,38,255,0.3)',
                  }}
                  onMouseOver={e => e.currentTarget.style.background = '#4A1ECC'}
                  onMouseOut={e => e.currentTarget.style.background = '#5C26FF'}
                >
                  Next: Enter Publisher URLs →
                </button>
              </div>
            )}
          </div>
        )}

        {step === 3 && campaign && <UrlInput onScrape={handleScrape} loading={loading} />}

        {step === 4 && results && (
          <div>
            <MatchReport results={results} />
            <ScreenshotViewer results={results} campaign={campaign} onEdit={handleOpenEditor} />
          </div>
        )}
      </div>

      {editingMockup && (
        <MockupEditor
          mockupId={editingMockup.mockupId}
          screenshotPath={editingMockup.screenshotPath}
          slots={editingMockup.slots || []}
          creatives={creatives}
          suggestedMatches={editingMockup.matchReport?.matched || []}
          campaignId={campaign.id}
          onComposed={(path) => handleComposed(editingMockup.mockupId, path)}
          onClose={() => setEditingMockup(null)}
        />
      )}
    </div>
  );
}
