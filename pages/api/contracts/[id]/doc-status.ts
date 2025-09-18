// pages/api/contracts/[id]/doc-status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";

const RAW =
    process.env.DOCUMENSO_API_URL ||
    process.env.DOCUMENSO_BASE_URL || "";
const API = RAW.replace(/\/+$/, "");
const API_ROOT = API.endsWith("/api/v1") ? API : `${API}/api/v1`;

function dGet(path: string) {
    const url = `${API_ROOT}${path}`;
    return fetch(url, {
        method: "GET",
        headers: {
            authorization: `Bearer ${process.env.DOCUMENSO_API_KEY ||
                process.env.OCUMENSO_API_KEY || ""
                }`,
            "content-type": "application/json",
        },
    });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    if (!API || !(process.env.DOCUMENSO_API_KEY || process.env.OCUMENSO_API_KEY)) {
        return res.status(500).json({ error: "Missing DOCUMENSO_API_URL/BASE_URL or DOCUMENSO_API_KEY" });
    }

    const contractId = String(req.query.id || "").trim();
    if (!contractId) return res.status(400).json({ error: "Missing contract id" });

    const { data: contract, error } = await supabaseAdmin
        .from("contracts")
        .select("id, documenso_document_id, contract_number")
        .eq("id", contractId)
        .maybeSingle();

    if (error) return res.status(500).json({ error: "Contract lookup failed" });
    if (!contract?.documenso_document_id) {
        return res.status(400).json({ error: "No documenso_document_id on this contract. Run Prepare first." });
    }

    const docId = contract.documenso_document_id as number;

    const resp = await dGet(`/documents/${docId}`);
    const text = await resp.text();
    if (!resp.ok) return res.status(502).json({ error: "Documenso fetch failed", detail: text.slice(0, 400) });

    try {
        const json = text ? JSON.parse(text) : {};
        return res.json({
            ok: true,
            contract_id: contractId,
            contract_number: contract.contract_number ?? null,
            doc_id: docId,
            status: json?.status ?? null,
            recipients: json?.recipients ?? [],
            completedAt: json?.completedAt ?? null,
        });
    } catch {
        return res.status(502).json({ error: "Non-JSON response from Documenso", detail: text.slice(0, 400) });
    }
}
