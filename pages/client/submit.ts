// pages/api/client/submit.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const { token, group_id, fileName, mimeType, path, width_px, height_px, byte_size } = req.body || {};
        if (!token || !group_id || !fileName || !mimeType || !path) return res.status(400).json({ error: "Missing fields" });

        const admin = createClient(url, service, { auth: { persistSession: false } });

        const { data: invite } = await admin
            .from("client_invites")
            .select("id, organization_id, campaign_id, email")
            .eq("token", token)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
        if (!invite) return res.status(404).json({ error: "Invalid or expired invite" });

        const { data: grp } = await admin
            .from("campaign_creative_groups")
            .select("id, campaign_id, width_px, height_px")
            .eq("id", group_id)
            .eq("campaign_id", invite.campaign_id)
            .maybeSingle();
        if (!grp) return res.status(404).json({ error: "Group not found for this campaign" });

        // (Optional) strict dimension check server-side
        if (typeof grp.width_px === "number" && typeof grp.height_px === "number") {
            if (Number(width_px) !== grp.width_px || Number(height_px) !== grp.height_px) {
                return res.status(400).json({ error: "Dimensions do not match required pixel size" });
            }
        }

        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
        const ua = req.headers["user-agent"] || null;

        // Insert creative record with invite provenance
        const { data: created, error: ierr } = await admin
            .from("campaign_creatives")
            .insert({
                organization_id: invite.organization_id,
                campaign_id: invite.campaign_id,
                group_id,
                storage_path: path,
                file_name: fileName,
                mime_type: mimeType,
                width_px: width_px ?? null,
                height_px: height_px ?? null,
                byte_size: byte_size ?? null,
                uploader_email: invite.email,
                invite_id: invite.id,
                uploaded_by_type: 'guest',
                uploaded_ip: ip,
                uploaded_user_agent: ua
            })
            .select("id")
            .maybeSingle();
        if (ierr) return res.status(400).json({ error: ierr.message });

        // Mark group uploaded
        await admin
            .from("campaign_creative_groups")
            .update({ status: "uploaded" })
            .eq("id", group_id)
            .eq("campaign_id", invite.campaign_id);

        // AUDIT: upload completed
        await admin.from("audit_events").insert({
            organization_id: invite.organization_id,
            event_kind: "upload_completed",
            actor_invite_id: invite.id,
            actor_email: invite.email,
            actor_role: "client",
            campaign_id: invite.campaign_id,
            group_id,
            creative_id: created?.id ?? null,
            context: { fileName, path, width_px, height_px, byte_size },
            ip, user_agent: ua
        });

        return res.status(200).json({ ok: true });
    } catch (e: any) {
        return res.status(500).json({ error: e?.message || "Server error" });
    }
}
