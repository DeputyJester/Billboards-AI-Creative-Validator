// page: /pages/contracts/[id].tsx
// note: file stays all-lowercase per your convention; component stays PascalCase (React requirement)

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";

// if you prefer your shared singleton, swap this for: import supabase from "@/lib/supabaseclient";
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Contract = {
    id: string;
    organization_id: string;
    contract_number: string | null;
    name: string | null;
    description: string | null;
    status: string;
    subtotal: number | null;
    tax: number | null;
    total: number | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
};

type Item = {
    id: string;
    description: string | null;
    market: string | null;
    format: string | null;
    width_display: string | null;
    height_display: string | null;
    face_direction: string | null;
    geopath_id: string | null;
    qty: number | null;
    unit_price: number | null;
    copy_changes: number | null;
    cycles: number | null;
    cycle_start: string | null;
    cycle_end: string | null;
};

type Signer = {
    role: "staff" | "client";
    name: string | null;
    email: string | null;
    token?: string | null;
    documenso_signing_token?: string | null;
};

export default function ContractDetailPage() {
    const router = useRouter();
    const { id } = router.query;
    const idStr = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

    const [c, setC] = useState<Contract | null>(null);
    const [items, setItems] = useState<Item[]>([]);
    const [signers, setSigners] = useState<Signer[]>([]);
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);

    // load header + items + signers
    useEffect(() => {
        if (!idStr) return;
        let cancelled = false;

        async function load() {
            setLoading(true);
            const [h, li, sg] = await Promise.all([
                supabase.from("contracts").select("*").eq("id", idStr).maybeSingle(),
                supabase.from("contract_items").select("*").eq("contract_id", idStr),
                supabase
                    .from("contract_signers")
                    .select("role,name,email,token,documenso_signing_token")
                    .eq("contract_id", idStr),
            ]);

            if (!cancelled) {
                setC(h.data ?? null);
                setItems(li.data ?? []);
                setSigners((sg.data ?? []) as Signer[]);
                setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [idStr]);

    async function refreshSigners() {
        if (!idStr) return;
        const { data } = await supabase
            .from("contract_signers")
            .select("role,name,email,token,documenso_signing_token")
            .eq("contract_id", idStr);
        setSigners((data ?? []) as Signer[]);
    }

    // prepare -> send, then refresh tokens (no redirects)
    async function onSend() {
        if (!c || !idStr) return;
        setSending(true);
        try {
            const r1 = await fetch(`/api/contracts/${idStr}/prepare`, { method: "POST" });
            if (!r1.ok) throw new Error((await r1.text()) || "prepare failed");

            const r2 = await fetch(`/api/contracts/${idStr}/send`, { method: "POST" });
            if (!r2.ok) throw new Error((await r2.text()) || "send failed");

            await refreshSigners();
            alert("contract sent. you can now copy the client sign link from the signers list.");
        } catch (e: any) {
            alert(e?.message || "failed to send for signature.");
        } finally {
            setSending(false);
        }
    }

    function getClientToken(): string | null {
        const client = signers.find((s) => s.role === "client");
        if (!client) return null;
        return client.documenso_signing_token || client.token || null;
    }

    async function copyClientLink() {
        const tok = getClientToken();
        if (!tok) {
            alert("no client signer token yet. click 'send for signature' first, then try again.");
            return;
        }
        const url = `${window.location.origin}/contracts/token?token=${encodeURIComponent(tok)}`;
        await navigator.clipboard.writeText(url);
        alert("client sign link copied to clipboard.");
    }

    // polling while not completed (dev fallback to webhooks)
    useEffect(() => {
        if (!idStr) return;
        if (!c || c.status === "completed") return;

        let cancelled = false;
        let tries = 0;
        const maxTries = 60; // ~5 minutes
        let timer: ReturnType<typeof setTimeout> | undefined;

        const tick = async () => {
            if (cancelled) return;
            tries++;

            let docStatus = "";
            try {
                const rSync = await fetch(`/api/contracts/${idStr}/sync-status`, { method: "POST" });
                if (rSync.ok) {
                    const j = (await rSync.json().catch(() => ({}))) as any;
                    docStatus = String(j.documenso_status || j.status || "").toUpperCase();
                }
            } catch {
                // ignore
            }

            if (!docStatus) {
                try {
                    const r = await fetch(`/api/contracts/${idStr}/doc-status`);
                    if (r.ok) {
                        const j = (await r.json()) as any;
                        docStatus = String(j.status || "").toUpperCase();
                    }
                } catch {
                    // ignore
                }
            }

            if (docStatus === "COMPLETED") {
                setC((prev) => (prev ? { ...prev, status: "completed" } : prev));
                return; // stop
            }

            if (!cancelled && tries < maxTries) {
                timer = setTimeout(tick, 5000);
            }
        };

        timer = setTimeout(tick, 5000);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [idStr, c?.status]);

    return (
        <main className="p-6 max-w-5xl mx-auto">
            {loading ? (
                <div className="text-sm text-gray-500">loading…</div>
            ) : !c ? (
                <div className="text-sm text-red-600">contract not found.</div>
            ) : (
                <>
                    <header className="flex items-start justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-semibold">
                                {c.contract_number ?? "contract"} {c.name ? `– ${c.name}` : ""}
                            </h1>
                            <p className="text-sm text-gray-500">
                                status: <span className="font-medium">{c.status}</span>
                                {c.start_date && c.end_date ? ` · ${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}` : ""}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* creator-only actions; hidden once completed */}
                            {c.status !== "completed" && (
                                <>
                                    <button
                                        className="px-3 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
                                        onClick={copyClientLink}
                                        disabled={!getClientToken()}
                                        title={
                                            getClientToken()
                                                ? "copy the client's unique signing link"
                                                : "send first to generate the link"
                                        }
                                    >
                                        copy client sign link
                                    </button>
                                    <button
                                        className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
                                        onClick={onSend}
                                        disabled={sending}
                                    >
                                        {sending ? "sending…" : "send for signature"}
                                    </button>
                                </>
                            )}
                            {/* after completion we do not show any actions (you chose to remove the download button) */}
                        </div>
                    </header>

                    <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Stat label="subtotal" value={fmtMoney(c.subtotal)} />
                        <Stat label="tax" value={fmtMoney(c.tax)} />
                        <Stat label="total" value={fmtMoney(c.total)} />
                    </section>

                    <section className="mb-8">
                        <h2 className="text-lg font-semibold mb-3">line items</h2>
                        <div className="overflow-x-auto rounded-xl border">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left">description</th>
                                        <th className="px-3 py-2 text-left">market</th>
                                        <th className="px-3 py-2 text-left">format</th>
                                        <th className="px-3 py-2 text-left">size</th>
                                        <th className="px-3 py-2 text-left">face</th>
                                        <th className="px-3 py-2 text-left">geopath</th>
                                        <th className="px-3 py-2 text-right">qty</th>
                                        <th className="px-3 py-2 text-right">unit</th>
                                        <th className="px-3 py-2 text-right">price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((it) => (
                                        <tr key={it.id} className="border-t">
                                            <td className="px-3 py-2">{it.description}</td>
                                            <td className="px-3 py-2">{it.market}</td>
                                            <td className="px-3 py-2">{it.format}</td>
                                            <td className="px-3 py-2">
                                                {it.width_display && it.height_display
                                                    ? `${it.width_display} × ${it.height_display}`
                                                    : "—"}
                                            </td>
                                            <td className="px-3 py-2">{it.face_direction ?? "—"}</td>
                                            <td className="px-3 py-2">{it.geopath_id ?? "—"}</td>
                                            <td className="px-3 py-2 text-right">{it.qty ?? 1}</td>
                                            <td className="px-3 py-2 text-right">{it.cycles ?? "—"}</td>
                                            <td className="px-3 py-2 text-right">{fmtMoney(it.unit_price)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold mb-3">signers</h2>
                        <ul className="space-y-2">
                            {signers.map((s, i) => {
                                const tok = s.documenso_signing_token || s.token || null;
                                return (
                                    <li key={i} className="border rounded-lg p-3 flex items-center justify-between">
                                        <div>
                                            <div className="font-medium">{s.name || s.email || s.role}</div>
                                            <div className="text-xs text-gray-500">{s.role}</div>
                                        </div>
                                        {s.role === "client" && tok && c?.status !== "completed" && (
                                            <a
                                                className="text-indigo-600 hover:underline text-sm"
                                                href={`/contracts/token?token=${encodeURIComponent(tok)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                open signer link
                                            </a>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                </>
            )}
        </main>
    );
}

function Stat(props: { label: string; value: string }) {
    const { label, value } = props;
    return (
        <div className="rounded-xl border p-4">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-lg font-semibold">{value}</div>
        </div>
    );
}

function fmtMoney(n?: number | null) {
    if (typeof n !== "number") return "—";
    return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtDate(s?: string | null) {
    if (!s) return "";
    const d = new Date(s);
    return d.toLocaleDateString();
}
