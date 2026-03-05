'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY   = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
const PICKER_SCOPE     = 'https://www.googleapis.com/auth/drive.readonly';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = s.async = true;
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function CreativeUploader({ campaignId, creatives, onUpload }) {
  const [uploading, setUploading]         = useState(false);
  const [driveLoading, setDriveLoading]   = useState(false);
  const [dragActive, setDragActive]       = useState(false);
  const inputRef   = useRef(null);
  const tokenRef   = useRef(null);
  const gapiReady  = useRef(false);

  // Pre-load gapi so the picker opens instantly when clicked
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) return;
    loadScript('https://apis.google.com/js/api.js').then(() => {
      window.gapi.load('picker', () => { gapiReady.current = true; });
    }).catch(() => {});
  }, []);

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

  const openDrivePicker = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_API_KEY) {
      alert('Google Drive is not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_API_KEY.');
      return;
    }

    setDriveLoading(true);
    try {
      // Load GIS if not already loaded
      await loadScript('https://accounts.google.com/gsi/client');
      await loadScript('https://apis.google.com/js/api.js');

      if (!gapiReady.current) {
        await new Promise((resolve) => window.gapi.load('picker', () => { gapiReady.current = true; resolve(); }));
      }

      // Get an access token via GIS token client
      const token = await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: PICKER_SCOPE,
          callback: (resp) => resp.error ? reject(new Error(resp.error)) : resolve(resp.access_token),
        });
        client.requestAccessToken({ prompt: tokenRef.current ? '' : 'consent' });
      });
      tokenRef.current = token;

      // Open Google Picker
      await new Promise((resolve) => {
        const picker = new window.google.picker.PickerBuilder()
          .addView(
            new window.google.picker.View(window.google.picker.ViewId.DOCS_IMAGES)
          )
          .setOAuthToken(token)
          .setDeveloperKey(GOOGLE_API_KEY)
          .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
          .setCallback(async (data) => {
            if (data.action !== window.google.picker.Action.PICKED) { resolve(); return; }

            const selected = data.docs.map(d => ({
              id:       d.id,
              name:     d.name,
              mimeType: d.mimeType,
            }));

            setDriveLoading(false);
            setUploading(true);
            try {
              const res  = await fetch('/api/upload-from-drive', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ campaignId, files: selected, accessToken: token }),
              });
              const result = await res.json();
              if (!res.ok) throw new Error(result.error || 'Drive upload failed');
              if (result.uploaded) onUpload(result.uploaded);
            } catch (err) {
              console.error('Drive upload error:', err);
            } finally {
              setUploading(false);
              resolve();
            }
          })
          .build();
        picker.setVisible(true);
      });
    } catch (err) {
      console.error('Drive picker error:', err);
      setDriveLoading(false);
    } finally {
      setDriveLoading(false);
    }
  }, [campaignId, onUpload]);

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
      <p style={{ color: '#7A7A85', marginBottom: 16, fontSize: 14, fontFamily: 'var(--font-body)' }}>
        Upload your ad creatives. Dimensions are detected automatically.
      </p>

      {/* ── Source buttons ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading || driveLoading}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            padding:      '9px 18px',
            background:   'rgba(255,255,255,0.05)',
            border:       '1px solid rgba(255,255,255,0.1)',
            borderRadius: 999,
            color:        '#C8C8D0',
            fontSize:     13,
            fontFamily:   'var(--font-body)',
            cursor:       uploading || driveLoading ? 'not-allowed' : 'pointer',
            transition:   'all 0.2s',
          }}
          onMouseOver={e => { if (!uploading && !driveLoading) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
        >
          <span style={{ fontSize: 15 }}>📂</span>
          <span>Browse files</span>
        </button>

        <button
          onClick={openDrivePicker}
          disabled={uploading || driveLoading}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            padding:      '9px 18px',
            background:   driveLoading ? 'rgba(66,133,244,0.1)' : 'rgba(66,133,244,0.08)',
            border:       '1px solid rgba(66,133,244,0.3)',
            borderRadius: 999,
            color:        driveLoading ? '#7A7A85' : '#4285F4',
            fontSize:     13,
            fontFamily:   'var(--font-body)',
            cursor:       uploading || driveLoading ? 'not-allowed' : 'pointer',
            transition:   'all 0.2s',
          }}
          onMouseOver={e => { if (!uploading && !driveLoading) e.currentTarget.style.background = 'rgba(66,133,244,0.18)'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(66,133,244,0.08)'; }}
        >
          {driveLoading ? (
            <>
              <div style={{ width: 14, height: 14, border: '2px solid #4285F4', borderTopColor: 'transparent', borderRadius: '50%' }} className="spinner" />
              <span>Connecting…</span>
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 87.3 78" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066DA"/>
                <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.55c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00AC47"/>
                <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.45z" fill="#EA4335"/>
                <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832D"/>
                <path d="M59.8 53.05H27.5L13.75 76.85c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684FC"/>
                <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28.05H87.3c0-1.55-.4-3.1-1.2-4.5z" fill="#FFBA00"/>
              </svg>
              <span>Upload from Google Drive</span>
            </>
          )}
        </button>
      </div>

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
