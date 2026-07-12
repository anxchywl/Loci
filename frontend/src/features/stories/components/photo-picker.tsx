"use client";

import { ImagePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

function PhotoThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-full w-full object-cover" />
  ) : null;
}

interface PhotoPickerProps {
  photos: File[];
  maxPhotos: number;
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
  addLabel: string;
  removeLabel: string;
  disabled?: boolean;
}

export function PhotoPicker({ photos, maxPhotos, onAdd, onRemove, addLabel, removeLabel, disabled = false }: PhotoPickerProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {photos.map((file, index) => (
        <div key={`${file.name}-${index}`} className="relative aspect-square overflow-hidden rounded border border-border bg-surface">
          <PhotoThumb file={file} />
          <button type="button" aria-label={removeLabel} onClick={() => onRemove(index)} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white">
            <X size={13} />
          </button>
        </div>
      ))}
      {photos.length < maxPhotos && (
        <label className={`flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-border text-muted transition-colors duration-150 ease-lm hover:bg-surface ${disabled ? "pointer-events-none opacity-50" : ""}`}>
          <ImagePlus size={18} />
          <span className="text-[11px]">{addLabel}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple hidden disabled={disabled} onChange={(event) => onAdd(event.target.files)} />
        </label>
      )}
    </div>
  );
}
