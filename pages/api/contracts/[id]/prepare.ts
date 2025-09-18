// pages/api/contracts/[id]/prepare.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";
import { dFetch } from "@/lib/documenso";

const TEMPLATE_ID = process.env.DOCUMENSO_TEMPLATE_ID || "";
const APP_BASE = process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!TEMPLATE_ID) return res.status(500).json({ error: "Missing DOCUMENSO_TEMPLATE_ID" });

    const contractId = String(req.query.id || "").trim();
    if (!contractId) return res.status(400).json({ error: "Missing contract id" });

    try {
        // Load contract
        const { data: contract, error: cErr } = await supabaseAdmin
            .from("contracts")
            .select("id, contract_number")
            .eq("id", contractId)
            .maybeSingle();
        if (cErr) return res.status(500).json({ error: "Contract query failed" });
        if (!contract) return res.status(404).json({ error: "Contract not found" });

        // Load CLIENT signer
        let clientName: string | null = null;
        let clientEmail: string | null = null;
        let signerRowId: string | null = null;

        let q1 = await supabaseAdmin
            .from("contract_signers")
            .select("id, role, email, company, contact_name")
            .eq("contract_id", contractId)
            .eq("role", "client")
            .maybeSingle();

        if (q1.error && /column .* does not exist/i.test(q1.error.message || "")) {
            const q2 = await supabaseAdmin
                .from("contract_signers")
                .select("id, role, email")
                .eq("contract_id", contractId)
                .eq("role", "client")
                .maybeSingle();
            if (q2.error) return res.status(500).json({ error: "Signers query failed (minimal)" });
            if (!q2.data) return res.status(400).json({ error: "Client signer missing for this contract" });
            signerRowId = q2.data.id as string;
            clientEmail = (q2.data as any).email || null;
            clientName = null;
        } else {
            if (q1.error) return res.status(500).json({ error: "Signers query failed" });
            if (!q1.data) return res.status(400).json({ error: "Client signer missing for this contract" });
            signerRowId = q1.data.id as string;
            clientEmail = (q1.data as any).email || null;
            const company = (q1.data as any).company || "";
            const contactName = (q1.data as any).contact_name || "";
            clientName = contactName || company || "Client";
        }

        if (!clientEmail) return res.status(400).json({ error: "Client signer must have an email" });

        // Fetch template (get placeholder recipients)
        const tplResp = await dFetch(`templates/${TEMPLATE_ID}`, { method: "GET" });
        if (!tplResp.ok) {
            return res.status(502).json({ error: "Documenso template fetch failed", detail: await tplResp.text() });
        }
        const tplJson = await tplResp.json();
        const placeholders: Array<{ id: number }> = tplJson?.Recipient || tplJson?.recipients || [];
        if (!Array.isArray(placeholders) || placeholders.length < 1) {
            return res.status(400).json({ error: "Template must have 1 recipient placeholder with a Signature field" });
        }
        const clientPlaceholderId = placeholders[0]?.id;

        // Generate document from template (single client recipient)
        const title = contract.contract_number ? `${contract.contract_number}.pdf` : "OOHLoop Contract.pdf";
        const genResp = await dFetch(`templates/${TEMPLATE_ID}/generate-document`, {
            method: "POST",
            body: JSON.stringify({
                title,
                recipients: [
                    {
                        id: clientPlaceholderId,
                        name: clientName || "Client",
                        email: clientEmail,
                        signingOrder: 0,
                    },
                ],
                meta: {
                    redirectUrl: `${APP_BASE.replace(/\/+$/, "")}/contracts/${contractId}/signed`,
                },
            }),
        });
        if (!genResp.ok) {
            return res.status(502).json({ error: "Documenso generate-document failed", detail: await genResp.text() });
        }

        const genJson = await genResp.json();
        const documentId: number = genJson?.documentId;
        const rec0 = Array.isArray(genJson?.recipients) ? genJson.recipients[0] : null;
        if (!documentId || !rec0?.token) {
            return res.status(502).json({ error: "Documenso response missing documentId/token" });
        }

        // Save IDs/tokens back to DB
        await supabaseAdmin.from("contracts").update({ documenso_document_id: documentId }).eq("id", contractId);
        await supabaseAdmin
            .from("contract_signers")
            .update({
                documenso_recipient_id: rec0.recipientId ?? null,
                documenso_signing_token: rec0.token ?? null,
                documenso_signing_url: rec0.signingUrl ?? null,
            })
            .eq("id", signerRowId!);

        return res.json({
            ok: true,
            id: contractId,
            contract_number: contract.contract_number || null,
            docId: documentId,
            client: {
                signer_id: signerRowId,
                email: clientEmail,
                token: rec0.token,
                signingUrl: rec0.signingUrl || null,
            },
        });
    } catch (e: any) {
        console.error("contracts/prepare error:", e);
        return res.status(500).json({ error: "Internal error" });
    }
}
