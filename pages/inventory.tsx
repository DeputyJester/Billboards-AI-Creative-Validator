// pages/inventory.tsx
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient";
import BoardTile from "@/components/inventory/boardtile";
import { useAuthGate } from "@/utils/useauthgate";
import Filterbar, { filterstate, filteroptions } from "@/components/inventory/filterbar";
import { usequerystate } from "@/hooks/usequerystate";
import StartCampaignModal from "@/components/inventory/startcampaignmodal";
import AddBoardModal from "@/components/inventory/addboardmodal";

type BoardRow = {
    id: string;
    board_name: string | null;
    location: string | null;
    spec_group: string | null;
    width_display: string | null;
    height_display: string | null;
    width_px: number | null;
    height_px: number | null;
    hero_image_path: string | null;
    organization_id?: string;
};

// Helper to keep local list sorted like your fetch (group, then name)
function compareBoards(a: BoardRow, b: BoardRow) {
    const ag = (a.spec_group || "ungrouped").toLowerCase();
    const bg = (b.spec_group || "ungrouped").toLowerCase();
    if (ag !== bg) return ag.localeCompare(bg);
    const an = (a.board_name || "").toLowerCase();
    const bn = (b.board_name || "").toLowerCase();
    return an.localeCompare(bn);
}

export default function InventoryPage() {
    const { ready } = useAuthGate();
    const router = useRouter();

    const [orgId, setOrgId] = useState<string>("");
    const [boards, setBoards] = useState<BoardRow[]>([]);
    const [loading, setLoading] = useState(true);

    // Add-board modal state
    const [addOpen, setAddOpen] = useState(false);

    // ---- Filter state (URL-synced) ----
    const { state: filters, setstate: setfilters } = usequerystate<filterstate>(
        {
            search: "",
            locations: [],
            groups: [],
            pixelkeys: [],
            minwidthpx: undefined,
            maxwidthpx: undefined,
            minheightpx: undefined,
            maxheightpx: undefined,
            grouped: true,
        },
        {
            parammap: (p) => ({
                search: p.get("q") || "",
                locations: p.getAll("location"),
                groups: p.getAll("groupname"),
                pixelkeys: p.getAll("pixel"),
                minwidthpx: p.get("minw") ? Number(p.get("minw")) : undefined,
                maxwidthpx: p.get("maxw") ? Number(p.get("maxw")) : undefined,
                minheightpx: p.get("minh") ? Number(p.get("minh")) : undefined,
                maxheightpx: p.get("maxh") ? Number(p.get("maxh")) : undefined,
                grouped: p.get("group") !== "off",
            }),
        }
    );

    // ---- Selection mode ----
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showStartCampaign, setShowStartCampaign] = useState(false);

    const toggleSelected = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const clearSelected = () => setSelected(new Set());

    // ---- Initial auth/org ----
    useEffect(() => {
        if (!ready) return;
        (async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }
            let role: string | null = null;
            const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
            if (prof?.role) role = prof.role as string;
            else {
                const { data: urow } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
                role = (urow?.role as string | null) ?? null;
            }
            if (role === "client") {
                router.replace("/dashboard");
                return;
            }
            const { data: memberships } = await supabase
                .from("user_organizations")
                .select("organization_id")
                .eq("user_id", user.id);
            const currentOrgId = memberships?.[0]?.organization_id as string | undefined;
            if (!currentOrgId) { setLoading(false); return; }
            setOrgId(currentOrgId);
            setLoading(false);
        })();
    }, [ready, router]);

    // ---- Fetch boards (server-side filtering) ----
    useEffect(() => {
        if (!orgId) return;
        (async () => {
            setLoading(true);

            let query = supabase
                .from("boards")
                .select(
                    "id, board_name, location, spec_group, width_display, height_display, width_px, height_px, hero_image_path",
                    { count: "planned" }
                )
                .eq("organization_id", orgId);

            // Search (board_name OR location)
            const q = (filters.search || "").trim();
            if (q) {
                const esc = q.replace(/[%_]/g, "\\$&");
                query = query.or(`board_name.ilike.%${esc}%,location.ilike.%${esc}%`);
            }

            // Multi-selects
            if (filters.locations.length) query = query.in("location", filters.locations);
            if (filters.groups.length) query = query.in("spec_group", filters.groups);

            // Pixels as OR of (w,h) pairs
            if (filters.pixelkeys.length) {
                const pairs = filters.pixelkeys
                    .map((s) => s.trim())
                    .map((s) => {
                        const [w, h] = s.split("x").map((n) => Number(n));
                        if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
                        return `and(width_px.eq.${w},height_px.eq.${h})`;
                    })
                    .filter(Boolean) as string[];
                if (pairs.length) query = query.or(pairs.join(","));
            }

            // Ranges
            if (typeof filters.minwidthpx === "number") query = query.gte("width_px", filters.minwidthpx);
            if (typeof filters.maxwidthpx === "number") query = query.lte("width_px", filters.maxwidthpx);
            if (typeof filters.minheightpx === "number") query = query.gte("height_px", filters.minheightpx);
            if (typeof filters.maxheightpx === "number") query = query.lte("height_px", filters.maxheightpx);

            // Order stable
            query = query.order("spec_group", { ascending: true }).order("board_name", { ascending: true });

            const { data, error } = await query;
            if (!error && data) setBoards(data as BoardRow[]);
            setLoading(false);
        })();
    }, [orgId, filters]);

    const options: filteroptions = useMemo(() => {
        const locs = new Set<string>(), grps = new Set<string>(), px = new Set<string>();
        boards.forEach((b) => {
            if (b?.location) locs.add(b.location);
            if (b?.spec_group) grps.add(b.spec_group);
            if (b?.width_px && b?.height_px) px.add(`${b.width_px}x${b.height_px}`);
        });
        return { locations: [...locs].sort(), groups: [...grps].sort(), pixelkeys: [...px].sort() };
    }, [boards]);

    const grouped = useMemo(() => {
        const map = new Map<string, BoardRow[]>();
        for (const b of boards) {
            const key = b.spec_group || "ungrouped";
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(b);
        }
        return [...map.entries()];
    }, [boards]);

    const selectedCount = selected.size;

    if (!ready) return <div className="p-6 text-sm text-neutral-500">Checking session…</div>;

    return (
        <div className="mx-auto max-w-7xl p-6 space-y-10">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Inventory</h1>

                <div className="flex items-center gap-2">
                    {/* Add board */}
                    <button
                        onClick={() => setAddOpen(true)}
                        className="px-3 py-1.5 rounded-full border border-blue-600 bg-blue-600 text-white text-sm shadow"
                    >
                        + Add board
                    </button>

                    <button
                        onClick={() => {
                            setSelectMode((v) => !v);
                            clearSelected();
                        }}
                        className={
                            "px-3 py-1.5 rounded-full border text-sm " +
                            (selectMode
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-blue-600 text-blue-600 hover:bg-blue-50")
                        }
                    >
                        {selectMode ? "Done selecting" : "Select boards"}
                    </button>
                </div>
            </div>

            <Filterbar value={filters} options={options} onChange={setfilters} resultsCount={boards.length} />

            {loading && <p className="text-sm text-neutral-500">Loading…</p>}

            {!loading && (filters.grouped ? (
                grouped.map(([group, items]) => (
                    <section key={group} className="space-y-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-medium">{group}</h2>
                            <span className="text-xs text-neutral-500">{items.length} boards</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                            {items.map((b) => (
                                <BoardTile
                                    key={b.id}
                                    board={b}
                                    selectMode={selectMode}
                                    selected={selected.has(b.id)}
                                    onToggleSelect={() => toggleSelected(b.id)}
                                />
                            ))}
                        </div>
                    </section>
                ))
            ) : (
                <section className="space-y-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-medium">All boards</h2>
                        <span className="text-xs text-neutral-500">{boards.length} boards</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {boards.map((b) => (
                            <BoardTile
                                key={b.id}
                                board={b}
                                selectMode={selectMode}
                                selected={selected.has(b.id)}
                                onToggleSelect={() => toggleSelected(b.id)}
                            />
                        ))}
                    </div>
                </section>
            ))}

            {selectMode && (
                <div className="fixed inset-x-0 bottom-0 z-40">
                    <div className="mx-auto max-w-7xl px-6 pb-6">
                        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/95 dark:bg-zinc-900/95 shadow-xl backdrop-blur p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="inline-flex items-center justify-center px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-600 text-white">
                                    {selectedCount}
                                </span>
                                <span className="text-sm text-zinc-800 dark:text-zinc-100">
                                    {selectedCount === 1 ? "board selected" : "boards selected"}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={clearSelected}
                                    className="px-3 py-1.5 rounded-full border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm"
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={() => setShowStartCampaign(true)}
                                    disabled={selectedCount === 0}
                                    className="px-3 py-1.5 rounded-full border border-blue-600 bg-blue-600 text-white disabled:opacity-50 text-sm shadow"
                                >
                                    Start campaign
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <StartCampaignModal
                open={showStartCampaign}
                boardIds={[...selected]}
                onClose={() => setShowStartCampaign(false)}
            />

            {/* Add-board modal */}
            <AddBoardModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onCreated={(row) => {
                    // Optimistically merge and keep ordering consistent with your fetch (group + name)
                    setBoards((cur) => {
                        const next = [row as BoardRow, ...cur];
                        next.sort(compareBoards);
                        return next;
                    });
                    // Do not close here; the modal shows a success overlay and lets the user Close or Add another.
                }}
            />
        </div>
    );
}
