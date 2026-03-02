'use client';

import { useState, useRef, useCallback } from 'react';

export default function CreativeUploader({ campaignId, creatives, onUpload }) {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('campaignId', campaignId);
      for (const file of files) formData.append('creatives', file);
      const res  = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      if (data.uploaded) onUpload(data.uploaded);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  }, [campaignId, onUpload]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleChange = useCallback((e) => {
    if (e.target.files) handleFiles(e.target.files);
  }, [handleFiles]);

  // Group creatives by size
  const sizeGroups = {};
  creatives.forEach(c => {
    const key = `${c.width}x${c.height}`;
    if (!sizeGroups[key]) sizeGroups[key] = [];
    sizeGroups[key].push(c);
  });

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-body)', fontSize: 22, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
        Upload Creative Assets
      </h2>
      <p style={{ color: '#7A7A85', marginBottom: 24, fontSize: 14, fontFamily: 'var(--font-body)' }}>
        Upload your ad creatives. Dimensions are detected automatically.
      </p>

      {/* ── Drop zone ── */}
      <div
        className={`dropzone p-10 text-center cursor-pointer mb-6 ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept="image/*" onChange={handleChange} className="hidden" />

        {uploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, border: '2px solid #5C26FF', borderTopColor: 'transparent', borderRadius: '50%' }} className="spinner" />
            <span style={{ color: '#7A7A85', fontFamily: 'var(--font-body)', fontSize: 14 }}>Uploading &amp; detecting dimensions…</span>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
            <div style={{ fontWeight: 500, color: '#C8C8D0', fontFamily: 'var(--font-body)', fontSize: 14 }}>
              Drag &amp; drop creative files here, or click to browse
            </div>
            <div style={{ fontSize: 12, color: '#7A7A85', marginTop: 8, fontFamily: 'var(--font-body)' }}>
              Supports PNG, JPG, GIF, WebP — dimensions detected automatically
            </div>
          </div>
        )}
      </div>

      {/* ── Uploaded creatives ── */}
      {creatives.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7A7A85', fontFamily: 'var(--font-body)' }}>
              Uploaded Creatives ({creatives.length})
            </div>
            <div style={{ fontSize: 12, color: '#7A7A85', fontFamily: 'var(--font-body)' }}>
              {Object.keys(sizeGroups).length} unique size(s)
            </div>
          </div>

          {/* Size badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {Object.entries(sizeGroups).map(([size, items]) => (
              <span
                key={size}
                style={{
                  padding:      '4px 12px',
                  background:   'rgba(92,38,255,0.15)',
                  color:        '#8A5CFF',
                  borderRadius: 999,
                  fontSize:     12,
                  fontWeight:   500,
                  fontFamily:   'var(--font-body)',
                }}
              >
                {size} ({items.length})
              </span>
            ))}
          </div>

          {/* Creative thumbnails */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {creatives.map(c => (
              <div
                key={c.id}
                style={{
                  background:   'rgba(255,255,255,0.03)',
                  border:       '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  overflow:     'hidden',
                  transition:   'box-shadow 0.2s',
                }}
                onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)'}
                onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <div style={{ aspectRatio: '16/9', background: '#121218', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/creative-image?id=${c.filename}`}
                    alt={c.original_name}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<div style="color:#7A7A85;font-size:11px">Preview unavailable</div>';
                    }}
                  />
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#C8C8D0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>
                    {c.original_name}
                  </div>
                  <div style={{ fontSize: 11, color: '#5C26FF', fontWeight: 600, marginTop: 4, fontFamily: 'var(--font-body)' }}>
                    {c.width} × {c.height}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
