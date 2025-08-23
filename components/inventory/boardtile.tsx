'use client';

import { useState } from 'react';
import supabase from '@/lib/supabaseclient';

// Minimal type
type Board = {
  id: string;
  board_name: string;
  location?: string | null;
  spec_group?: string | null;
  width_display?: string | null;
  height_display?: string | null;
  width_px?: number | null;
  height_px?: number | null;
  hero_image_path?: string | null;
};

// Resize to WebP in-browser
async function toWebpBlob(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), 'image/webp', quality)
    );
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function BoardTile({ board, orgId }: { board: Board; orgId: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadHero(file: File) {
    setBusy(true); setError(null);
    try {
      if (!/image\/(jpeg|png|webp)/.test(file.type)) throw new Error('Use JPG/PNG/WebP');
      if (file.size > 5 * 1024 * 1024) throw new Error('Max 5MB');

      const hero = await toWebpBlob(file, 1600, 0.85);
      const thumb = await toWebpBlob(file, 600, 0.85);

      const res = await fetch('/api/boards/hero-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: board.id, orgId, heroName: 'hero.webp', thumbName: 'thumb.webp' })
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);

      await fetch(j.heroUrl, { method: 'PUT', body: hero });
      await fetch(j.thumbUrl, { method: 'PUT', body: thumb });

      const { error: upErr } = await supabase
        .from('boards')
        .update({ hero_image_path: j.heroPath, hero_updated_at: new Date().toISOString() })
        .eq('id', board.id);
      if (upErr) throw upErr;

      setPreview(URL.createObjectURL(hero));
    } catch (e: any) {
      setError(e.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) uploadHero(f);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 shadow-sm p-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-base font-semibold truncate">{board.board_name}</h3>
        {board.spec_group && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100">{board.spec_group}</span>
        )}
      </div>

      <div
        className="aspect-video w-full rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {preview ? (
          <img src={preview} alt="hero" className="w-full h-full object-cover" />
        ) : board.hero_image_path ? (
          <img src={`/api/boards/hero?boardId=${board.id}`} alt="hero" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm text-neutral-500">{busy ? 'Uploading…' : 'Drag & drop hero image'}</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-neutral-700">
        <div><span className="text-neutral-500">Location: </span>{board.location || '—'}</div>
        <div><span className="text-neutral-500">Size: </span>{board.width_display || '—'} × {board.height_display || '—'}</div>
        <div><span className="text-neutral-500">Pixels: </span>{board.width_px} × {board.height_px}</div>
        <div>
          <label className="text-xs underline cursor-pointer">
            Replace
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadHero(e.target.files[0])} />
          </label>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
