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

      for (const file of files) {
        formData.append('creatives', file);
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      if (data.uploaded) {
        onUpload(data.uploaded);
      }
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  }, [campaignId, onUpload]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleChange = useCallback((e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
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
      <h2 className="text-2xl font-bold text-[#1A1A2E] mb-2">Upload Creative Assets</h2>
      <p className="text-gray-500 mb-6">
        Upload your ad creatives. Dimensions are detected automatically.
      </p>

      {/* Drop zone */}
      <div
        className={`dropzone p-10 text-center cursor-pointer mb-6 ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleChange}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#00B4D8] border-t-transparent rounded-full spinner" />
            <span className="text-gray-500">Uploading & detecting dimensions...</span>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-3">📁</div>
            <div className="font-medium text-gray-700">
              Drag & drop creative files here, or click to browse
            </div>
            <div className="text-sm text-gray-400 mt-2">
              Supports PNG, JPG, GIF, WebP — dimensions detected automatically
            </div>
          </div>
        )}
      </div>

      {/* Uploaded creatives grid */}
      {creatives.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Uploaded Creatives ({creatives.length})
            </h3>
            <div className="text-sm text-gray-400">
              {Object.keys(sizeGroups).length} unique size(s)
            </div>
          </div>

          {/* Size badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(sizeGroups).map(([size, items]) => (
              <span
                key={size}
                className="px-3 py-1.5 bg-[#00B4D8]/10 text-[#00B4D8] rounded-full text-sm font-medium"
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
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="aspect-video bg-gray-50 flex items-center justify-center p-2">
                  <img
                    src={`/api/creative-image?id=${c.filename}`}
                    alt={c.original_name}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentElement.innerHTML = '<div class="text-gray-400 text-xs">Preview unavailable</div>';
                    }}
                  />
                </div>
                <div className="p-3">
                  <div className="text-xs font-medium text-gray-700 truncate" title={c.original_name}>
                    {c.original_name}
                  </div>
                  <div className="text-xs text-[#00B4D8] font-semibold mt-1">
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
