// pages/api/contracts/[id]/send.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";
import { dFetch } from "@/lib/documenso";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing contract id" });

    const apiKey = process.env.DOCUMENSO_API_KEY || process.env.OCUMENSO_API_KEY || "";
    if (!apiKey) return res.status(500).json({ error: "Missing DOCUMENSO_API_KEY" });

    try {
        const { data: c, error } = await supabaseAdmin
            .from("contracts")
            .select("id, documenso_document_id")
            .eq("id", id)
            .maybeSingle();
        if (error) throw error;
        if (!c) return res.status(404).json({ error: "Not found" });
        if (!c.documenso_document_id) {
            return res.status(400).json({ error: "Document not prepared yet" });
        }

        // Activate recipients in Documenso (and send their email if Documenso is configured to do so)
        const resp = await dFetch(`documents/${c.documenso_document_id}/send`, {
            method: "POST",
            body: JSON.stringify({}),
        });
        if (!resp.ok) {
            const detail = await resp.text();
            return res.status(502).json({ error: "Documenso send failed", detail });
        }

        await supabaseAdmin
            .from("contracts")
            .update({ status: "sent", sent_at: new Date().toISOString(), documenso_status: "sent" })
            .eq("id", id);

        res.status(200).json({ ok: true });
    } catch (e: any) {
        console.error("contracts/send error:", e);
        res.status(500).json({ error: e?.message || "Internal error" });
    }
}
