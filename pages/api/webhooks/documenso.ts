// pages/api/webhooks/documenso.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";
import { Resend } from "resend";

const WEBHOOK_SECRET = process.env.DOCUMENSO_WEBHOOK_SECRET || "";
const API_URL = (process.env.DOCUMENSO_API_URL || process.env.DOCUMENSO_BASE_URL || "").replace(/\/$/, "");
const API_KEY = process.env.DOCUMENSO_API_KEY || "";

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "no-reply@mail.oohloop.com";
const APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:3000";

const resend = new Resend(RESEND_KEY);

export const config = {
    api: { bodyParser: true },
};

type DocEvent = {
    event?: string;                // e.g. "DOCUMENT_COMPLETED"
    type?: string;                 // e.g. "document.completed"
    document?: { id?: number | string; completedAt?: string | null };
    payload?: { id?: number | string; completedAt?: string | null };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

        // Verify webhook secret
        const got = req.headers["x-webhook-secret"];
        if (!WEBHOOK_SECRET || !got || String(got) !== WEBHOOK_SECRET) {
            return res.status(401).json({ error: "Unauthorized (bad webhook secret)" });
        }

        // Basic sanity on env
        if (!API_URL || !API_KEY) return res.status(500).json({ error: "Missing DOCUMENSO_API_URL/KEY" });
        if (!RESEND_KEY) return res.status(500).json({ error: "Missing RESEND_API_KEY" });

        const body = (req.body || {}) as DocEvent;
        const eventRaw = body.event || body.type || "";
        const event = eventRaw.toString().toLowerCase();

        const docId = body.document?.id ?? body.payload?.id;
        const completedAt = body.document?.completedAt ?? body.payload?.completedAt ?? null;
        if (!docId) return res.status(400).json({ error: "Missing document id" });

        const isCompleted = event.includes("completed") || Boolean(completedAt);

        // Find linked contract
        const { data: contract, error: cErr } = await supabaseAdmin
            .from("contracts")
            .select("id, organization_id, contract_number, documenso_document_id, status")
            .eq("documenso_document_id", docId)
            .maybeSingle();

        if (cErr || !contract) {
            return res.status(404).json({ error: "Contract lookup failed", detail: cErr?.message });
        }

        // Always update basic status if needed
        if (!isCompleted) {
            await supabaseAdmin.from("contracts").update({ status: "pending" }).eq("id", contract.id);
            return res.status(200).json({ ok: true, event: eventRaw || "ignored", docId, note: "Not a completion event" });
        }

        // Get recipient emails from contract_signers (role='client' and 'staff' if you want to BCC)
        const { data: signers } = await supabaseAdmin
            .from("contract_signers")
            .select("role,email,name")
            .eq("contract_id", contract.id);

        const client = (signers || []).find(s => (s.role || "").toLowerCase() === "client");
        const staff = (signers || []).find(s => (s.role || "").toLowerCase() === "staff");

        const toEmail = client?.email || ""; // REQUIRED
        if (!toEmail) return res.status(400).json({ error: "No client signer email on contract" });

        // Ask Documenso for the download link (they return JSON with a signed S3 URL)
        const dl = await fetch(`${API_URL}/documents/${docId}/download`, {
            headers: { Authorization: `Bearer ${API_KEY}` },
        });

        if (!dl.ok) {
            const t = await dl.text();
            return res.status(502).json({ error: "Documenso download lookup failed", detail: t.slice(0, 300) });
        }

        let downloadUrl = "";
        const ctype = (dl.headers.get("content-type") || "").toLowerCase();
        if (ctype.includes("application/json")) {
            const j = await dl.json().catch(() => null);
            downloadUrl = j?.downloadUrl || j?.url || j?.signedUrl || "";
        } else {
            // Rarely Documenso might stream bytes; in that case we fallback to our own proxy route
            downloadUrl = `${APP_BASE_URL}/api/contracts/${contract.id}/download`;
        }
        if (!downloadUrl) {
            return res.status(502).json({ error: "Documenso did not return a signed URL" });
        }

        // Fetch the PDF bytes (so we can ATTACH it)
        const pdfResp = await fetch(downloadUrl);
        if (!pdfResp.ok) {
            const t = await pdfResp.text().catch(() => "");
            return res.status(502).json({ error: "Failed to fetch PDF for attachment", detail: t.slice(0, 300) });
        }
        const pdfBuf = Buffer.from(await pdfResp.arrayBuffer());
        const pdfB64 = pdfBuf.toString("base64");
        const filename = `${contract.contract_number || `contract-${contract.id}`}.pdf`;

        // Compose email
        const subject = `Executed contract ${contract.contract_number || ""}`.trim();
        const signedLink = `${APP_BASE_URL}/contracts/${contract.id}/signed`;

        const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.45">
        <h2 style="margin:0 0 12px">Your contract is complete</h2>
        <p style="margin:0 0 10px">
          Contract <strong>${contract.contract_number || contract.id}</strong> has been fully executed${completedAt ? ` on <strong>${new Date(completedAt).toLocaleString()}</strong>` : ""}.
        </p>
        <p style="margin:0 0 10px">
          A signed PDF is attached. You can also view it here:
          <a href="${signedLink}" target="_blank" rel="noopener noreferrer">${signedLink}</a>
        </p>
        <p style="margin:16px 0 0;color:#6b7280;font-size:12px">
          This email was sent by OOHLoop. If you didn't expect this, please contact support.
        </p>
      </div>
    `;

        // Send via Resend (attach the PDF)
        const toList = [toEmail].filter(Boolean);
        const bccList = [staff?.email].filter(Boolean) as string[];

        const sendResp = await resend.emails.send({
            from: RESEND_FROM,
            to: toList,
            bcc: bccList.length ? bccList : undefined,
            subject,
            html,
            attachments: [
                { filename, content: pdfB64, contentType: "application/pdf" }
            ],
        });

        // Mark contract completed (optional columns if you have them)
        await supabaseAdmin
            .from("contracts")
            .update({ status: "completed" })
            .eq("id", contract.id);

        return res.status(200).json({
            ok: true,
            event: eventRaw || "document.completed",
            docId,
            contract_id: contract.id,
            emailId: sendResp?.data?.id || null,
            emailedTo: toList,
            bcc: bccList,
        });
    } catch (e: any) {
        console.error("documenso webhook error:", e);
        return res.status(500).json({ error: "Unhandled error", detail: e?.message || String(e) });
    }
}
