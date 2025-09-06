// pages/api/invites/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        // Get user JWT (sent automatically by supabase-js on the client via fetch if you pass it)
        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return res.status(401).json({ error: "Unauthorized" });

        const supabase = createClient(supabaseUrl, supabaseAnon, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const { campaignId, email } = req.body || {};
        if (!campaignId || typeof campaignId !== "string") return res.status(400).json({ error: "Missing campaignId" });
        if (!email || typeof email !== "string") return res.status(400).json({ error: "Missing email" });

        // Who is calling?
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes?.user) return res.status(401).json({ error: "Unauthorized" });
        const user = userRes.user;

        // Figure org from campaign
        const { data: camp, error: kerr } = await supabase
            .from("campaigns")
            .select("id, organization_id, name")
            .eq("id", campaignId)
            .maybeSingle();
        if (kerr) return res.status(400).json({ error: kerr.message });
        if (!camp) return res.status(404).json({ error: "Campaign not found" });

        // Insert invite (RLS ensures caller is in org)
        const payload = {
            organization_id: camp.organization_id,
            campaign_id: campaignId,
            email,
            created_by: user.id,
        };

        const { data: invite, error: ierr } = await supabase
            .from("client_invites")
            .insert(payload)
            .select("id, token, expires_at")
            .maybeSingle();

        if (ierr) return res.status(400).json({ error: ierr.message });
        if (!invite?.token) return res.status(500).json({ error: "Failed to create invite" });

        // Build link to client portal (we'll add the page next)
        const baseUrl =
            process.env.NEXT_PUBLIC_APP_URL ||
            `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
        const link = `${baseUrl}/client/${invite.token}`;

        return res.status(200).json({
            link,
            expires_at: invite.expires_at,
        });
    } catch (e: any) {
        return res.status(500).json({ error: e?.message || "Server error" });
    }
}
