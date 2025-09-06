// pages/api/client-submit.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service key
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // no-cache headers
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });

    try {
        const { token, creativeIds, email } = req.body || {};
        if (!token || !Array.isArray(creativeIds) || creativeIds.length === 0) {
            return res.status(400).json({ ok: false, message: "MISSING_FIELDS" });
        }

        // Resolve invite
        const { data: invite, error: invErr } = await admin
            .from("client_invites")
            .select("id, organization_id, campaign_id, email, expires_at")
            .eq("token", token)
            .maybeSingle();

        if (invErr || !invite) return res.status(400).json({ ok: false, message: "BAD_TOKEN" });
        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return res.status(400).json({ ok: false, message: "EXPIRED" });
        }

        const orgId = invite.organization_id as string;
        const campaignId = invite.campaign_id as string;
        const actorEmail = (email as string) || (invite.email as string) || null;

        // Mark creatives as submitted
        const { error: upErr } = await admin
            .from("campaign_creatives")
            .update({
                status: "submitted",
                submitted_at: new Date().toISOString(),
                uploader_email: actorEmail,
                invite_id: invite.id,
            })
            .in("id", creativeIds as string[])
            .eq("organization_id", orgId)
            .eq("campaign_id", campaignId);

        if (upErr) {
            console.error("[client-submit] update error", upErr);
            return res.status(500).json({ ok: false, message: "UPDATE_FAILED" });
        }

        // Audit: one summary event + one per creative
        const rows = [
            {
                organization_id: orgId,
                campaign_id: campaignId,
                event: "client_submit",
                actor_email: actorEmail,
                meta: { token, creativeIds },
            },
            ...(creativeIds as string[]).map((id) => ({
                organization_id: orgId,
                campaign_id: campaignId,
                event: "creative_status_updated",
                actor_email: actorEmail,
                meta: { id, to: "submitted" },
            })),
        ];

        const { error: auditErr } = await admin.from("audit_events").insert(rows);
        if (auditErr) console.warn("[client-submit] audit insert warning", auditErr); // non-blocking

        // Optionally bump campaign status to submitted (idempotent)
        await admin
            .from("campaigns")
            .update({ status: "submitted", updated_at: new Date().toISOString() })
            .eq("id", campaignId)
            .eq("organization_id", orgId)
            .in("status", ["draft", "pending"]);

        return res.json({ ok: true });
    } catch (e: any) {
        console.error("[client-submit] fatal", e);
        return res.status(500).json({ ok: false, message: "SERVER_ERROR" });
    }
}
