// page: /pages/contracts.tsx

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import supabase from "@/lib/supabaseclient"; // singleton client
import ContractWizard from "@/components/contracts/contractwizard";
import AppShell from "@/components/layout/appshell"; // 👈 added

type Row = {
    id: string;
    contract_number: string | null;
    name: string | null;
    status: string;
    subtotal: number | null;
    total: number | null;
    created_at: string;
};

export default function contracts_page() {
    const router = useRouter();

    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [orgId, setOrgId] = useState<string>("");

    const syncingRef = useRef(false);
    const mountedRef = useRef(false);

    async function load_list() {
        const { data, error } = await supabase
            .from("contracts")
            .select("id,contract_number,name,status,subtotal,total,created_at")
            .order("created_at", { ascending: false });
        if (error) {
            console.error(error);
            return;
        }
        setRows(data ?? []);
    }

    async function sync_and_refresh() {
        if (syncingRef.current) return;
        syncingRef.current = true;
        try {
            const r = await fetch("/api/contracts/sync-all", { method: "POST" });
            if (!r.ok) {
                const txt = await r.text().catch(() => "");
                console.warn("sync-all failed", r.status, txt);
            }
            await load_list();
        } finally {
            syncingRef.current = false;
        }
    }

    useEffect(() => {
        mountedRef.current = true;

        (async () => {
            setLoading(true);

            // get org for the "new contract" button (adjust if your schema differs)
            const { data: auth } = await supabase.auth.getUser();
            if (auth?.user?.id) {
                const { data: membership } = await supabase
                    .from("user_organizations")
                    .select("organization_id")
                    .eq("user_id", auth.user.id)
                    .maybeSingle();
                if (membership?.organization_id) setOrgId(membership.organization_id);
            }

            await sync_and_refresh();
            if (mountedRef.current) setLoading(false);
        })();

        // realtime: reflect DB changes immediately
        const channel = supabase
            .channel("contracts-realtime")
            .on(
                "postgres_changes",
                { event: "UPDATE", schema: "public", table: "contracts" },
                (payload) => {
                    const row = payload.new as any;
                    setRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, status: row.status } : r))
                    );
                }
            )
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "contracts" },
                (payload) => {
                    const row = payload.new as any;
                    setRows((prev) => [
                        {
                            id: row.id,
                            contract_number: row.contract_number,
                            name: row.name,
                            status: row.status,
                            subtotal: row.subtotal,
                            total: row.total,
                            created_at: row.created_at,
                        },
                        ...prev,
                    ]);
                }
            )
            .subscribe();

        // gentle polling while on list (useful on localhost where webhooks can't reach)
        const interval = setInterval(() => {
            if (document.visibilityState === "visible") sync_and_refresh();
        }, 15000);

        const onVis = () => {
            if (document.visibilityState === "visible") sync_and_refresh();
        };
        document.addEventListener("visibilitychange", onVis);

        return () => {
            mountedRef.current = false;
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVis);
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <main className="p-6 max-w-5xl mx-auto">
            <header className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">contracts</h1>
                    <p className="text-sm text-gray-500">list of contracts in your org.</p>
                </div>
                <button
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
                    onClick={() => setOpen(true)}
                    disabled={!orgId}
                    title={orgId ? "create a new contract" : "no organization detected"}
                >
                    new contract
                </button>
            </header>

            {loading ? (
                <div className="text-sm text-gray-500">loading…</div>
            ) : rows.length === 0 ? (
                <div className="text-sm text-gray-500">no contracts yet.</div>
            ) : (
                <div className="overflow-x-auto rounded-xl border">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-2 text-left">contract #</th>
                                <th className="px-3 py-2 text-left">name</th>
                                <th className="px-3 py-2 text-left">status</th>
                                <th className="px-3 py-2 text-right">subtotal</th>
                                <th className="px-3 py-2 text-right">total</th>
                                <th className="px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-t">
                                    <td className="px-3 py-2 font-medium">{r.contract_number ?? "—"}</td>
                                    <td className="px-3 py-2">{r.name ?? "—"}</td>
                                    <td className="px-3 py-2">{r.status}</td>
                                    <td className="px-3 py-2 text-right">{fmtMoney(r.subtotal)}</td>
                                    <td className="px-3 py-2 text-right">{fmtMoney(r.total)}</td>
                                    <td className="px-3 py-2 text-right">
                                        <a href={`/contracts/${r.id}`} className="text-indigo-600 hover:underline">
                                            open
                                        </a>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {orgId && (
                <ContractWizard
                    open={open}
                    onClose={() => setOpen(false)}
                    organizationId={orgId}
                    onCreated={(id) => router.push(`/contracts/${id}`)}
                />
            )}
        </main>
    );
}

function fmtMoney(n?: number | null) {
    if (typeof n !== "number") return "—";
    return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// 👇 add this to render the sidebar for this page, using your existing _app.js pattern
// @ts-ignore
contracts_page.getLayout = function getLayout(page) {
    return <AppShell>{page}</AppShell>;
};
