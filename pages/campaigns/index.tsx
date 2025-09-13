// pages/campaigns/index.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/router";
import { createPortal } from "react-dom";
import supabase from "@/lib/supabaseclient";
import { useAuthGate } from "@/utils/useauthgate";
import AppShell from "@/components/layout/appshell";

type CampaignRow = {
    id: string;
    organization_id: string;
    name: string;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
};

function CampaignsIndexPage() {
    const { ready } = useAuthGate();
    const router = useRouter();

    const [orgId, setOrgId] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<CampaignRow[]>([]);
    const [q, setQ] = useState("");
    const [status, setStatus] = useState<string>("all");

    // Modal state
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Sync from URL (?campaign=...)
    useEffect(() => {
        if (!mounted) return;
        const id = typeof router.query.campaign === "string" ? router.query.campaign : null;
        if (id) {
            setSelectedId(id);
            setDetailOpen(true);
        } else {
            setDetailOpen(false);
            setSelectedId(null);
        }
    }, [mounted, router.query.campaign]);

    // load org
    useEffect(() => {
        if (!ready) return;
        (async () => {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { setLoading(false); return; }
            const { data: memberships } = await supabase
                .from("user_organizations")
                .select("organization_id")
                .eq("user_id", user.id);
            const currentOrgId = memberships?.[0]?.organization_id as string | undefined;
            if (!currentOrgId) { setLoading(false); return; }
            setOrgId(currentOrgId);
            setLoading(false);
        })();
    }, [ready]);

    // load campaigns
    useEffect(() => {
        if (!orgId) return;
        (async () => {
            setLoading(true);
            let query = supabase
                .from("campaigns")
                .select("id, organization_id, name, status, start_date, end_date, created_at")
                .eq("organization_id", orgId)
                .order("created_at", { ascending: false });

            // simple search by name
            const s = q.trim();
            if (s) {
                const esc = s.replace(/[%_]/g, "\\$&");
                query = query.ilike("name", `%${esc}%`);
            }

            if (status !== "all") {
                query = query.eq("status", status);
            }

            const { data, error } = await query;
            if (!error && data) setRows(data as CampaignRow[]);
            setLoading(false);
        })();
    }, [orgId, q, status]);

    const statusOptions = useMemo(() => {
        const set = new Set<string>();
        rows.forEach(r => { if (r.status) set.add(r.status); });
        const arr = Array.from(set).sort();
        return ["all", ...arr];
    }, [rows]);

    const openDetail = (id: string) => {
        // push ?campaign=ID (shallow so we keep filters)
        router.push(
            { pathname: "/campaigns", query: { ...router.query, campaign: id } },
            undefined,
            { shallow: true }
        );
    };

    const closeDetail = () => {
        const { campaign, ...rest } = router.query;
        router.push({ pathname: "/campaigns", query: { ...rest } }, undefined, { shallow: true });
    };

    const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, id: string) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetail(id);
        }
    };

    return (
        <div className="mx-auto max-w-7xl p-6 space-y-8">
            <div className="flex items-center justify-between gap-3">
                <h1 className="text-2xl font-semibold">Campaigns</h1>
            </div>

            <div className="flex flex-col md:flex-row gap-3 md:items-center">
                <input
                    className="w-full md:w-80 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    placeholder="Search by name…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />
                <select
                    className="w-full md:w-48 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                >
                    {statusOptions.map((s) => (
                        <option key={s} value={s}>
                            {s === "all" ? "All statuses" : s}
                        </option>
                    ))}
                </select>
                <div className="text-sm text-zinc-500">
                    {loading ? "Loading…" : `${rows.length} result${rows.length === 1 ? "" : "s"}`}
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-900">
                        <tr className="text-left">
                            <th className="px-4 py-2 font-medium">Name</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                            <th className="px-4 py-2 font-medium">Dates</th>
                            <th className="px-4 py-2 font-medium">Created</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {rows.map((r) => (
                            <tr
                                key={r.id}
                                tabIndex={0}
                                onClick={() => openDetail(r.id)}
                                onKeyDown={(e) => onRowKey(e, r.id)}
                                className="cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-900/20 focus:bg-blue-50/80 dark:focus:bg-blue-900/30 outline-none transition"
                                title="Open details"
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{r.name}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <StatusPill status={r.status || "draft"} />
                                </td>
                                <td className="px-4 py-3">
                                    {(r.start_date || "—")} → {(r.end_date || "—")}
                                </td>
                                <td className="px-4 py-3">{new Date(r.created_at).toLocaleDateString()}</td>
                            </tr>
                        ))}
                        {!loading && rows.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                                    No campaigns yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Detail modal */}
            {mounted && (
                <CampaignDetailModal
                    open={detailOpen}
                    id={selectedId}
                    onClose={closeDetail}
                />
            )}
        </div>
    );
}

