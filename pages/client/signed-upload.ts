// pages/api/client/signed-upload.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    try {
        const { token, group_id, fileName, contentType } = req.body || {};
        if (!token || !group_id || !fileName) return res.status(400).json({ error: "Missing fields" });

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
            .select("id")
            .eq("id", group_id)
            .eq("campaign_id", invite.campaign_id)
            .maybeSingle();
        if (!grp) return res.status(404).json({ error: "Group not found for this campaign" });

        const safeName = String(fileName).replace(/[^\w.\-]+/g, "_");
        const path = `org_${invite.organization_id}/campaigns/${invite.campaign_id}/${group_id}/${safeName}`;

        const { data: signed, error } = await admin
            .storage
            .from("creative-uploads")
            .createSignedUploadUrl(path);
        if (error) return res.status(400).json({ error: error.message });

        // AUDIT: upload started
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
        const ua = req.headers["user-agent"] || null;
        await admin.from("audit_events").insert({
            organization_id: invite.organization_id,
            event_kind: "upload_started",
            actor_invite_id: invite.id,
            actor_email: invite.email,
            actor_role: "client",
            campaign_id: invite.campaign_id,
            group_id,
            context: { fileName, contentType, path },
            ip, user_agent: ua
        });

        return res.status(200).json({ uploadUrl: signed.signedUrl, path, invite_id: invite.id });
    } catch (e: any) {
        return res.status(500).json({ error: e?.message || "Server error" });
    }
}
