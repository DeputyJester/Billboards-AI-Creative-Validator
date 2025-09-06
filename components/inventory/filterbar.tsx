import React, { useEffect, useMemo, useRef, useState } from "react";

export type filterstate = {
  search?: string;
  locations: string[];
  groups: string[];
  pixelkeys: string[];
  minwidthpx?: number;
  maxwidthpx?: number;
  minheightpx?: number;
  maxheightpx?: number;
  grouped: boolean;
};

export type filteroptions = {
  locations: string[];
  groups: string[];
  pixelkeys: string[];
};

type MenuKey = "loc" | "grp" | "px" | "more" | null;

export default function Filterbar({
  value,
  options,
  onChange,
  resultsCount,
}: {
  value: filterstate;
  options: filteroptions;
  onChange: (next: filterstate) => void;
  resultsCount?: number;
}) {
  // single source of truth for which menu is open
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const update = (patch: Partial<filterstate>) => onChange({ ...value, ...patch });

  // close on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const toggleItem = (key: keyof filterstate, item: string) => {
    const arr = (value[key] as string[]) || [];
    const next = arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
    onChange({ ...value, [key]: next } as filterstate);
  };

  const hasActive =
    !!value.search ||
    value.locations.length > 0 ||
    value.groups.length > 0 ||
    value.pixelkeys.length > 0 ||
    value.minwidthpx != null ||
    value.maxwidthpx != null ||
    value.minheightpx != null ||
    value.maxheightpx != null ||
    value.grouped === false;

  const chips = useMemo(() => {
    const list: { label: string; onClear: () => void }[] = [];
    if (value.search) list.push({ label: `Search: ${value.search}`, onClear: () => update({ search: "" }) });
    value.locations.forEach((loc) => list.push({ label: `Location: ${loc}`, onClear: () => toggleItem("locations", loc) }));
    value.groups.forEach((g) => list.push({ label: `Group: ${g}`, onClear: () => toggleItem("groups", g) }));
    value.pixelkeys.forEach((p) => list.push({ label: `Pixels: ${p}`, onClear: () => toggleItem("pixelkeys", p) }));
    if (value.minwidthpx != null) list.push({ label: `Min W: ${value.minwidthpx}px`, onClear: () => update({ minwidthpx: undefined }) });
    if (value.maxwidthpx != null) list.push({ label: `Max W: ${value.maxwidthpx}px`, onClear: () => update({ maxwidthpx: undefined }) });
    if (value.minheightpx != null) list.push({ label: `Min H: ${value.minheightpx}px`, onClear: () => update({ minheightpx: undefined }) });
    if (value.maxheightpx != null) list.push({ label: `Max H: ${value.maxheightpx}px`, onClear: () => update({ maxheightpx: undefined }) });
    if (value.grouped === false) list.push({ label: "Grouping: Off", onClear: () => update({ grouped: true }) });
    return list;
  }, [value]);

  const clearAll = () =>
    onChange({
      ...value,
      search: "",
      locations: [],
      groups: [],
      pixelkeys: [],
      minwidthpx: undefined,
      maxwidthpx: undefined,
      minheightpx: undefined,
      maxheightpx: undefined,
      grouped: true,
    });

  return (
    <div ref={wrapRef} className="w-full space-y-2 relative z-20">
      {/* Toolbar */}
      <div
        className="
          w-full bg-amber-50/95 dark:bg-amber-900/20
          border border-amber-200 dark:border-amber-800
          rounded-2xl p-3 shadow-sm backdrop-blur
        "
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl flex-1 min-w-[220px]">
            <span className="text-zinc-500">🔎</span>
            <input
              type="text"
              className="w-full bg-transparent outline-none text-sm placeholder:text-zinc-400"
              placeholder="Search boards (name or location)…"
              value={value.search || ""}
              onChange={(e) => update({ search: e.target.value })}
            />
          </div>

          {/* Multi-selects */}
          <Dropdown
            label="Location"
            open={openMenu === "loc"}
            setOpen={(v) => setOpenMenu(v ? "loc" : null)}
            items={options.locations}
            selected={value.locations}
            onToggle={(s) => toggleItem("locations", s)}
          />
          <Dropdown
            label="Group"
            open={openMenu === "grp"}
            setOpen={(v) => setOpenMenu(v ? "grp" : null)}
            items={options.groups}
            selected={value.groups}
            onToggle={(s) => toggleItem("groups", s)}
          />
          <Dropdown
            label="Pixels"
            open={openMenu === "px"}
            setOpen={(v) => setOpenMenu(v ? "px" : null)}
            items={options.pixelkeys}
            selected={value.pixelkeys}
            onToggle={(s) => toggleItem("pixelkeys", s)}
          />

          {/* More filters (ranges only) */}
          <Popover
            label="Filters"
            open={openMenu === "more"}
            setOpen={(v) => setOpenMenu(v ? "more" : null)}
          >
            <div className="p-3 w-72 space-y-3">
              <Range label="Min W (px)" value={value.minwidthpx} placeholder="e.g. 1080" onChange={(n) => update({ minwidthpx: n })} />
              <Range label="Max W (px)" value={value.maxwidthpx} placeholder="e.g. 3840" onChange={(n) => update({ maxwidthpx: n })} />
              <Range label="Min H (px)" value={value.minheightpx} placeholder="e.g. 1080" onChange={(n) => update({ minheightpx: n })} />
              <Range label="Max H (px)" value={value.maxheightpx} placeholder="e.g. 2160" onChange={(n) => update({ maxheightpx: n })} />
            </div>
          </Popover>

          {/* Group Boards (prominent blue slider) */}
          <button
            onClick={() => update({ grouped: !value.grouped })}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-full border border-blue-600 bg-white dark:bg-zinc-950 hover:bg-blue-50 text-sm"
            title="Toggle grouping"
          >
            <span className="text-blue-700">Group Boards</span>
            <span className={"relative inline-flex w-10 h-5 rounded-full transition " + (value.grouped ? "bg-blue-600" : "bg-zinc-300")}>
              <span
                className={
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform " +
                  (value.grouped ? "translate-x-5" : "translate-x-0")
                }
              />
            </span>
          </button>

          {/* Count + Clear (blue) */}
          <div className="flex items-center gap-2">
            {typeof resultsCount === "number" && (
              <span className="hidden sm:inline text-xs text-zinc-500">
                {resultsCount} result{resultsCount === 1 ? "" : "s"}
              </span>
            )}
            <button
              onClick={clearAll}
              disabled={!hasActive}
              className={
                "px-3 py-2 text-sm rounded-full border " +
                (hasActive
                  ? "border-blue-600 bg-blue-600 text-white hover:opacity-90"
                  : "border-blue-300 text-blue-300 cursor-not-allowed")
              }
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Active chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <button
              key={i}
              onClick={c.onClear}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              title="Remove filter"
            >
              <span>{c.label}</span>
              <span className="text-zinc-400">✕</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- subcomponents ---------- */

function Dropdown({
  label,
  open,
  setOpen,
  items,
  selected,
  onToggle,
}: {
  label: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  items: string[];
  selected: string[];
  onToggle: (val: string) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 min-w-[120px] text-left"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="truncate">{label}</span>
          <span className="text-zinc-400">▾</span>
        </div>
      </button>
      {open && (
        <div className="absolute z-[80] mt-2 w-64 max-h-64 overflow-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-2">
          {items.length === 0 ? (
            <div className="text-sm text-zinc-500 px-2 py-1">No options</div>
          ) : (
            items.map((it) => {
              const active = selected.includes(it);
              return (
                <button
                  key={it}
                  onClick={() => onToggle(it)}
                  className={
                    "w-full text-left px-2 py-1.5 rounded-lg text-sm flex items-center justify-between " +
                    (active ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200" : "hover:bg-zinc-100 dark:hover:bg-zinc-900")
                  }
                >
                  <span className="truncate">{it}</span>
                  {active && <span className="text-blue-600">●</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function Popover({
  label,
  open,
  setOpen,
  children,
}: {
  label: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3 py-2 text-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        <div className="flex items-center justify-between gap-3 min-w-[110px]">
          <span>{label}</span>
          <span className="text-zinc-400">▾</span>
        </div>
      </button>
      {open && (
        <div className="absolute z-[80] mt-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg">
          {children}
        </div>
      )}
    </div>
  );
}

function Range({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value?: number;
  placeholder?: string;
  onChange: (n: number | undefined) => void;
}) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
      <div className="text-xs text-zinc-500">
        <div className="font-medium text-zinc-700 dark:text-zinc-200">
          {label.split(" ")[0]} <span className="lowercase">{label.split(" ").slice(1).join(" ")}</span>
        </div>
      </div>
      <input
        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-sm"
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        placeholder={placeholder}
      />
    </div>
  );
}
