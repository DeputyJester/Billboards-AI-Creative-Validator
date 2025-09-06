// pages/api/client-resolve-token.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

type Ok = {
    ok: true;
    campaignId: string;
    campaignName: string;
    organizationId: string;
    organizationName: string;
    inviteEmail: string;
    expiresAtISO?: string | null;
    groups: Array<{ id: string; label: string; width_px: number | null; height_px: number | null }>;
};
type Err = { ok: false; message: string };
type Resp = Ok | Err;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Resp>) {
    // 🔒 never cache token-derived responses
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (req.method !== "GET") return res.status(405).json({ ok: false, message: "Method not allowed" });
    if (!url || !serviceKey) return res.status(500).json({ ok: false, message: "Server not configured" });

    const raw = String(req.query.token ?? "").trim();
    if (!raw) return res.status(400).json({ ok: false, message: "Missing token" });

    // 1) Invite must exist and not be expired
    const { data: invite, error: invErr } = await admin
        .from("client_invites")
        .select("id, organization_id, campaign_id, email, expires_at")
        .eq("token", raw)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

    if (invErr) return res.status(500).json({ ok: false, message: "Invite lookup failed" });
    if (!invite) return res.status(404).json({ ok: false, message: "Invite not found or expired" });

    // 2) Campaign
    const { data: camp, error: campErr } = await admin
        .from("campaigns")
        .select("id, name, organization_id")
        .eq("id", invite.campaign_id)
        .maybeSingle();

    if (campErr) return res.status(500).json({ ok: false, message: "Campaign lookup failed" });
    if (!camp) return res.status(404).json({ ok: false, message: "Campaign not found" });

    // 3) Org
    const { data: org, error: orgErr } = await admin
        .from("organizations")
        .select("id, name")
        .eq("id", invite.organization_id)
        .maybeSingle();

    if (orgErr) return res.status(500).json({ ok: false, message: "Organization lookup failed" });
    if (!org) return res.status(404).json({ ok: false, message: "Organization not found" });

    // 4) Creative groups for this campaign
    const { data: groups, error: grpErr } = await admin
        .from("campaign_creative_groups")
        .select("id, label, width_px, height_px")
        .eq("campaign_id", camp.id)
        .order("label", { ascending: true });

    if (grpErr) return res.status(500).json({ ok: false, message: "Groups lookup failed" });

    const mapped =
        (groups ?? []).map((g) => ({
            id: g.id,
            label: g.label || `${g.width_px ?? "—"}×${g.height_px ?? "—"} px`,
            width_px: g.width_px ?? null,
            height_px: g.height_px ?? null,
        })) || [];

    return res.status(200).json({
        ok: true,
        campaignId: camp.id,
        campaignName: camp.name || "Campaign",
        organizationId: org.id,
        organizationName: org.name || "Organization",
        inviteEmail: invite.email || "",
        expiresAtISO: invite.expires_at ?? null,
        groups: mapped,
    });
}
