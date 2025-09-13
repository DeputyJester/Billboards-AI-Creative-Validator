// pages/campaigns/[id].tsx
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient";
import AppShell from "@/components/layout/appshell";
import type { ReactElement } from "react";

/* ----------------------------- Types ----------------------------- */
type CampaignRow = {
    id: string;
    organization_id: string;
    customer_id?: string | null;
    name: string | null;
    description?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    status: string | null;
};

type CreativeRow = {
    id: string;
    status: string | null;
    file_name: string | null;
    mime_type: string | null;
    width_px: number | null;
    height_px: number | null;
    uploaded_at?: string | null;
    submitted_at?: string | null;
};

type AuditRow = {
    id: string;
    event: string | null;
    event_kind: string | null;
    actor_email: string | null;
    actor_role: string | null;
    created_at: string;
    context: any | null; // your column is named `context`
};

/* --------------------------- Page ------------------------------- */
function CampaignDetailPage() {
    const router = useRouter();
    const campaignId = typeof router.query.id === "string" ? router.query.id : "";

    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<"overview" | "audit">("overview");

    const [campaign, setCampaign] = useState<CampaignRow | null>(null);
    const [creatives, setCreatives] = useState<CreativeRow[]>([]);
    const [audit, setAudit] = useState<AuditRow[]>([]);
    const [err, setErr] = useState<string>("");

    // load
    useEffect(() => {
        if (!campaignId) return;
        (async () => {
            try {
                setLoading(true);
                setErr("");

                // Campaign
                const { data: camp, error: campErr } = await supabase
                    .from("campaigns")
                    .select(
                        "id, organization_id, customer_id, name, description, start_date, end_date, status"
                    )
                    .eq("id", campaignId)
                    .maybeSingle();

                if (campErr) throw campErr;
                setCampaign((camp || null) as CampaignRow | null);

                // Creatives — include uploaded + submitted
                const { data: cr, error: crErr } = await supabase
                    .from("campaign_creatives")
                    .select(
                        "id, status, file_name, mime_type, width_px, height_px, uploaded_at, submitted_at"
                    )
                    .eq("campaign_id", campaignId)
                    .in("status", ["uploaded", "submitted"]);
                if (crErr) throw crErr;
                setCreatives((cr || []) as CreativeRow[]);

                // Audit (note: column is `context`, not `meta`)
                const { data: au, error: auErr } = await supabase
                    .from("audit_events")
                    .select("id, event, event_kind, actor_email, actor_role, created_at, context")
                    .eq("campaign_id", campaignId)
                    .order("created_at", { ascending: false });
                if (auErr) {
                    console.warn("[audit] select warning", auErr);
                    setAudit([]);
                } else {
                    setAudit((au || []) as AuditRow[]);
                }
            } catch (e: any) {
                console.error(e);
                setErr(e?.message || "Failed to load campaign.");
            } finally {
                setLoading(false);
            }
        })();
    }, [campaignId]);

    const uploadedCount = useMemo(
        () => creatives.filter((c) => c.status === "uploaded" || c.status === "submitted").length,
        [creatives]
    );

    if (!campaignId) {
        return (
            <PageShell>
                <div className="p-6 text-sm text-zinc-600">Missing campaign id.</div>
            </PageShell>
        );
    }

    if (loading) {
        return (
            <PageShell>
                <div className="p-6 text-sm text-zinc-600">Loading…</div>
            </PageShell>
        );
    }

    if (err || !campaign) {
        return (
            <PageShell>
                <div className="p-6 text-sm text-red-600">
                    {err || "Campaign not found."}
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell>
            <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {campaign.name || "Untitled campaign"}
                        </h1>
                        <div className="text-xs text-zinc-500 mt-1">
                            {fmtDateRange(campaign.start_date, campaign.end_date)}
                        </div>
                    </div>
                    <StatusPill status={campaign.status || "pending"} />
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card title="Uploads (incl. submitted)">
                        <div className="text-xl font-semibold">{uploadedCount}</div>
                        <div className="text-xs text-zinc-500 mt-1">
                            Counting statuses: <code>uploaded</code>, <code>submitted</code>
                        </div>
                    </Card>
                    <Card title="Status">
                        <div className="text-xl font-semibold capitalize">
                            {campaign.status || "pending"}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                            Auto-bumped to “submitted” when client submits.
                        </div>
                    </Card>
                    <Card title="Customer">
                        <div className="text-sm text-zinc-700">
                            {campaign.customer_id ? campaign.customer_id : "—"}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                            TODO: show customer name/email here
                        </div>
                    </Card>
                </div>

                {/* Tabs */}
                <div className="border-b border-zinc-200 flex gap-2">
                    <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
                        Overview
                    </TabButton>
                    <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>
                        Audit
                    </TabButton>
                </div>

                {tab === "overview" && (
                    <div className="space-y-4">
                        <section className="rounded-xl border border-zinc-200 p-4">
                            <div className="text-sm font-medium mb-3">Creatives</div>
                            {creatives.length === 0 ? (
                                <div className="text-sm text-zinc-500">No uploads yet.</div>
                            ) : (
                                <ul className="divide-y divide-zinc-200">
                                    {creatives.map((c) => (
                                        <li key={c.id} className="py-2 flex items-center justify-between">
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium truncate">
                                                    {c.file_name || c.id}
                                                </div>
                                                <div className="text-xs text-zinc-500">
                                                    {c.mime_type || "—"} · {c.width_px ?? "—"}×{c.height_px ?? "—"} px
                                                </div>
                                            </div>
                                            <div className="text-xs text-zinc-600">
                                                {c.status === "submitted" ? (
                                                    <span className="text-emerald-700">
                                                        Submitted {fmtWhen(c.submitted_at)}
                                                    </span>
                                                ) : (
                                                    <span>Uploaded {fmtWhen(c.uploaded_at)}</span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                )}

                {tab === "audit" && (
                    <section className="rounded-xl border border-zinc-200 p-4">
                        <div className="text-sm font-medium mb-3">Audit trail</div>
                        {audit.length === 0 ? (
                            <div className="text-sm text-zinc-500">
                                No audit records. If you just submitted, refresh once; also verify RLS on{" "}
                                <code>audit_events</code>.
                            </div>
                        ) : (
                            <ul className="divide-y divide-zinc-200">
                                {audit.map((a) => (
                                    <li key={a.id} className="py-2">
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm">
                                                <span className="font-medium">
                                                    {a.event_kind || a.event || "event"}
                                                </span>{" "}
                                                {a.actor_email ? (
                                                    <span className="text-zinc-600">
                                                        by {a.actor_email}
                                                        {a.actor_role ? ` (${a.actor_role})` : ""}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="text-xs text-zinc-500">{fmtWhen(a.created_at)}</div>
                                        </div>
                                        {a.context && (
                                            <pre className="mt-1 text-xs bg-zinc-50 border border-zinc-200 rounded-lg p-2 overflow-x-auto">
                                                {JSON.stringify(a.context, null, 2)}
                                            </pre>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {/* If you created the debug component and want it visible too, uncomment: */}
                        {/* <AuditTabDebug campaignId={campaignId} /> */}
                    </section>
                )}
            </div>
        </PageShell>
    );
}

/* -------------------------- UI helpers -------------------------- */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-zinc-200 p-4">
            <div className="text-xs text-zinc-500">{title}</div>
            <div className="mt-1">{children}</div>
        </div>
    );
}

function StatusPill({ status }: { status: string }) {
    const cls =
        status === "submitted"
            ? "border-emerald-600 text-emerald-700 bg-emerald-50"
            : status === "active"
                ? "border-blue-600 text-blue-700 bg-blue-50"
                : "border-zinc-300 text-zinc-600 bg-zinc-50";
    return (
        <span className={`px-2.5 py-1 rounded-full text-xs border ${cls}`}>
            {status}
        </span>
    );
}

function TabButton({
    active,
    children,
    onClick,
}: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={
                "px-3 py-2 text-sm -mb-px border-b-2 " +
                (active
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-zinc-500 hover:text-zinc-700")
            }
        >
            {children}
        </button>
    );
}

function PageShell({ children }: { children: React.ReactNode }) {
    return <div className="min-h-screen bg-white">{children}</div>;
}

function fmtDateRange(a?: string | null, b?: string | null) {
    const f = (x?: string | null) => (x ? new Date(x).toLocaleDateString() : "—");
    return `${f(a)} → ${f(b)}`;
}
function fmtWhen(iso?: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString();
}

/* ------------------------- Attach layout ------------------------ */
(CampaignDetailPage as any).getLayout = (page: ReactElement) => (
    <AppShell>{page}</AppShell>
);

export default CampaignDetailPage;
