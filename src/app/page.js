'use client';

import { useState, useCallback } from 'react';
import CampaignSelector from '../components/CampaignSelector';
import CreativeUploader from '../components/CreativeUploader';
import UrlInput from '../components/UrlInput';
import MatchReport from '../components/MatchReport';
import ScreenshotViewer from '../components/ScreenshotViewer';

const STEPS = [
  { id: 1, label: 'Campaign', icon: '📁' },
  { id: 2, label: 'Creatives', icon: '🎨' },
  { id: 3, label: 'Publisher URLs', icon: '🌐' },
  { id: 4, label: 'Results', icon: '📸' },
];

export default function Home() {
  const [step, setStep] = useState(1);
  const [campaign, setCampaign] = useState(null);
  const [creatives, setCreatives] = useState([]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCampaignSelected = useCallback((c) => {
    setCampaign(c);
    setStep(2);
  }, []);

  const handleCreativesUploaded = useCallback((uploaded) => {
    setCreatives(prev => [...prev, ...uploaded]);
  }, []);

  const handleProceedToUrls = useCallback(() => {
    if (creatives.length > 0) {
      setStep(3);
    }
  }, [creatives]);

  const handleScrape = useCallback(async (urls) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaign.id, urls }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Scrape failed');
      }

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
  }, []);

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <button
              onClick={() => s.id <= step && setStep(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all
                ${step === s.id
                  ? 'bg-[#00B4D8] text-white shadow-md'
                  : step > s.id
                    ? 'bg-[#00B4D8]/10 text-[#00B4D8] cursor-pointer hover:bg-[#00B4D8]/20'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              disabled={s.id > step}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-px mx-1 ${step > s.id ? 'bg-[#00B4D8]' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}

        {campaign && (
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {campaign.client_name} / {campaign.name}
            </span>
            <button
              onClick={handleReset}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
          <span>⚠️</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Step content */}
      <div className="fade-in">
        {step === 1 && (
          <CampaignSelector onSelect={handleCampaignSelected} />
        )}

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
                  className="px-6 py-3 bg-[#00B4D8] text-white rounded-xl font-medium hover:bg-[#00B4D8]/90 transition-colors shadow-md"
                >
                  Next: Enter Publisher URLs →
                </button>
              </div>
            )}
          </div>
        )}

        {step === 3 && campaign && (
          <UrlInput onScrape={handleScrape} loading={loading} />
        )}

        {step === 4 && results && (
          <div>
            <MatchReport results={results} />
            <ScreenshotViewer results={results} campaign={campaign} />
          </div>
        )}
      </div>
    </div>
  );
}
