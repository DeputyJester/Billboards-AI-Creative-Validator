// pages/api/contracts/[id]/download.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const { id } = req.query;
    if (typeof id !== "string") return res.status(400).json({ error: "Bad contract id" });

    const API_URL = process.env.DOCUMENSO_API_URL || process.env.DOCUMENSO_BASE_URL || "";
    const API_KEY = process.env.DOCUMENSO_API_KEY || "";
    if (!API_URL || !API_KEY) {
        return res.status(500).json({ error: "Missing DOCUMENSO_API_URL/BASE_URL or DOCUMENSO_API_KEY" });
    }

    // Look up the contract to get the documenso_document_id
    const { data: contract, error } = await supabaseAdmin
        .from("contracts")
        .select("id, contract_number, documenso_document_id")
        .eq("id", id)
        .maybeSingle();

    if (error || !contract) return res.status(404).json({ error: "Contract not found" });
    if (!contract.documenso_document_id) {
        return res.status(400).json({ error: "Contract has no Documenso document id" });
    }

    const url = `${API_URL.replace(/\/$/, "")}/documents/${contract.documenso_document_id}/download`;
    const r = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${API_KEY}` },
    });

    const ctype = (r.headers.get("content-type") || "").toLowerCase();

    // Case A: Documenso returns JSON with a signed S3 URL
    if (ctype.includes("application/json")) {
        let json: any = null;
        try { json = await r.json(); } catch {
            const text = await r.text().catch(() => "");
            return res.status(502).json({ error: "Unexpected JSON from Documenso", detail: text.slice(0, 300) });
        }
        const s3 = json?.downloadUrl || json?.url || json?.signedUrl;
        if (!r.ok) {
            return res.status(r.status).json({ error: "Documenso responded with error", detail: json });
        }
        if (!s3 || typeof s3 !== "string") {
            return res.status(502).json({ error: "Documenso did not include a signed URL" });
        }
        // Redirect the browser to the signed S3 URL (best UX + streaming)
        res.setHeader("Cache-Control", "private, max-age=60");
        res.writeHead(302, { Location: s3 });
        return res.end();
    }

    // Case B: Documenso returned PDF bytes directly
    if (!r.ok) {
        const text = await r.text().catch(() => "");
        return res.status(502).json({ error: "Documenso download failed", detail: text.slice(0, 300) });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    const filename = `${contract.contract_number || `contract-${contract.id}`}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("Content-Length", String(buf.length));
    return res.status(200).send(buf);
}
