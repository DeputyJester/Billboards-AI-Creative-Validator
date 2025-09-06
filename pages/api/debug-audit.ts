// pages/api/debug-audit.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const { campaignId } = req.query;
    if (!campaignId || typeof campaignId !== "string") {
        res.status(400).json({ ok: false, error: "Missing campaignId" });
        return;
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) {
        res.status(500).json({ ok: false, error: "Supabase env vars missing" });
        return;
    }

    // NOTE: using service key here ONLY to diagnose quickly.
    const supabase = createClient(url, serviceKey);

    const { data, error } = await supabase
        .from("audit_events")
        .select("id,event_kind,event,actor_email,actor_role,organization_id,campaign_id,created_at,context")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });

    if (error) {
        res.status(200).json({ ok: false, error: error.message });
        return;
    }

    res.status(200).json({ ok: true, count: data?.length ?? 0, rows: data ?? [] });
}
