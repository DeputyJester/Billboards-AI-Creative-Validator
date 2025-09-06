import React, { useEffect, useState } from "react";

type Row = {
    id: string;
    event_kind: string | null;
    event: string | null;
    actor_email: string | null;
    actor_role: string | null;
    created_at: string;
    context: any | null;
};

export default function AuditTabDebug({ campaignId }: { campaignId: string }) {
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<Row[]>([]);
    const [err, setErr] = useState<string>("");

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                setErr("");
                const r = await fetch(`/api/debug-audit?campaignId=${encodeURIComponent(campaignId)}`);
                const j = await r.json();
                if (!j.ok) throw new Error(j.error || "Failed to load audit");
                // filter out completely empty events (your DB has one row with both null)
                const cleaned = (j.rows as Row[]).filter(
                    (x) => (x.event_kind && x.event_kind.trim()) || (x.event && x.event.trim())
                );
                setRows(cleaned);
            } catch (e: any) {
                setErr(e?.message || "Could not load audit");
            } finally {
                setLoading(false);
            }
        })();
    }, [campaignId]);

    if (loading) return <div className="p-4 text-sm text-zinc-600">Loading…</div>;
    if (err) return <div className="p-4 text-sm text-red-600">{err}</div>;
    if (!rows.length)
        return (
            <div className="p-4 text-sm text-zinc-600">
                No audit records. If you just created this, refresh once.
            </div>
        );

    return (
        <div className="p-4">
            <ul className="space-y-3">
                {rows.map((r) => {
                    const kind = r.event_kind || r.event || "event";
                    return (
                        <li
                            key={r.id}
                            className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-zinc-950"
                        >
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-medium">{kind}</div>
                                <div className="text-xs text-zinc-500">
                                    {new Date(r.created_at).toLocaleString()}
                                </div>
                            </div>
                            <div className="mt-1 text-xs text-zinc-600">
                                Role: <span className="font-medium">{r.actor_role || "—"}</span>{" "}
                                · Email: <span className="font-medium">{r.actor_email || "—"}</span>
                            </div>
                            {r.context && (
                                <pre className="mt-2 text-xs bg-zinc-50 dark:bg-zinc-900 p-2 rounded-lg overflow-auto">
                                    {JSON.stringify(r.context, null, 2)}
                                </pre>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
