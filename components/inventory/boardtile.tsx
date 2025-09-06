import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabaseclient";
import Replacepanel from "./replacepanel";

type Board = {
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
}: {
  board: Board;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string>("");

  // get orgId (if not in board)
  useEffect(() => {
    (async () => {
      if (board.organization_id) {
        setOrgId(board.organization_id);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_organizations")
        .select("organization_id")
        .eq("user_id", user.id);
      const current = data?.[0]?.organization_id as string | undefined;
      if (current) setOrgId(current);
    })();
  }, [board.organization_id]);

  // get signed URL for hero
  // get signed URL for hero
  const heroPath = board.hero_image_path || null;
  useEffect(() => {
    let active = true;
    (async () => {
      if (!heroPath) {
        setSignedUrl(null);
        return;
      }
      const { data, error } = await supabase.storage
        .from("board-photos")
        .createSignedUrl(heroPath, 60 * 60); // 1 hour

      // TEMP LOGS to diagnose
      if (error) {
        console.error("createSignedUrl error:", error, "heroPath:", heroPath);
      } else {
        console.log("createSignedUrl OK for", heroPath);
      }

      if (!active) return;
      if (error || !data?.signedUrl) setSignedUrl(null);
      else setSignedUrl(data.signedUrl);
    })();
    return () => {
      active = false;
    };
  }, [heroPath]);


  // refresh signed URL on demand
  const refreshSignedUrl = async (path: string | null | undefined) => {
    if (!path) {
      setSignedUrl(null);
      return;
    }
    const { data } = await supabase.storage.from("board-photos").createSignedUrl(path, 60 * 60);
    setSignedUrl(data?.signedUrl || null);
  };

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

  return (
    <div className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm bg-white dark:bg-zinc-950 relative">
      {/* circular selection control */}
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
              (selected
                ? "bg-blue-600 dark:bg-blue-400 scale-110"
                : "bg-transparent scale-90")
            }
          />
        </button>
      )}

      <div className="relative">
        <div
          className={"h-40 flex items-center justify-center " + (signedUrl ? "" : "bg-zinc-100 dark:bg-zinc-900")}
          onClick={() => (selectMode && onToggleSelect ? onToggleSelect() : null)}
        >
          {signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrl}
              alt={board.board_name || "board"}
              className={"h-40 w-full object-cover " + (selectMode ? "cursor-pointer" : "")}
              loading="lazy"
            />
          ) : (
            <div className="text-xs text-zinc-400">{selectMode ? "Click to select" : "No image"}</div>
          )}
        </div>

        {/* hover actions (hidden in select mode) */}
        {!selectMode && (
          <div className="absolute inset-x-0 top-0 p-2 flex justify-end opacity-0 group-hover:opacity-100 transition">
            <div className="flex gap-2">
              <button
                onClick={() => setOpen(true)}
                className="px-2.5 py-1.5 text-xs rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/90 dark:bg-zinc-900/80 backdrop-blur hover:bg-white dark:hover:bg-zinc-800 shadow-sm"
                title="Replace image"
              >
                Replace
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 text-sm space-y-1.5">
        {/* Name (no label) */}
        <div className="font-medium text-zinc-800 dark:text-zinc-100 truncate">
          {board.board_name || "Untitled board"}
        </div>

        {/* Location */}
        <Row label="Location" value={board.location || "—"} />

        {/* Pixels */}
        <Row label="Pixels" value={pixelsText} />

        {/* Feet */}
        <Row label="Feet" value={feetText} />
      </div>

      {/* Replace side panel */}
      <Replacepanel
        open={open}
        onClose={() => setOpen(false)}
        board={board}
        orgId={orgId}
        onReplaced={(newPath) => {
          refreshSignedUrl(newPath);
          (board as any).hero_image_path = newPath;
        }}
      />
    </div>
  );
}

/* ---------- UI helpers ---------- */

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
