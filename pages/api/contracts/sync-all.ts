// pages/api/contracts/sync-all.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";

const BASE =
    process.env.DOCUMENSO_BASE_URL ||
    process.env.DOCUMENSO_API_URL ||
    "";
const API_KEY =
    process.env.DOCUMENSO_API_KEY ||
    process.env.OCUMENSO_API_KEY ||
    "";

function dFetch(path: string, init?: RequestInit) {
    const url = `${BASE.replace(/\/+$/, "")}${path}`;
    return fetch(url, {
        ...init,
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${API_KEY}`,
            ...(init?.headers || {}),
        },
    });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
    if (!BASE || !API_KEY) return res.status(500).json({ error: "missing documenso envs" });

    // Pull contracts that might still be in-flight
    const { data, error } = await supabaseAdmin
        .from("contracts")
        .select("id, status, documenso_status, documenso_document_id")
        .not("documenso_document_id", "is", null)
        .neq("status", "completed")
        .limit(200);

    if (error) return res.status(500).json({ error: "db query failed" });

    const results: any[] = [];
    for (const row of data ?? []) {
        try {
            const r = await dFetch(`/api/v1/documents/${row.documenso_document_id}`, { method: "GET" });
            if (!r.ok) {
                results.push({ id: row.id, error: "documenso fetch failed" });
                continue;
            }
            const j = await r.json();
            const docStatus: string = (j?.status || j?.documentStatus || "").toString().toUpperCase();

            const updates: any = { documenso_status: docStatus || null };
            if (docStatus === "COMPLETED" && row.status !== "completed") {
                updates.status = "completed";
                updates.completed_at = new Date().toISOString();
            }
            if (Object.keys(updates).length > 0) {
                await supabaseAdmin.from("contracts").update(updates).eq("id", row.id);
            }

            results.push({ id: row.id, docStatus });
        } catch (e) {
            results.push({ id: row.id, error: "exception" });
        }
    }

    return res.json({ ok: true, count: results.length, results });
}
