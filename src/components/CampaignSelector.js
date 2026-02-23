'use client';

import { useState, useEffect } from 'react';

export default function CampaignSelector({ onSelect }) {
  const [campaigns, setCampaigns] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    try {
      const res = await fetch('/api/campaign');
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
      const res = await fetch('/api/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), clientName: clientName.trim() }),
      });
      const data = await res.json();
      if (data.campaign) {
        onSelect(data.campaign);
      }
    } catch (err) {
      console.error('Failed to create campaign:', err);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#1A1A2E] mb-2">Select or Create a Campaign</h2>
      <p className="text-gray-500 mb-6">
        Campaigns group your creatives and mockups together by client and project.
      </p>

      {/* Existing campaigns */}
      {campaigns.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Existing Campaigns</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map(c => (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="text-left p-5 bg-white rounded-xl border border-gray-200 hover:border-[#00B4D8] hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-[#1A1A2E] group-hover:text-[#00B4D8] transition-colors">
                      {c.name}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">{c.client_name}</div>
                  </div>
                  <span className="text-gray-300 group-hover:text-[#00B4D8] text-lg transition-colors">→</span>
                </div>
                <div className="text-xs text-gray-400 mt-3">
                  Created {new Date(c.created_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create new */}
      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full p-5 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-[#00B4D8] hover:text-[#00B4D8] transition-all text-center"
        >
          <span className="text-2xl block mb-2">+</span>
          <span className="font-medium">Create New Campaign</span>
        </button>
      ) : (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="font-semibold text-[#1A1A2E] mb-4">New Campaign</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Client Name</label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="e.g. PMI, Kraken, PayPal"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#00B4D8] focus:ring-1 focus:ring-[#00B4D8]/20"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Campaign Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Q1 2026 Display, Brand Awareness"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#00B4D8] focus:ring-1 focus:ring-[#00B4D8]/20"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={creating || !name.trim() || !clientName.trim()}
              className="px-5 py-2.5 bg-[#00B4D8] text-white rounded-lg font-medium hover:bg-[#00B4D8]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {creating ? 'Creating...' : 'Create Campaign'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-5 py-2.5 text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
