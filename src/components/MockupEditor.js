'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const FIT_MODES = ['contain', 'cover', 'fill'];

export default function MockupEditor({
  mockupId,
  screenshotPath,
  slots,
  creatives,
  suggestedMatches,
  campaignId,
  onComposed,
  onClose,
}) {
  const [placements, setPlacements] = useState({});
  const [activeSlot, setActiveSlot] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(900);

  // Erase tool state
  const [eraseMode, setEraseMode] = useState(false);
  const [erasures, setErasures] = useState([]);
  const [dragStart, setDragStart] = useState(null);
  const [drawingRect, setDrawingRect] = useState(null);

  const containerRef = useRef(null);
  const imageWrapperRef = useRef(null);

  // Pre-populate placements from suggested matches
  useEffect(() => {
    const initial = {};
    suggestedMatches.forEach((match) => {
      const idx = slots.findIndex(
        (s) =>
          s.x === match.slot.x &&
          s.y === match.slot.y &&
          s.width === match.slot.width &&
          s.height === match.slot.height
      );
      if (idx !== -1 && !(idx in initial)) {
        initial[idx] = { creativeId: match.creative.id, fitMode: 'contain' };
      }
    });
    setPlacements(initial);
  }, []);

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width || 900);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const scale = containerWidth / 1440;

  const handleSlotClick = useCallback((idx) => {
    if (eraseMode) return;
    setActiveSlot(idx);
  }, [eraseMode]);

  const handleCreativeClick = useCallback(
    (creative) => {
      if (activeSlot === null) return;
      setPlacements((prev) => ({
        ...prev,
        [activeSlot]: {
          creativeId: creative.id,
          fitMode: prev[activeSlot]?.fitMode || 'contain',
        },
      }));
      setActiveSlot(null);
    },
    [activeSlot]
  );

  const handleFitMode = useCallback((mode) => {
    setActiveSlot((slot) => {
      if (slot === null) return slot;
      setPlacements((prev) =>
        prev[slot]
          ? { ...prev, [slot]: { ...prev[slot], fitMode: mode } }
          : prev
      );
      return slot;
    });
  }, []);

  const handleRemovePlacement = useCallback((idx, e) => {
    e.stopPropagation();
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    setActiveSlot(null);
  }, []);

  // ── Erase tool ────────────────────────────────────────────────────────────

  const toggleEraseMode = useCallback(() => {
    setEraseMode((m) => !m);
    setActiveSlot(null);
    setDragStart(null);
    setDrawingRect(null);
  }, []);

  const handleRemoveErasure = useCallback((idx, e) => {
    e.stopPropagation();
    setErasures((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleClearErasures = useCallback(() => {
    setErasures([]);
  }, []);

  const getImageWrapperOffset = useCallback(() => {
    if (!imageWrapperRef.current) return { left: 0, top: 0 };
    const rect = imageWrapperRef.current.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (!eraseMode) return;
    e.preventDefault();
    const { left, top } = getImageWrapperOffset();
    setDragStart({ x: e.clientX - left, y: e.clientY - top });
    setDrawingRect(null);
  }, [eraseMode, getImageWrapperOffset]);

  const handleMouseMove = useCallback((e) => {
    if (!eraseMode || !dragStart) return;
    const { left, top } = getImageWrapperOffset();
    const cx = e.clientX - left;
    const cy = e.clientY - top;
    setDrawingRect({
      left: Math.min(dragStart.x, cx),
      top: Math.min(dragStart.y, cy),
      width: Math.abs(cx - dragStart.x),
      height: Math.abs(cy - dragStart.y),
    });
  }, [eraseMode, dragStart, getImageWrapperOffset]);

  const handleMouseUp = useCallback(() => {
    if (!eraseMode || !dragStart || !drawingRect) {
      setDragStart(null);
      setDrawingRect(null);
      return;
    }
    if (drawingRect.width > 10 && drawingRect.height > 10) {
      setErasures((prev) => [
        ...prev,
        {
          x: Math.round(drawingRect.left / scale),
          y: Math.round(drawingRect.top / scale),
          width: Math.round(drawingRect.width / scale),
          height: Math.round(drawingRect.height / scale),
        },
      ]);
    }
    setDragStart(null);
    setDrawingRect(null);
  }, [eraseMode, dragStart, drawingRect, scale]);

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const placementArray = Object.entries(placements).map(([idx, p]) => {
      const slot = slots[parseInt(idx)];
      return {
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        creativeId: p.creativeId,
        fitMode: p.fitMode,
      };
    });

    if (placementArray.length === 0 && erasures.length === 0) {
      setExportError('Assign at least one creative or draw an erasure before exporting.');
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupId, screenshotPath, placements: placementArray, erasures }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Compose failed');
      onComposed(data.screenshotPath);
    } catch (err) {
      setExportError(err.message);
      setExporting(false);
    }
  }, [placements, slots, mockupId, screenshotPath, erasures, onComposed]);

  const creativeById = Object.fromEntries(creatives.map((c) => [c.id, c]));
  const activePlacement = activeSlot !== null ? placements[activeSlot] : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: '#1A1A2E',
          borderBottom: '1px solid #2a2a4a',
          flexShrink: 0,
          gap: 12,
        }}
      >
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>
          Edit Mockup
        </span>

        {/* Erase mode toggle */}
        <button
          onClick={toggleEraseMode}
          title="Draw rectangles to paint out overlays / paywalls"
          style={{
            padding: '5px 14px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 12,
            background: eraseMode ? '#ef4444' : '#2a2a4a',
            color: eraseMode ? '#fff' : '#aaa',
            transition: 'background 0.15s',
          }}
        >
          {eraseMode ? '✕ Stop Erasing' : '⬜ Erase Overlay'}
        </button>

        <button
          onClick={onClose}
          style={{
            color: '#888',
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            lineHeight: 1,
            marginLeft: 'auto',
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: screenshot + overlays */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 16,
            position: 'relative',
            cursor: eraseMode ? 'crosshair' : 'default',
            userSelect: eraseMode ? 'none' : 'auto',
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            ref={imageWrapperRef}
            style={{ position: 'relative', display: 'inline-block', width: '100%' }}
            onMouseDown={handleMouseDown}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/screenshot?path=${encodeURIComponent(screenshotPath)}`}
              alt="Clean screenshot"
              style={{ width: '100%', display: 'block' }}
              draggable={false}
            />

            {/* Ad slot overlays (hidden while erasing to avoid click conflicts) */}
            {!eraseMode && slots.map((slot, idx) => {
              const placement = placements[idx];
              const isActive = activeSlot === idx;
              const assigned = !!placement;
              const creative = assigned ? creativeById[placement.creativeId] : null;

              return (
                <div
                  key={idx}
                  onClick={() => handleSlotClick(idx)}
                  style={{
                    position: 'absolute',
                    left: slot.x * scale,
                    top: slot.y * scale,
                    width: slot.width * scale,
                    height: slot.height * scale,
                    boxSizing: 'border-box',
                    border: isActive
                      ? '2px solid #00B4D8'
                      : assigned
                      ? '2px solid #3b82f6'
                      : '2px dashed #888',
                    background: assigned ? 'transparent' : 'rgba(0,0,0,0.15)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                  }}
                >
                  {assigned && creative ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/creative-image?id=${encodeURIComponent(creative.filename)}`}
                        alt={creative.original_name}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit:
                            placement.fitMode === 'fill'
                              ? 'fill'
                              : placement.fitMode === 'cover'
                              ? 'cover'
                              : 'contain',
                          display: 'block',
                        }}
                        draggable={false}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 2,
                          left: 2,
                          right: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: 10,
                          background: 'rgba(0,0,0,0.55)',
                          color: '#fff',
                          padding: '1px 4px',
                          borderRadius: 2,
                        }}
                      >
                        <span>{placement.fitMode}</span>
                        <button
                          onClick={(e) => handleRemovePlacement(idx, e)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#f87171',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: 11,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#aaa',
                        fontSize: Math.max(9, 11 * scale),
                        textAlign: 'center',
                        padding: 2,
                      }}
                    >
                      <div>{slot.width}×{slot.height}</div>
                      <div style={{ fontSize: Math.max(8, 10 * scale), marginTop: 1 }}>
                        click to add
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Committed erasure regions */}
            {erasures.map((erasure, idx) => (
              <div
                key={`erasure-${idx}`}
                style={{
                  position: 'absolute',
                  left: erasure.x * scale,
                  top: erasure.y * scale,
                  width: erasure.width * scale,
                  height: erasure.height * scale,
                  background: 'rgba(255,255,255,0.88)',
                  border: '2px dashed #ef4444',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: eraseMode ? 'none' : 'auto',
                }}
              >
                {!eraseMode && (
                  <button
                    onClick={(e) => handleRemoveErasure(idx, e)}
                    style={{
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '3px 10px',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    ✕ Remove
                  </button>
                )}
              </div>
            ))}

            {/* Live drawing preview */}
            {drawingRect && drawingRect.width > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: drawingRect.left,
                  top: drawingRect.top,
                  width: drawingRect.width,
                  height: drawingRect.height,
                  background: 'rgba(239,68,68,0.18)',
                  border: '2px dashed #ef4444',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </div>

        {/* Right panel */}
        <div
          style={{
            width: 220,
            flexShrink: 0,
            background: '#111122',
            borderLeft: '1px solid #2a2a4a',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 14px 8px',
              borderBottom: '1px solid #2a2a4a',
              color: '#bbb',
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {eraseMode
              ? 'Erase Overlay'
              : activeSlot !== null
              ? `Slot ${activeSlot + 1} — ${slots[activeSlot].width}×${slots[activeSlot].height}`
              : 'Creatives'}
          </div>

          {/* Erase mode instructions */}
          {eraseMode && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 14, gap: 12 }}>
              <p style={{ color: '#aaa', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                Click and drag on the screenshot to draw a white rectangle over any overlay, paywall, or cookie banner blocking the content.
              </p>
              <p style={{ color: '#666', fontSize: 11, lineHeight: 1.5, margin: 0 }}>
                {erasures.length === 0
                  ? 'No erasures drawn yet.'
                  : `${erasures.length} erasure${erasures.length > 1 ? 's' : ''} drawn.`}
              </p>
              {erasures.length > 0 && (
                <button
                  onClick={handleClearErasures}
                  style={{
                    background: '#2a1010',
                    color: '#f87171',
                    border: '1px solid #5a1010',
                    borderRadius: 5,
                    padding: '6px 0',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Clear All Erasures
                </button>
              )}
              <button
                onClick={toggleEraseMode}
                style={{
                  background: '#2a2a4a',
                  color: '#ccc',
                  border: 'none',
                  borderRadius: 5,
                  padding: '6px 0',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                Done — Back to Slots
              </button>
            </div>
          )}

          {/* Fit mode buttons */}
          {!eraseMode && activeSlot !== null && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: '8px 14px',
                borderBottom: '1px solid #2a2a4a',
                flexShrink: 0,
              }}
            >
              {FIT_MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleFitMode(mode)}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    fontSize: 11,
                    fontWeight: 500,
                    borderRadius: 4,
                    border: 'none',
                    cursor: 'pointer',
                    background:
                      activePlacement?.fitMode === mode ? '#00B4D8' : '#2a2a4a',
                    color: activePlacement?.fitMode === mode ? '#fff' : '#aaa',
                  }}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Creative thumbnails */}
          {!eraseMode && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {activeSlot !== null ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {creatives.map((creative) => (
                    <button
                      key={creative.id}
                      onClick={() => handleCreativeClick(creative)}
                      style={{
                        background: '#1e1e38',
                        border:
                          activePlacement?.creativeId === creative.id
                            ? '2px solid #00B4D8'
                            : '2px solid #2a2a4a',
                        borderRadius: 6,
                        padding: 6,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/creative-image?id=${encodeURIComponent(creative.filename)}`}
                        alt={creative.original_name}
                        style={{
                          width: '100%',
                          height: 60,
                          objectFit: 'contain',
                          display: 'block',
                          background: '#0a0a1a',
                          borderRadius: 3,
                        }}
                      />
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          color: '#888',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {creative.width}×{creative.height}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
                  Click a slot on the screenshot to assign a creative
                </div>
              )}
            </div>
          )}

          {/* Export button */}
          <div
            style={{
              padding: '12px 14px',
              borderTop: '1px solid #2a2a4a',
              flexShrink: 0,
            }}
          >
            {exportError && (
              <div
                style={{
                  marginBottom: 8,
                  fontSize: 11,
                  color: '#f87171',
                  background: '#2a1010',
                  borderRadius: 4,
                  padding: '4px 8px',
                }}
              >
                {exportError}
              </div>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{
                width: '100%',
                padding: '9px 0',
                background: exporting ? '#2a2a4a' : '#00B4D8',
                color: exporting ? '#666' : '#fff',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
                cursor: exporting ? 'not-allowed' : 'pointer',
              }}
            >
              {exporting ? 'Exporting…' : 'Export PNG'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
