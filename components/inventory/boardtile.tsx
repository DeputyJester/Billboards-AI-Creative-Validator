// components/inventory/boardtile.tsx
'use client';

import { useEffect, useState } from 'react';
import supabase from '@/lib/supabaseclient';

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

export default function BoardTile({ board }: { board: Board }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  // helper: fetch a fresh signed URL for this board's hero path
  async function refreshSignedUrl(path: string | null | undefined) {
    if (!path) { setSignedUrl(null); return; }
    const { data, error } = await supabase
      .storage
      .from('board-photos')
      .createSignedUrl(path, 60 * 60); // 1 hour
    if (error || !data?.signedUrl) {
      setSignedUrl(null);
      return;
    }
    // cache-bust in case browser caches previous URL
    setSignedUrl(`${data.signedUrl}&t=${Date.now()}`);
  }

  useEffect(() => {
    refreshSignedUrl(board.hero_image_path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.hero_image_path]);

  async function uploadHero(file: File) {
    setBusy(true); setError(null);
    try {
      if (!/image\/(jpeg|png|webp)/.test(file.type)) throw new Error('Use JPG/PNG/WebP');
      if (file.size > 5 * 1024 * 1024) throw new Error('Max 5MB');

      const hero = await toWebpBlob(file, 1600, 0.85);
      const thumb = await toWebpBlob(file, 600, 0.85);

      // Get token for the URL-issuing API (membership check, etc.)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');

      // Ask server for signed upload URLs (org inferred from board)
      const res = await fetch('/api/hero-upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          boardId: board.id,
          heroName: 'hero.webp',
          thumbName: 'thumb.webp',
        }),
      });

      const raw = await res.text();
      let j: any;
      try { j = JSON.parse(raw); } catch {
        throw new Error(`Upload URL error (${res.status}): ${raw.slice(0, 180)}`);
      }
      if (!res.ok || j?.error) throw new Error(j?.error || `Upload URL error (${res.status})`);

      // PUT the image bytes to Storage
      await fetch(j.heroUrl, { method: 'PUT', body: hero });
      await fetch(j.thumbUrl, { method: 'PUT', body: thumb });

      // Update the board row with the stored path
      const { error: upErr } = await supabase
        .from('boards')
        .update({ hero_image_path: j.heroPath, hero_updated_at: new Date().toISOString() })
        .eq('id', board.id);
      if (upErr) throw upErr;

      // Show the new image by generating a fresh signed URL
      await refreshSignedUrl(j.heroPath);
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
        {signedUrl ? (
          <img src={signedUrl} alt="hero" className="w-full h-full object-cover" />
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
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadHero(e.target.files[0])}
            />
          </label>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
