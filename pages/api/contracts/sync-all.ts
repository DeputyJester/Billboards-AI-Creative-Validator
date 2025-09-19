// file: pages/api/contracts/sync-all.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";

/**
 * Normalizes Documenso base:
 * - If DOCUMENSO_API_URL already includes /api/, we use it as-is.
 * - Otherwise we append /api/v1.
 */
const rawBase =
    process.env.DOCUMENSO_API_URL ||
    process.env.DOCUMENSO_BASE_URL ||
    "";
const BASE = rawBase.replace(/\/+$/, "");
const API_ROOT = /\/api\//i.test(BASE) ? BASE : `${BASE}/api/v1`;

const API_KEY =
    process.env.DOCUMENSO_API_KEY ||
    process.env.OCUMENSO_API_KEY || // earlier typo safety
    "";

// --- helpers ---------------------------------------------------------------

function dFetch(path: string, init?: RequestInit) {
    const url = `${API_ROOT}${path.startsWith("/") ? path : `/${path}`}`;
    return fetch(url, {
        ...init,
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${API_KEY}`,
            ...(init?.headers || {}),
        },
    });
}

// --- handler ---------------------------------------------------------------

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST")
        return res.status(405).json({ error: "Method not allowed" });

    // 1) ENV sanity (don’t leak secrets)
    const haveUrl =
        !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
    const haveSrv = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Optional "diagnose=1" shows extra info and runs a DB ping
    const diagnose = req.query.diagnose === "1";

    if (!haveUrl || !haveSrv) {
        const msg = "Missing Supabase env";
        if (diagnose) {
            return res.status(500).json({
                ok: false,
                where: "env",
                message: msg,
                haveSupabaseUrl: haveUrl,
                haveServiceRoleKey: haveSrv,
            });
        }
        return res.status(500).json({ error: msg });
    }

    // 2) Quick DB ping (so we see real supabase error details in Vercel)
    try {
        const ping = await supabaseAdmin
            .from("contracts")
            .select("id")
            .limit(1);
        if (ping.error) {
            const { message, details, hint, code } = ping.error;
            if (diagnose) {
                return res.status(500).json({
                    ok: false,
                    where: "supabase.ping",
                    error: { code, message, details, hint },
                });
            }
            return res.status(500).json({ error: "db query failed" });
        }

        if (diagnose) {
            return res.status(200).json({
                ok: true,
                where: "supabase.ping",
                note: "DB reachable with service role key.",
            });
        }
    } catch (e: any) {
        if (diagnose) {
            return res.status(500).json({
                ok: false,
                where: "supabase.ping.throw",
                error: e?.message || String(e),
            });
        }
        return res.status(500).json({ error: "db query failed" });
    }

    // 3) Documenso envs (don’t block, but helpful to surface)
    if (!API_ROOT || !API_KEY) {
        // We still proceed; this endpoint’s main job is syncing *from* Documenso.
        console.error("sync-all: missing DOCUMENSO envs", {
            hasApiRoot: !!API_ROOT,
            hasApiKey: !!API_KEY,
        });
    }

    // 4) Real work: fetch docs that aren’t completed and sync their status
    try {
        const { data: rows, error } = await supabaseAdmin
            .from("contracts")
            .select("id, status, documenso_status, documenso_document_id")
            .not("documenso_document_id", "is", null)
            .neq("status", "completed")
            .limit(250);

        if (error) {
            const { message, details, hint, code } = error;
            return res
                .status(500)
                .json({ error: "db query failed", supabase: { code, message, details, hint } });
        }

        if (!rows || rows.length === 0) {
            return res.status(200).json({ ok: true, updated: [], count: 0 });
        }

        const updatedIds: string[] = [];

        for (const r of rows) {
            const docId = (r as any).documenso_document_id as number | null;
            if (!docId) continue;

            const resp = await dFetch(`/documents/${docId}`, { method: "GET" });
            if (!resp.ok) {
                // log but don’t fail the whole batch
                console.error("documenso fetch failed", docId, resp.status);
                continue;
            }
            const json = await resp.json().catch(() => ({}));
            const status = String(
                json?.status || json?.document?.status || ""
            ).toUpperCase();

            if (!status) continue;

            if (status === "COMPLETED") {
                const now = new Date().toISOString();
                const { error: upErr } = await supabaseAdmin
                    .from("contracts")
                    .update({
                        status: "completed",
                        documenso_status: "COMPLETED",
                        completed_at: now,
                    })
                    .eq("id", (r as any).id);
                if (!upErr) updatedIds.push((r as any).id);
            } else if (
                status !== String((r as any).documenso_status || "").toUpperCase()
            ) {
                const { error: upErr } = await supabaseAdmin
                    .from("contracts")
                    .update({ documenso_status: status })
                    .eq("id", (r as any).id);
                if (!upErr) updatedIds.push((r as any).id);
            }
        }

        return res
            .status(200)
            .json({ ok: true, updated: updatedIds, count: updatedIds.length });
    } catch (e: any) {
        console.error("sync-all unexpected error:", e);
        return res.status(500).json({ error: "Internal error", detail: e?.message || String(e) });
    }
}
