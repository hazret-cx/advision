'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const FIT_MODES = ['contain', 'cover', 'fill'];

// 8-point resize handles: position offsets + cursor style
const HANDLES = {
  nw: { top: -5, left: -5,             cursor: 'nw-resize' },
  n:  { top: -5, left: '50%', ml: -5,  cursor: 'n-resize'  },
  ne: { top: -5, right: -5,            cursor: 'ne-resize' },
  e:  { top: '50%', mt: -5, right: -5, cursor: 'e-resize'  },
  se: { bottom: -5, right: -5,         cursor: 'se-resize' },
  s:  { bottom: -5, left: '50%', ml: -5, cursor: 's-resize' },
  sw: { bottom: -5, left: -5,          cursor: 'sw-resize' },
  w:  { top: '50%', mt: -5, left: -5,  cursor: 'w-resize'  },
};

function handlePositionStyle(key) {
  const h = HANDLES[key];
  return {
    position: 'absolute',
    width: 10,
    height: 10,
    background: '#00B4D8',
    border: '2px solid #fff',
    borderRadius: 2,
    boxSizing: 'border-box',
    zIndex: 20,
    cursor: h.cursor,
    ...(h.top    !== undefined ? { top:    h.top }    : {}),
    ...(h.bottom !== undefined ? { bottom: h.bottom } : {}),
    ...(h.left   !== undefined ? { left:   h.left }   : {}),
    ...(h.right  !== undefined ? { right:  h.right }  : {}),
    ...(h.ml     !== undefined ? { marginLeft: h.ml } : {}),
    ...(h.mt     !== undefined ? { marginTop:  h.mt } : {}),
  };
}

