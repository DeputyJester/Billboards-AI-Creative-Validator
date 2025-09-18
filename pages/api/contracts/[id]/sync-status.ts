// PATH: pages/api/contracts/[id]/sync-status.ts
// PURPOSE: Pull the current Documenso status for a contract, persist it to Supabase,
//          and return the normalized status (so the UI and DB stay in sync).

import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";

// normalize Documenso base, with /api/v1 appended if needed
const RAW_BASE =
    process.env.DOCUMENSO_API_URL ||
    process.env.DOCUMENSO_BASE_URL ||
    "";
const BASE = RAW_BASE.replace(/\/+$/, "");
const API_ROOT = /\/api\//i.test(BASE) ? BASE : `${BASE}/api/v1`;

const API_KEY =
    process.env.DOCUMENSO_API_KEY ||
    process.env.OCUMENSO_API_KEY || // typo safety
    "";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST" && req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }
    if (!API_ROOT || !API_KEY) {
        return res.status(500).json({ error: "Missing Documenso env" });
    }

    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing id" });

    // get the contract to read the Documenso document id
    const { data: contract, error } = await supabaseAdmin
        .from("contracts")
        .select("id, status, documenso_document_id")
        .eq("id", id)
        .maybeSingle();

    if (error) return res.status(500).json({ error: "DB error" });
    const docId = (contract as any)?.documenso_document_id;
    if (!docId) return res.status(400).json({ error: "No documenso_document_id for this contract" });

    try {
        // pull current document from Documenso
        const r = await dFetch(`/documents/${docId}`, { method: "GET" });
        if (!r.ok) {
            return res.status(502).json({ error: "Documenso fetch failed", detail: await r.text() });
        }
        const j = await r.json();

        const statusRaw = (j?.status || j?.document?.status || "").toString();
        const statusUpper = statusRaw.toUpperCase();

        const completedAt = j?.completedAt || j?.document?.completedAt || null;
        const pdfUrl = j?.pdfUrl || j?.document?.pdfUrl || null;
        const certUrl = j?.certificateUrl || j?.document?.certificateUrl || null;

        // build the DB update
        const update: Record<string, any> = { documenso_status: statusUpper };
        if (statusUpper === "COMPLETED") {
            update.status = "completed";
            update.documenso_completed_at = completedAt ?? new Date().toISOString();
            if (pdfUrl) update.documenso_pdf_url = pdfUrl;
            if (certUrl) update.documenso_certificate_url = certUrl;
        }

        await supabaseAdmin.from("contracts").update(update).eq("id", id);

        return res.json({
            ok: true,
            contract_id: id,
            status: update.status || contract?.status,
            documenso_status: statusUpper,
        });
    } catch (e: any) {
        console.error("sync-status error", e);
        return res.status(500).json({ error: "Internal error" });
    }
}
