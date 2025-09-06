import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabaseclient";

/* ---------- Types (aligned with BoardTile usage) ---------- */
type Board = {
  id: string;
  board_name?: string | null;
  hero_image_path?: string | null;
};

/* ---------- Helpers ---------- */
const MAX_FILE_MB = 5;
const BYTES_PER_MB = 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg"]);
const ALLOWED_EXT = new Set(["png", "jpg", "jpeg"]);

function formatMB(bytes: number) {
  return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
}

export default function Replacepanel({
  open,
  onClose,
  board,
  orgId,
  onReplaced,
}: {
  open: boolean;
  onClose: () => void;
  board: Board;
  orgId: string;
  onReplaced?: (newPath: string) => void;
}) {
  const [currentSignedUrl, setCurrentSignedUrl] = useState<string | null>(null);
  const [loadingCurrent, setLoadingCurrent] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string>("");

  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string>("");

  const heroPath = board?.hero_image_path || null;

  /* ---------- Load current hero (signed URL) ---------- */
  useEffect(() => {
    let active = true;
    (async () => {
      if (!open) return;
      setLoadingCurrent(true);
      if (!heroPath) {
        if (active) setCurrentSignedUrl(null);
        setLoadingCurrent(false);
        return;
      }
      const { data, error } = await supabase.storage
        .from("board-photos")
        .createSignedUrl(heroPath, 60 * 60);
      if (!active) return;
      if (error || !data?.signedUrl) setCurrentSignedUrl(null);
      else setCurrentSignedUrl(data.signedUrl);
      setLoadingCurrent(false);
    })();
    return () => { active = false; };
  }, [open, heroPath]);

  /* ---------- File selection & validation ---------- */
  const onPickFile = (files: FileList | null) => {
    setFileErr("");
    if (!files || files.length === 0) return;
    const f = files[0];

    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_MIME.has(f.type) || !ALLOWED_EXT.has(ext)) {
      setFileErr("Please upload a PNG or JPG image.");
      return;
    }
    if (f.size > MAX_FILE_MB * BYTES_PER_MB) {
      setFileErr(`Max file size is ${MAX_FILE_MB} MB.`);
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  /* ---------- Upload & update ---------- */
  const readyToUpload = useMemo(() => {
    if (!open) return false;
    if (!board?.id || !orgId) return false;
    if (!file || fileErr) return false;
    return true;
  }, [open, board?.id, orgId, file, fileErr]);

  const usagePct = file ? Math.min(100, Math.round((file.size / (MAX_FILE_MB * BYTES_PER_MB)) * 100)) : 0;
  const usageBarColor =
    usagePct < 70 ? "bg-green-500" : usagePct < 90 ? "bg-amber-500" : "bg-red-500";

  const doUpload = async () => {
    try {
      setErr("");
      setUploading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("You must be logged in to replace images.");

      const extRaw = (file!.name.split(".").pop() || "jpg").toLowerCase();
      const ext = ALLOWED_EXT.has(extRaw) ? extRaw : "jpg";
      const heroName = `hero.${ext}`;
      const newPath = `org_${orgId}/boards/${board.id}/${heroName}`;

      const { error: upErr } = await supabase.storage
        .from("board-photos")
        .upload(newPath, file!, {
          contentType: file!.type || "application/octet-stream",
          upsert: true,
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      const { error: updErr } = await supabase
        .from("boards")
        .update({ hero_image_path: newPath })
        .eq("id", board.id);
      if (updErr) throw updErr;

      const { data: signed } = await supabase.storage
        .from("board-photos")
        .createSignedUrl(newPath, 60 * 60);
      setCurrentSignedUrl(signed?.signedUrl || null);

      onReplaced?.(newPath);

      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to replace image.");
    } finally {
      setUploading(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[70] transition ${open ? "bg-black/40" : "pointer-events-none opacity-0"}`}
        onClick={() => { if (!uploading) onClose(); }}
      />

      {/* Centered modal (same wrapper logic as before to avoid breaking hover on tiles) */}
      <div
        className={`fixed inset-0 z-[71] flex items-center justify-center p-4 ${open ? "" : "pointer-events-none opacity-0"}`}
        aria-hidden={!open}
      >
        <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl overflow-hidden flex flex-col">
          {/* Header (subtle gradient for polish) */}
          <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-gradient-to-b from-white/70 to-white/40 dark:from-zinc-950/70 dark:to-zinc-950/40 backdrop-blur flex items-center justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-medium">Replace image</h3>
              <div className="text-xs text-zinc-500 truncate">{board?.board_name || "Untitled board"}</div>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm disabled:opacity-50"
              disabled={uploading}
            >
              Close
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Current (ghosted inner frame) */}
            <section>
              <div className="text-sm font-medium mb-2">Current image</div>
              <div className="relative h-32 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800/70 shadow-inner overflow-hidden">
                <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-white/40 dark:ring-black/30" />
                {loadingCurrent ? (
                  <div className="h-full w-full flex items-center justify-center text-xs text-zinc-500">Loading…</div>
                ) : currentSignedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={currentSignedUrl} alt="Current" className="h-32 w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xs text-zinc-400">No image</div>
                )}
              </div>
            </section>

            {/* New picker (ghost frame + size indicator) */}
            <section>
              <div className="text-sm font-medium mb-2">
                New image <span className="text-xs text-zinc-500">(PNG/JPG ≤ {MAX_FILE_MB} MB)</span>
              </div>

              <div className="relative">
                <div
                  className={
                    "relative rounded-lg bg-zinc-50 dark:bg-zinc-900 h-40 flex items-center justify-center text-sm text-zinc-500 cursor-pointer " +
                    "border border-dashed border-zinc-300 dark:border-zinc-700 " +
                    (uploading ? "pointer-events-none opacity-80" : "")
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); onPickFile(e.dataTransfer.files); }}
                  onClick={() => document.getElementById("replace-hero-input")?.click()}
                >
                  <div className="pointer-events-none absolute inset-1 rounded-md ring-1 ring-zinc-900/5 dark:ring-white/10" />
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="Preview" className="h-40 w-full object-cover rounded-lg" />
                  ) : (
                    <div className="text-center">
                      Drag and drop or click to upload
                      <div className="text-xs mt-1">PNG · JPG</div>
                    </div>
                  )}
                </div>

                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
                    <div className="px-3 py-1.5 text-xs rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow">
                      Uploading…
                    </div>
                  </div>
                )}
              </div>

              <input
                id="replace-hero-input"
                className="hidden"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => onPickFile(e.target.files)}
              />

              {/* filename + live size */}
              {file && (
                <div className="flex items-center gap-3 mt-2">
                  <div className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{file.name}</div>
                  <div className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                    {formatMB(file.size)} / {MAX_FILE_MB}.00 MB
                  </div>
                </div>
              )}
              {file && (
                <div className="w-full h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden mt-1">
                  <div className={`h-full ${usageBarColor}`} style={{ width: `${usagePct}%` }} />
                </div>
              )}
              {fileErr && <div className="mt-2 text-xs text-red-600">{fileErr}</div>}
            </section>

            {err && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                {err}
              </div>
            )}
          </div>

          {/* Footer (subtle gradient match) */}
          <div className="px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur flex items-center justify-between">
            <div className="text-xs text-zinc-600">Changes apply only to this board.</div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-full border border-zinc-300 hover:bg-zinc-100 text-sm disabled:opacity-50"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={doUpload}
                className="px-3 py-1.5 rounded-full border border-blue-600 bg-blue-600 text-white text-sm shadow disabled:opacity-50"
                disabled={!readyToUpload || uploading}
              >
                {uploading ? "Updating…" : "Update"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