export default function MockupEditor({
  mockupId,
  screenshotPath,
  slots,
  creatives,
  suggestedMatches,
  onComposed,
  onClose,
}) {
  const [placements, setPlacements] = useState({});
  const [activeSlot, setActiveSlot] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(900);

  // Erase tool
  const [eraseMode, setEraseMode] = useState(false);
  const [erasures, setErasures] = useState([]);
  const [eraseDragStart, setEraseDragStart] = useState(null);
  const [eraseDrawingRect, setEraseDrawingRect] = useState(null);

  // Drag / resize interaction
  // { type: 'move'|'resize', idx, handle?, startMouseX, startMouseY,
  //   startX, startY, startW?, startH? }
  const [interacting, setInteracting] = useState(null);
  const didDrag = useRef(false);

  const containerRef  = useRef(null);
  const imageWrapperRef = useRef(null);

  // ── Init placements from suggestions ──────────────────────────────────────
  useEffect(() => {
    const initial = {};
    suggestedMatches.forEach((match) => {
      const idx = slots.findIndex(
        (s) =>
          s.x === match.slot.x && s.y === match.slot.y &&
          s.width === match.slot.width && s.height === match.slot.height
      );
      if (idx !== -1 && !(idx in initial)) {
        initial[idx] = { creativeId: match.creative.id, fitMode: 'contain' };
      }
    });
    setPlacements(initial);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Measure container ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(e.contentRect.width || 900);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const scale = containerWidth / 1440;

  // ── Effective rect (falls back to detected slot values) ───────────────────
  const getRect = useCallback((idx) => {
    const s = slots[idx];
    const p = placements[idx];
    return {
      x: p?.customX ?? s.x,
      y: p?.customY ?? s.y,
      w: p?.customW ?? s.width,
      h: p?.customH ?? s.height,
    };
  }, [slots, placements]);

  // ── Global mouse listeners while dragging / resizing ─────────────────────
  useEffect(() => {
    if (!interacting) return;

    const onMove = (e) => {
      const rawDx = e.clientX - interacting.startMouseX;
      const rawDy = e.clientY - interacting.startMouseY;
      if (Math.abs(rawDx) > 3 || Math.abs(rawDy) > 3) didDrag.current = true;

      const dx = rawDx / scale;
      const dy = rawDy / scale;
      const { type, idx } = interacting;

      if (type === 'move') {
        setPlacements((prev) => ({
          ...prev,
          [idx]: {
            ...prev[idx],
            customX: Math.round(interacting.startX + dx),
            customY: Math.round(interacting.startY + dy),
            customW: prev[idx]?.customW ?? slots[idx].width,
            customH: prev[idx]?.customH ?? slots[idx].height,
          },
        }));
      } else {
        // resize
        const { handle, startX, startY, startW, startH } = interacting;
        const MIN = 30;
        let nx = startX, ny = startY, nw = startW, nh = startH;

        if (handle.includes('e')) nw = Math.max(MIN, startW + dx);
        if (handle.includes('s')) nh = Math.max(MIN, startH + dy);
        if (handle.includes('w')) {
          nw = startW - dx;
          if (nw < MIN) { nx = startX + startW - MIN; nw = MIN; }
          else { nx = startX + dx; }
        }
        if (handle.includes('n')) {
          nh = startH - dy;
          if (nh < MIN) { ny = startY + startH - MIN; nh = MIN; }
          else { ny = startY + dy; }
        }

        setPlacements((prev) => ({
          ...prev,
          [idx]: {
            ...prev[idx],
            customX: Math.round(nx),
            customY: Math.round(ny),
            customW: Math.round(nw),
            customH: Math.round(nh),
          },
        }));
      }
    };

    const onUp = () => setInteracting(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [interacting, scale, slots]);

  // ── Slot interaction ──────────────────────────────────────────────────────

  const startMove = useCallback((e, idx) => {
    if (eraseMode || !placements[idx]?.creativeId) return;
    e.preventDefault();
    didDrag.current = false;
    const r = getRect(idx);
    setInteracting({ type: 'move', idx, startMouseX: e.clientX, startMouseY: e.clientY, startX: r.x, startY: r.y });
  }, [eraseMode, placements, getRect]);

  const startResize = useCallback((e, idx, handle) => {
    e.stopPropagation();
    e.preventDefault();
    didDrag.current = false;
    const r = getRect(idx);
    setInteracting({ type: 'resize', idx, handle, startMouseX: e.clientX, startMouseY: e.clientY, startX: r.x, startY: r.y, startW: r.w, startH: r.h });
  }, [getRect]);

  const handleSlotClick = useCallback((idx) => {
    if (didDrag.current || eraseMode) return;
    setActiveSlot((prev) => (prev === idx ? null : idx));
  }, [eraseMode]);

  const handleCreativeAssign = useCallback((creative) => {
    if (activeSlot === null) return;
    setPlacements((prev) => ({
      ...prev,
      [activeSlot]: { ...prev[activeSlot], creativeId: creative.id, fitMode: prev[activeSlot]?.fitMode || 'contain' },
    }));
    setActiveSlot(null);
  }, [activeSlot]);

  const handleFitMode = useCallback((mode) => {
    setActiveSlot((slot) => {
      if (slot === null) return slot;
      setPlacements((prev) => prev[slot] ? { ...prev, [slot]: { ...prev[slot], fitMode: mode } } : prev);
      return slot;
    });
  }, []);

  const handleRemovePlacement = useCallback((idx, e) => {
    e.stopPropagation();
    setPlacements((prev) => { const n = { ...prev }; delete n[idx]; return n; });
    setActiveSlot(null);
  }, []);

  const handleResetPosition = useCallback((idx) => {
    setPlacements((prev) => {
      const p = { ...prev[idx] };
      delete p.customX; delete p.customY; delete p.customW; delete p.customH;
      return { ...prev, [idx]: p };
    });
  }, []);

  // ── Erase tool ────────────────────────────────────────────────────────────

  const toggleEraseMode = useCallback(() => {
    setEraseMode((m) => !m);
    setActiveSlot(null);
    setEraseDragStart(null);
    setEraseDrawingRect(null);
  }, []);

  const wrapperOffset = useCallback(() => {
    if (!imageWrapperRef.current) return { left: 0, top: 0 };
    const r = imageWrapperRef.current.getBoundingClientRect();
    return { left: r.left, top: r.top };
  }, []);

  const onEraseDown = useCallback((e) => {
    if (!eraseMode) return;
    e.preventDefault();
    const { left, top } = wrapperOffset();
    setEraseDragStart({ x: e.clientX - left, y: e.clientY - top });
    setEraseDrawingRect(null);
  }, [eraseMode, wrapperOffset]);

  const onEraseMove = useCallback((e) => {
    if (!eraseMode || !eraseDragStart) return;
    const { left, top } = wrapperOffset();
    const cx = e.clientX - left, cy = e.clientY - top;
    setEraseDrawingRect({
      left: Math.min(eraseDragStart.x, cx),
      top:  Math.min(eraseDragStart.y, cy),
      width:  Math.abs(cx - eraseDragStart.x),
      height: Math.abs(cy - eraseDragStart.y),
    });
  }, [eraseMode, eraseDragStart, wrapperOffset]);

  const onEraseUp = useCallback(() => {
    if (eraseDrawingRect && eraseDrawingRect.width > 10 && eraseDrawingRect.height > 10) {
      setErasures((prev) => [...prev, {
        x: Math.round(eraseDrawingRect.left  / scale),
        y: Math.round(eraseDrawingRect.top   / scale),
        width:  Math.round(eraseDrawingRect.width  / scale),
        height: Math.round(eraseDrawingRect.height / scale),
      }]);
    }
    setEraseDragStart(null);
    setEraseDrawingRect(null);
  }, [eraseDrawingRect, scale]);

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    const placementArray = Object.entries(placements)
      .filter(([, p]) => p?.creativeId)
      .map(([idx, p]) => {
        const r = getRect(parseInt(idx));
        return { x: r.x, y: r.y, width: r.w, height: r.h, creativeId: p.creativeId, fitMode: p.fitMode };
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
  }, [placements, mockupId, screenshotPath, erasures, getRect, onComposed]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const creativeById    = Object.fromEntries(creatives.map((c) => [c.id, c]));
  const activePlacement = activeSlot !== null ? placements[activeSlot] : null;
  const activeRect      = activeSlot !== null ? getRect(activeSlot) : null;
  const activeIsCustom  = activeSlot !== null &&
    (placements[activeSlot]?.customX != null || placements[activeSlot]?.customW != null);

  const isDragging = !!interacting;
  const wrapperCursor = eraseMode ? 'crosshair' : isDragging ? 'grabbing' : 'default';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: '#1A1A2E', borderBottom: '1px solid #2a2a4a', flexShrink: 0 }}>
        <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Edit Mockup</span>

        <button
          onClick={toggleEraseMode}
          style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: eraseMode ? '#ef4444' : '#2a2a4a', color: eraseMode ? '#fff' : '#aaa' }}
        >
          {eraseMode ? '✕ Stop Erasing' : '⬜ Erase Overlay'}
        </button>

        <button onClick={onClose} style={{ marginLeft: 'auto', color: '#888', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Canvas ── */}
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: 'auto', padding: 16, userSelect: (eraseMode || isDragging) ? 'none' : 'auto' }}
          onMouseMove={eraseMode ? onEraseMove : undefined}
          onMouseUp={eraseMode ? onEraseUp : undefined}
          onMouseLeave={eraseMode ? onEraseUp : undefined}
        >
          <div
            ref={imageWrapperRef}
            style={{ position: 'relative', display: 'inline-block', width: '100%', cursor: wrapperCursor }}
            onMouseDown={eraseMode ? onEraseDown : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/screenshot?path=${encodeURIComponent(screenshotPath)}`}
              alt="Publisher screenshot"
              style={{ width: '100%', display: 'block' }}
              draggable={false}
            />

            {/* ── Ad slot overlays ── */}
            {!eraseMode && slots.map((slot, idx) => {
              const p       = placements[idx];
              const isActive  = activeSlot === idx;
              const hasCreative = !!p?.creativeId;
              const creative    = hasCreative ? creativeById[p.creativeId] : null;
              const r           = getRect(idx);
              const isCustom    = p?.customX != null || p?.customW != null;

              return (
                <div
                  key={idx}
                  onMouseDown={(e) => startMove(e, idx)}
                  onClick={() => handleSlotClick(idx)}
                  style={{
                    position: 'absolute',
                    left:   r.x * scale,
                    top:    r.y * scale,
                    width:  r.w * scale,
                    height: r.h * scale,
                    boxSizing: 'border-box',
                    border: isActive   ? '2px solid #00B4D8'
                          : isCustom  ? '2px solid #a78bfa'
                          : hasCreative ? '2px solid #3b82f6'
                          : '2px dashed #666',
                    overflow: 'visible',           // let resize handles bleed out
                    cursor: hasCreative ? (interacting?.idx === idx ? 'grabbing' : 'grab') : 'pointer',
                  }}
                >
                  {/* Inner clip — keeps the creative image inside the boundary */}
                  <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                    {hasCreative && creative ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/creative-image?id=${encodeURIComponent(creative.filename)}`}
                          alt={creative.original_name}
                          style={{ width: '100%', height: '100%', objectFit: p.fitMode === 'fill' ? 'fill' : p.fitMode === 'cover' ? 'cover' : 'contain', display: 'block', pointerEvents: 'none' }}
                          draggable={false}
                        />
                        {/* Overlay bar */}
                        <div style={{ position: 'absolute', bottom: 2, left: 2, right: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', padding: '1px 4px', borderRadius: 2 }}>
                          <span>
                            {p.fitMode}
                            {isCustom && <span style={{ marginLeft: 4, color: '#a78bfa' }}>· repositioned</span>}
                          </span>
                          <button
                            onClick={(e) => handleRemovePlacement(idx, e)}
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }}
                          >×</button>
                        </div>
                      </>
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#aaa', fontSize: Math.max(9, 11 * scale), textAlign: 'center', padding: 2, background: 'rgba(0,0,0,0.15)' }}>
                        <div>{slot.width}×{slot.height}</div>
                        <div style={{ fontSize: Math.max(8, 10 * scale), marginTop: 1 }}>click to add</div>
                      </div>
                    )}
                  </div>

                  {/* ── Resize handles (active slot with creative only) ── */}
                  {isActive && hasCreative && Object.keys(HANDLES).map((handle) => (
                    <div
                      key={handle}
                      onMouseDown={(e) => startResize(e, idx, handle)}
                      style={handlePositionStyle(handle)}
                    />
                  ))}
                </div>
              );
            })}

            {/* ── Erasure regions ── */}
            {erasures.map((er, i) => (
              <div key={`er-${i}`} style={{ position: 'absolute', left: er.x * scale, top: er.y * scale, width: er.width * scale, height: er.height * scale, background: 'rgba(255,255,255,0.88)', border: '2px dashed #ef4444', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: eraseMode ? 'none' : 'auto' }}>
                {!eraseMode && (
                  <button onClick={(e) => { e.stopPropagation(); setErasures((prev) => prev.filter((_, j) => j !== i)); }} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    ✕ Remove
                  </button>
                )}
              </div>
            ))}

            {/* ── Erase drawing preview ── */}
            {eraseDrawingRect && eraseDrawingRect.width > 0 && (
              <div style={{ position: 'absolute', left: eraseDrawingRect.left, top: eraseDrawingRect.top, width: eraseDrawingRect.width, height: eraseDrawingRect.height, background: 'rgba(239,68,68,0.18)', border: '2px dashed #ef4444', boxSizing: 'border-box', pointerEvents: 'none' }} />
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ width: 230, flexShrink: 0, background: '#111122', borderLeft: '1px solid #2a2a4a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Panel header */}
          <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #2a2a4a', color: '#bbb', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
            {eraseMode ? 'Erase Overlay' : activeSlot !== null ? `Slot ${activeSlot + 1}` : 'Creatives'}
          </div>

          {/* ── Erase panel ── */}
          {eraseMode && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 14, gap: 12 }}>
              <p style={{ color: '#aaa', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                Click and drag over any paywall, cookie banner, or subscribe overlay to paint it out.
              </p>
              <p style={{ color: '#666', fontSize: 11, margin: 0 }}>
                {erasures.length === 0 ? 'No erasures yet.' : `${erasures.length} erasure${erasures.length > 1 ? 's' : ''} drawn.`}
              </p>
              {erasures.length > 0 && (
                <button onClick={() => setErasures([])} style={{ background: '#2a1010', color: '#f87171', border: '1px solid #5a1010', borderRadius: 5, padding: '6px 0', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Clear All Erasures
                </button>
              )}
              <button onClick={toggleEraseMode} style={{ background: '#2a2a4a', color: '#ccc', border: 'none', borderRadius: 5, padding: '6px 0', cursor: 'pointer', fontSize: 12 }}>
                Done — Back to Slots
              </button>
            </div>
          )}

          {/* ── Slot detail panel ── */}
          {!eraseMode && activeSlot !== null && (
            <>
              {/* Position / size readout */}
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #2a2a4a', flexShrink: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', fontSize: 11, color: '#888', marginBottom: 6 }}>
                  <span>X</span><span style={{ color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{activeRect.x}px</span>
                  <span>Y</span><span style={{ color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{activeRect.y}px</span>
                  <span>W</span><span style={{ color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{activeRect.w}px</span>
                  <span>H</span><span style={{ color: '#ccc', fontVariantNumeric: 'tabular-nums' }}>{activeRect.h}px</span>
                </div>
                {activeIsCustom && (
                  <button
                    onClick={() => handleResetPosition(activeSlot)}
                    style={{ width: '100%', padding: '4px 0', background: '#1c1c38', color: '#a78bfa', border: '1px solid #3a2a6a', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                  >
                    ↩ Reset to detected position
                  </button>
                )}
              </div>

              {/* Drag/resize hint (only when creative assigned) */}
              {activePlacement?.creativeId && (
                <div style={{ padding: '6px 14px', borderBottom: '1px solid #2a2a4a', flexShrink: 0 }}>
                  <p style={{ color: '#444', fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                    Drag to move &middot; Drag corner / edge handles to resize
                  </p>
                </div>
              )}

              {/* Fit mode */}
              <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid #2a2a4a', flexShrink: 0 }}>
                {FIT_MODES.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleFitMode(mode)}
                    style={{ flex: 1, padding: '4px 0', fontSize: 11, fontWeight: 500, borderRadius: 4, border: 'none', cursor: 'pointer', background: activePlacement?.fitMode === mode ? '#00B4D8' : '#2a2a4a', color: activePlacement?.fitMode === mode ? '#fff' : '#aaa' }}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── Creative list ── */}
          {!eraseMode && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {activeSlot !== null ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {creatives.map((creative) => (
                    <button
                      key={creative.id}
                      onClick={() => handleCreativeAssign(creative)}
                      style={{ background: '#1e1e38', border: activePlacement?.creativeId === creative.id ? '2px solid #00B4D8' : '2px solid #2a2a4a', borderRadius: 6, padding: 6, cursor: 'pointer', textAlign: 'left' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/creative-image?id=${encodeURIComponent(creative.filename)}`}
                        alt={creative.original_name}
                        style={{ width: '100%', height: 60, objectFit: 'contain', display: 'block', background: '#0a0a1a', borderRadius: 3 }}
                      />
                      <div style={{ marginTop: 4, fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

          {/* ── Export ── */}
          <div style={{ padding: '12px 14px', borderTop: '1px solid #2a2a4a', flexShrink: 0 }}>
            {exportError && (
              <div style={{ marginBottom: 8, fontSize: 11, color: '#f87171', background: '#2a1010', borderRadius: 4, padding: '4px 8px' }}>
                {exportError}
              </div>
            )}
            <button
              onClick={handleExport}
              disabled={exporting}
              style={{ width: '100%', padding: '9px 0', background: exporting ? '#2a2a4a' : '#00B4D8', color: exporting ? '#666' : '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: exporting ? 'not-allowed' : 'pointer' }}
            >
              {exporting ? 'Exporting…' : 'Export PNG'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
