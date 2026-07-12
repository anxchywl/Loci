"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";

interface PhotoEditorProps {
  file: File;
  onCancel: () => void;
  onApply: (file: File) => void;
  cancelLabel: string;
  applyLabel: string;
}

// the square crop viewport, in CSS px, centred inside the dark canvas
const FRAME = 260;

export function PhotoEditor({ file, onCancel, onApply, cancelLabel, applyLabel }: PhotoEditorProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startDrag = useRef({ x: 0, y: 0 });
  const startOffset = useRef({ x: 0, y: 0 });
  const activePointers = useRef<Record<number, { x: number; y: number }>>({});
  const startPinchDistance = useRef(0);
  const startPinchScale = useRef(1);

  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => {
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  // the displayed image is sized so its shorter side covers the frame
  const base = dimensions
    ? dimensions.width > dimensions.height
      ? { width: FRAME * (dimensions.width / dimensions.height), height: FRAME }
      : { width: FRAME, height: FRAME * (dimensions.height / dimensions.width) }
    : { width: FRAME, height: FRAME };

  const constrain = (x: number, y: number, s: number) => {
    const w = base.width * s;
    const h = base.height * s;
    const maxX = Math.max(0, (w - FRAME) / 2);
    const maxY = Math.max(0, (h - FRAME) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    activePointers.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const ids = Object.keys(activePointers.current);
    if (ids.length === 2) {
      isDragging.current = false;
      const [p1, p2] = ids.map((id) => activePointers.current[Number(id)]);
      startPinchDistance.current = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      startPinchScale.current = scale;
    } else {
      isDragging.current = true;
      startDrag.current = { x: e.clientX, y: e.clientY };
      startOffset.current = { ...offset };
    }
    containerRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!(e.pointerId in activePointers.current)) return;
    activePointers.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const ids = Object.keys(activePointers.current);
    if (ids.length === 2 && startPinchDistance.current > 0) {
      const [p1, p2] = ids.map((id) => activePointers.current[Number(id)]);
      const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const next = Math.max(1, Math.min(3, startPinchScale.current * (distance / startPinchDistance.current)));
      setScale(next);
      setOffset((prev) => constrain(prev.x, prev.y, next));
    } else if (isDragging.current) {
      const nextX = startOffset.current.x + (e.clientX - startDrag.current.x);
      const nextY = startOffset.current.y + (e.clientY - startDrag.current.y);
      setOffset(constrain(nextX, nextY, scale));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    delete activePointers.current[e.pointerId];
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const ids = Object.keys(activePointers.current);
    if (ids.length < 2) startPinchDistance.current = 0;
    if (ids.length === 1) {
      const p = activePointers.current[Number(ids[0])];
      startDrag.current = { x: p.x, y: p.y };
      startOffset.current = { ...offset };
      isDragging.current = true;
    } else {
      isDragging.current = false;
    }
  };

  const changeScale = (next: number) => {
    setScale(next);
    setOffset((prev) => constrain(prev.x, prev.y, next));
  };

  const apply = () => {
    const image = imageRef.current;
    const viewport = viewportRef.current;
    if (!image || !viewport) return;
    const rect = image.getBoundingClientRect();
    const frame = viewport.getBoundingClientRect();
    const scaleX = image.naturalWidth / rect.width;
    const scaleY = image.naturalHeight / rect.height;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1200;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(
      image,
      (frame.left - rect.left) * scaleX,
      (frame.top - rect.top) * scaleY,
      frame.width * scaleX,
      frame.height * scaleY,
      0,
      0,
      1200,
      1200,
    );
    canvas.toBlob((blob) => {
      if (blob) onApply(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
    }, "image/jpeg", 0.84);
  };

  return (
    <div className="photo-editor motion-safe:animate-story-state">
      <div
        ref={containerRef}
        className="photo-editor-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imageRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            className="photo-editor-image"
            style={{
              width: `${base.width}px`,
              height: `${base.height}px`,
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            }}
          />
        )}
        <div className="photo-editor-frame" ref={viewportRef} style={{ width: FRAME, height: FRAME }} aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3 text-muted">
        <Minus size={15} />
        <input aria-label={applyLabel} type="range" min="1" max="3" step="0.02" value={scale} onChange={(event) => changeScale(Number(event.target.value))} className="h-1 flex-1 accent-[var(--lm-accent)]" />
        <Plus size={15} />
      </div>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded border border-border py-2.5 text-[14px] font-medium text-muted transition-colors duration-150 ease-lm hover:bg-surface">{cancelLabel}</button>
        <button type="button" onClick={apply} className="flex-1 rounded bg-accent py-2.5 text-[14px] font-semibold text-accent-text transition-transform duration-150 ease-lm active:scale-[0.98]">{applyLabel}</button>
      </div>
    </div>
  );
}