function StatusPill({ status }: { status: string }) {
    const cls =
        status === "active"
            ? "border-emerald-600 text-emerald-700"
            : status === "paused"
                ? "border-amber-600 text-amber-700"
                : status === "completed"
                    ? "border-zinc-400 text-zinc-600"
                    : "border-blue-600 text-blue-700"; // draft / default
    return (
        <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{status}</span>
    );
}

/* ---------- Inline detail modal (read-only) ---------- */

type Campaign = {
    id: string;
    organization_id: string;
    customer_id: string;
    name: string;
    description: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
};

type Customer = {
    id: string;
    name: string | null;
    email: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
};

type Board = {
    id: string;
    board_name: string | null;
    location: string | null;
    spec_group: string | null;
    width_px: number | null;
    height_px: number | null;
    width_display: string | null;
    height_display: string | null;
};

type CreativeGroup = {
    id: string;
    group_key: string;
    label: string;
    width_px: number | null;
    height_px: number | null;
    status: string;
    created_at: string;
};

function CampaignDetailModal({
    open,
    id,
    onClose,
}: {
    open: boolean;
    id: string | null;
    onClose: () => void;
}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const [loading, setLoading] = useState(false);
    const [camp, setCamp] = useState<Campaign | null>(null);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [boards, setBoards] = useState<Board[]>([]);
    const [groups, setGroups] = useState<CreativeGroup[]>([]);
    const [error, setError] = useState<string>("");

    useEffect(() => {
        if (!open || !id) {
            setCamp(null);
            setCustomer(null);
            setBoards([]);
            setGroups([]);
            setError("");
            return;
        }
        (async () => {
            try {
                setLoading(true);
                setError("");

                const { data: krow, error: kerr } = await supabase
                    .from("campaigns")
                    .select("*")
                    .eq("id", id)
                    .maybeSingle();
                if (kerr) throw kerr;
                if (!krow) {
                    setError("Campaign not found or access denied.");
                    setLoading(false);
                    return;
                }
                setCamp(krow as Campaign);

                const { data: crow } = await supabase
                    .from("customers")
                    .select("id, name, email, first_name, last_name, company")
                    .eq("id", (krow as any).customer_id)
                    .maybeSingle();
                if (crow) setCustomer(crow as Customer);

                const { data: cbs } = await supabase
                    .from("campaign_boards")
                    .select("board_id")
                    .eq("campaign_id", id);

                const boardIds = (cbs || []).map((r: any) => r.board_id).filter(Boolean);
                if (boardIds.length) {
                    const { data: brows } = await supabase
                        .from("boards")
                        .select("id, board_name, location, spec_group, width_px, height_px, width_display, height_display")
                        .in("id", boardIds);
                    if (brows) setBoards(brows as Board[]);
                } else {
                    setBoards([]);
                }

                const { data: gs } = await supabase
                    .from("campaign_creative_groups")
                    .select("id, group_key, label, width_px, height_px, status, created_at")
                    .eq("campaign_id", id)
                    .order("created_at", { ascending: false });
                if (gs) setGroups(gs as CreativeGroup[]);
            } catch (e: any) {
                setError(e?.message || "Failed to load campaign.");
            } finally {
                setLoading(false);
            }
        })();
    }, [open, id]);

    if (!mounted) return null;
    return createPortal(
        <>
            {/* backdrop with high z to cover headers */}
            <div
                className={`fixed inset-0 z-[1000] transition ${open ? "bg-black/40" : "pointer-events-none opacity-0"}`}
                onClick={onClose}
            />
            <div
                className={
                    "fixed inset-0 z-[1001] flex items-center justify-center p-4 " +
                    (open ? "" : "pointer-events-none opacity-0")
                }
                aria-hidden={!open}
            >
                <div className="w-full max-w-5xl max-h-[90vh] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-xl overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-between">
                        <div className="min-w-0">
                            <div className="text-xs text-zinc-500">Campaign</div>
                            <h3 className="text-base font-medium truncate">{camp?.name || "—"}</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            {camp?.id && (
                                <a
                                    href={`/campaigns/${camp.id}`}
                                    className="px-2.5 py-1.5 text-xs rounded-full border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                    Open full page →
                                </a>
                            )}
                            <button
                                onClick={onClose}
                                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm"
                            >
                                Close
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto">
                        {error && (
                            <div className="m-5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                                {error}
                            </div>
                        )}

                        {loading && !error && (
                            <div className="m-5 text-sm text-zinc-500">Loading…</div>
                        )}

                        {!loading && !error && camp && (
                            <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
                                {/* Left sections */}
                                <div className="space-y-6">
                                    {/* Details */}
                                    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                                        <header className="p-4 bg-zinc-50 dark:bg-zinc-900 text-sm font-medium">Details</header>
                                        <div className="p-4 text-sm space-y-2">
                                            <Row label="Customer" value={customerName(customer)} />
                                            <Row label="Email" value={customer?.email || "—"} />
                                            {customer?.company && <Row label="Company" value={customer.company} />}
                                            <Row label="Dates" value={`${camp.start_date || "—"} → ${camp.end_date || "—"}`} />
                                            {camp.description && (
                                                <div>
                                                    <div className="text-xs uppercase tracking-wide text-zinc-500">Notes</div>
                                                    <div className="mt-1 whitespace-pre-wrap">{camp.description}</div>
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {/* Creative groups */}
                                    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                                        <header className="p-4 bg-zinc-50 dark:bg-zinc-900 text-sm font-medium">
                                            Creative specs ({groups.length})
                                        </header>
                                        {groups.length === 0 ? (
                                            <div className="p-4 text-sm text-zinc-500">No creative groups.</div>
                                        ) : (
                                            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                                {groups.map((g) => (
                                                    <li key={g.id} className="p-4 flex items-center justify-between">
                                                        <div className="min-w-0">
                                                            <div className="font-medium">{g.label}</div>
                                                            <div className="text-xs text-zinc-500">
                                                                {g.width_px ?? "—"}×{g.height_px ?? "—"} px · key: {g.group_key}
                                                            </div>
                                                        </div>
                                                        <span className="text-xs px-2 py-0.5 rounded-full border border-blue-600 text-blue-700">
                                                            {g.status}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </section>

                                    {/* Boards */}
                                    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                                        <header className="p-4 bg-zinc-50 dark:bg-zinc-900 text-sm font-medium">
                                            Boards ({boards.length})
                                        </header>
                                        {boards.length === 0 ? (
                                            <div className="p-4 text-sm text-zinc-500">No boards attached.</div>
                                        ) : (
                                            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                                {boards.map((b) => (
                                                    <li key={b.id} className="p-4">
                                                        <div className="font-medium">{b.board_name || "Untitled board"}</div>
                                                        <div className="text-xs text-zinc-500">
                                                            {b.location || "—"} · {b.width_px ?? "?"}×{b.height_px ?? "?"} px · {fmtFeet(b.width_display)} × {fmtFeet(b.height_display)} · {b.spec_group || "—"}
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </section>
                                </div>

                                {/* Right: summary */}
                                <aside className="space-y-4">
                                    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
                                        <div className="text-sm font-medium mb-2">Summary</div>
                                        <div className="space-y-2 text-sm">
                                            <Row label="Status" value={camp.status || "draft"} />
                                            <Row label="Boards" value={String(boards.length)} />
                                            <Row label="Specs" value={String(groups.length)} />
                                            <Row label="Created" value={new Date(camp.created_at).toLocaleString()} />
                                        </div>
                                    </section>
                                </aside>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start gap-2">
            <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-zinc-500 mt-[2px]">
                {label}
            </span>
            <span className="text-zinc-800 dark:text-zinc-100">{value}</span>
        </div>
    );
}

function customerName(c?: Customer | null) {
    if (!c) return "—";
    const fn = (c.first_name || "").trim();
    const ln = (c.last_name || "").trim();
    const full = [fn, ln].filter(Boolean).join(" ");
    return full || c.name || c.email || "—";
}

function fmtFeet(x?: string | null): string {
    if (!x) return "—";
    const s = String(x).trim();
    if (/ft/i.test(s)) return s.replace(/\s*ft\s*$/i, " ft");
    if (/^\d+(\.\d+)?$/.test(s)) return `${s} ft`;
    return s;
}

/* ---- AppShell layout hook ---- */
(CampaignsIndexPage as any).getLayout = (page: ReactElement) => <AppShell>{page}</AppShell>;
export default CampaignsIndexPage;
