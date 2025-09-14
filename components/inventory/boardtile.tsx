// components/inventory/boardtile.tsx
import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabaseclient";

export type Board = {
  id: string;
  organization_id?: string;
  board_name?: string | null;
  location?: string | null;
  spec_group?: string | null;
  width_px?: number | null;
  height_px?: number | null;
  width_display?: string | null;
  height_display?: string | null;
  hero_image_path?: string | null;
};

export default function BoardTile({
  board,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
}: {
  board: Board;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onEdit?: (b: Board) => void;
}) {
  const heroPath = board.hero_image_path || null;

  // Keep our own idea of the current storage path so we can refresh after uploads
  const [currentPath, setCurrentPath] = useState<string | null>(heroPath);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false); // start false; only true during actual fetch
  const [fileErr, setFileErr] = useState<string>("");

  // DnD & upload state
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Cache-buster so we can force browsers/CDN to refetch fresh bytes
  const [cacheBuster, setCacheBuster] = useState<number>(0);

  // Constants for validation
  const MAX_FILE_MB = 5;
  const BYTES_PER_MB = 1024 * 1024;
  const ALLOWED_EXT = new Set(["png", "jpg", "jpeg"]);
  const ALLOWED_MIME = new Set(["image/png", "image/jpeg"]);

  // Sync local path with incoming prop
  useEffect(() => {
    setCurrentPath(heroPath);
    // if a brand-new image appears (was null before), also bump the cache buster
    if (heroPath) setCacheBuster(Date.now());
  }, [heroPath]);

  // Listen for explicit 'hero updated' events (backup/instant refresh)
  useEffect(() => {
    const handler = (e: Event) => {
      const { detail } = e as CustomEvent<{ id: string; path: string; ts?: number }>;
      if (!detail || detail.id !== board.id) return;
      // If the storage path changed, update it; even if it didn’t, a new ts forces a refetch
      setCurrentPath(detail.path || board.hero_image_path || null);
      setCacheBuster(detail.ts || Date.now());
    };
    window.addEventListener("board:hero-updated", handler as EventListener);
    return () => window.removeEventListener("board:hero-updated", handler as EventListener);
  }, [board.id, board.hero_image_path]);

  // get signed URL for current hero image path
  useEffect(() => {
    let active = true;
    (async () => {
      setFileErr("");
      setImgLoading(true);
      try {
        if (!currentPath) {
          if (active) {
            setSignedUrl(null);
          }
          return;
        }
        const { data, error } = await supabase.storage
          .from("board-photos")
          .createSignedUrl(currentPath, 60 * 60);

        if (!active) return;

        if (error || !data?.signedUrl) {
          setSignedUrl(null);
          setFileErr(error?.message || "Could not load image.");
          return;
        }

        // Add cache-busting param so we always get the newest bytes
        const sep = data.signedUrl.includes("?") ? "&" : "?";
        const busted = `${data.signedUrl}${sep}ts=${cacheBuster || Date.now()}`;
        setSignedUrl(busted);
      } catch (err: any) {
        if (active) {
          setSignedUrl(null);
          setFileErr(err?.message || "Could not load image.");
        }
      } finally {
        if (active) setImgLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentPath, cacheBuster]);

  // Display strings
  const pixelsText = useMemo(() => {
    const w = board.width_px ?? null;
    const h = board.height_px ?? null;
    return w && h ? `${w}×${h}` : "—";
  }, [board.width_px, board.height_px]);

  const feetText = useMemo(() => {
    const w = normalizeFeet(board.width_display);
    const h = normalizeFeet(board.height_display);
    if (!w || !h) return "—";
    return `${w} × ${h}`;
  }, [board.width_display, board.height_display]);

  // ---- Drag & Drop handlers ----
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setDragActive(true);
  };
  const onDragEnter: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setDragActive(true);
  };
  const onDragLeave: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading) setDragActive(false);
  };
  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setFileErr("");
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    await handleUpload(files[0]);
  };

  // ---- Upload function ----
  const handleUpload = async (file: File) => {
    try {
      // validate
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.type)) {
        setFileErr("Please upload a PNG or JPG image.");
        return;
      }
      if (file.size > MAX_FILE_MB * BYTES_PER_MB) {
        setFileErr(`Max file size is ${MAX_FILE_MB} MB.`);
        return;
      }
      if (!board.id) return;

      // resolve org id
      let orgId = board.organization_id || "";
      if (!orgId) {
        const { data, error } = await supabase
          .from("boards")
          .select("organization_id")
          .eq("id", board.id)
          .maybeSingle();
        if (error || !data?.organization_id) {
          setFileErr("Missing organization id for this board.");
          return;
        }
        orgId = data.organization_id as string;
      }

      setUploading(true);
      setFileErr("");

      // build storage path
      const heroName = `hero.${ext}`;
      const newPath = `org_${orgId}/boards/${board.id}/${heroName}`;

      // upload (upsert)
      const { error: upErr } = await supabase.storage
        .from("board-photos")
        .upload(newPath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      // update board record
      const { error: updErr } = await supabase
        .from("boards")
        .update({ hero_image_path: newPath })
        .eq("id", board.id);
      if (updErr) throw updErr;

      // locally refresh immediately
      setCurrentPath(newPath);
      setCacheBuster(Date.now());

      // also broadcast so inventory / other tiles react
      window.dispatchEvent(
        new CustomEvent("board:hero-updated", {
          detail: { id: board.id, path: newPath, ts: Date.now() },
        })
      );
    } catch (e: any) {
      setFileErr(e?.message || "Failed to update image.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm bg-white dark:bg-zinc-950 relative">
      {/* selection control */}
      {selectMode && (
        <button
          onClick={onToggleSelect}
          className="absolute left-3 top-3 z-20 w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/90 backdrop-blur flex items-center justify-center shadow-sm hover:shadow transition"
          title={selected ? "Deselect" : "Select"}
          aria-pressed={!!selected}
          aria-label={selected ? "Deselect board" : "Select board"}
        >
          <span
            className={
              "w-3 h-3 rounded-full transition-transform duration-200 " +
              (selected ? "bg-blue-600 dark:bg-blue-400 scale-110" : "bg-transparent scale-90")
            }
          />
        </button>
      )}

      <div className="relative">
        <div
          className={
            "h-40 flex items-center justify-center " +
            (signedUrl ? "" : "bg-zinc-100 dark:bg-zinc-900")
          }
          onClick={() => (selectMode && onToggleSelect ? onToggleSelect() : null)}
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* Image or placeholder */}
          {imgLoading ? (
            <div className="text-xs text-zinc-500">Loading…</div>
          ) : signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrl}
              alt={board.board_name || "board"}
              className={"h-40 w-full object-cover " + (selectMode ? "cursor-pointer" : "")}
              loading="lazy"
            />
          ) : (
            <div className="text-xs text-zinc-400">
              {selectMode ? "Click to select" : "No image"}
            </div>
          )}

          {/* DnD / Upload overlay */}
          {(dragActive || uploading) && (
            <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center">
              <div className="rounded-xl border-2 border-dashed border-white/80 px-4 py-2 text-white text-sm">
                {uploading ? "Uploading…" : "Drop image to replace"}
              </div>
            </div>
          )}
        </div>

        {/* hover edit action */}
        {!selectMode && (
          <div className="absolute inset-x-0 top-0 p-2 flex justify-end opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={() => onEdit?.(board)}
              className="px-2.5 py-1.5 text-xs rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/90 dark:bg-zinc-900/80 backdrop-blur hover:bg-white dark:hover:bg-zinc-800 shadow-sm"
              title="Edit (image & details)"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      <div className="p-3 text-sm space-y-1.5">
        <div className="font-medium text-zinc-800 dark:text-zinc-100 truncate">
          {board.board_name || "Untitled board"}
        </div>
        <Row label="Location" value={board.location || "—"} />
        <Row label="Pixels" value={pixelsText} />
        <Row label="Feet" value={feetText} />
        {fileErr && <div className="text-[11px] text-red-600">{fileErr}</div>}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-zinc-500 mt-[2px]">
        {label}
      </span>
      <span className="text-zinc-700 dark:text-zinc-200 truncate">{value}</span>
    </div>
  );
}

function normalizeFeet(x?: string | null): string | null {
  if (!x) return null;
  const s = String(x).trim();
  if (/ft/i.test(s)) return s.replace(/\s*ft\s*$/i, " ft");
  if (/^\d+(\.\d+)?$/.test(s)) return `${s} ft`;
  return s;
}
