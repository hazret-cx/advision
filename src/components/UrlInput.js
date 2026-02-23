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

  const addUrl = useCallback(() => {
    if (urls.length < 10) {
      setUrls(prev => [...prev, '']);
    }
  }, [urls]);

  const removeUrl = useCallback((index) => {
    setUrls(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateUrl = useCallback((index, value) => {
    setUrls(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  }, []);

  const handleScrape = useCallback(() => {
    const validUrls = urls.filter(u => u.trim().length > 0);
    if (validUrls.length > 0) {
      onScrape(validUrls);
    }
  }, [urls, onScrape]);

  const validCount = urls.filter(u => u.trim().length > 0).length;

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#1A1A2E] mb-2">Enter Publisher URLs</h2>
      <p className="text-gray-500 mb-6">
        Add the publisher page URLs where you want to preview ad placements. Up to 10 URLs per session.
      </p>

      {/* URL inputs */}
      <div className="space-y-3 mb-6">
        {urls.map((url, i) => (
          <div key={i} className="flex gap-3 items-center">
            <span className="text-sm text-gray-400 w-6 text-right">{i + 1}.</span>
            <input
              type="text"
              value={url}
              onChange={e => updateUrl(i, e.target.value)}
              placeholder="e.g. bloomberg.com/technology"
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-[#00B4D8] focus:ring-1 focus:ring-[#00B4D8]/20 text-sm"
            />
            {urls.length > 1 && (
              <button
                onClick={() => removeUrl(i)}
                className="text-gray-300 hover:text-red-500 transition-colors text-lg"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add URL button */}
      {urls.length < 10 && (
        <button
          onClick={addUrl}
          className="text-sm text-[#00B4D8] hover:text-[#00B4D8]/80 font-medium mb-6 flex items-center gap-1"
        >
          <span>+</span> Add another URL
        </button>
      )}

      {/* Quick-add examples */}
      <div className="mb-8">
        <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">Quick add:</span>
        <div className="flex flex-wrap gap-2 mt-2">
          {EXAMPLE_URLS.map(ex => (
            <button
              key={ex}
              onClick={() => {
                const emptyIdx = urls.findIndex(u => u.trim() === '');
                if (emptyIdx >= 0) {
                  updateUrl(emptyIdx, ex);
                } else if (urls.length < 10) {
                  setUrls(prev => [...prev, ex]);
                }
              }}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full text-xs hover:bg-[#00B4D8]/10 hover:text-[#00B4D8] transition-all"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Generate button */}
      <button
        onClick={handleScrape}
        disabled={loading || validCount === 0}
        className="w-full py-4 bg-[#1A1A2E] text-white rounded-xl font-semibold text-lg hover:bg-[#1A1A2E]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg flex items-center justify-center gap-3"
      >
        {loading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full spinner" />
            <span>Scanning pages & generating mockups...</span>
          </>
        ) : (
          <>
            <span>🚀</span>
            <span>Generate Mockups ({validCount} URL{validCount !== 1 ? 's' : ''})</span>
          </>
        )}
      </button>

      {loading && (
        <p className="text-center text-sm text-gray-400 mt-3">
          This may take 15–30 seconds per URL. We're loading each page, detecting ad slots, injecting your creatives, and capturing screenshots.
        </p>
      )}
    </div>
  );
}
