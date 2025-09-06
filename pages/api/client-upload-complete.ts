// pages/api/client-upload-complete.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/client-upload-complete?token=...&creativeId=...&path=...&contentType=...&size=...&name=...
 * Marks a creative as uploaded and records metadata.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (req.method !== "GET") {
        return res.status(405).json({ ok: false, message: "METHOD_NOT_ALLOWED" });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ ok: false, message: "SERVER_MISCONFIGURED" });
    }

    const token = String(req.query.token || "");
    const creativeId = String(req.query.creativeId || "");
    const path = String(req.query.path || "");
    const contentType = String(req.query.contentType || "");
    const size = Number(req.query.size || 0);
    const name = String(req.query.name || "");

    const missing: string[] = [];
    if (!token) missing.push("token");
    if (!creativeId) missing.push("creativeId");
    if (!path) missing.push("path");
    if (!contentType) missing.push("contentType");
    if (!size) missing.push("size");
    if (!name) missing.push("name");
    if (missing.length) {
        return res.status(400).json({ ok: false, message: "MISSING_FIELDS", missing });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "X-Client-Info": "client-upload-complete" } },
    });

    try {
        // Validate token again to get org/campaign (defense-in-depth)
        const { data: invite, error: invErr } = await admin
            .from("client_invites")
            .select("organization_id, campaign_id, expires_at")
            .eq("token", token)
            .maybeSingle();

        if (invErr || !invite) {
            return res.status(400).json({ ok: false, message: "BAD_TOKEN" });
        }
        if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
            return res.status(400).json({ ok: false, message: "TOKEN_EXPIRED" });
        }

        // Ensure the creative row belongs to that org/campaign, and path matches what we generated
        const { data: creative, error: crErr } = await admin
            .from("campaign_creatives")
            .select("id, organization_id, campaign_id, storage_path, status")
            .eq("id", creativeId)
            .maybeSingle();

        if (crErr || !creative) {
            return res.status(400).json({ ok: false, message: "CREATIVE_NOT_FOUND" });
        }
        if (creative.organization_id !== invite.organization_id || creative.campaign_id !== invite.campaign_id) {
            return res.status(403).json({ ok: false, message: "MISMATCH" });
        }
        if (creative.storage_path !== path) {
            return res.status(400).json({ ok: false, message: "PATH_MISMATCH" });
        }

        // Mark uploaded + record metadata
        const { error: upErr } = await admin
            .from("campaign_creatives")
            .update({
                status: "uploaded",
                uploaded_at: new Date().toISOString(),
                original_filename: name,
                content_type: contentType,
                size_bytes: size,
            })
            .eq("id", creativeId);

        if (upErr) {
            console.error("[client-upload-complete] update error:", upErr.message);
            return res.status(400).json({ ok: false, message: "UPDATE_FAILED" });
        }

        return res.status(200).json({ ok: true });
    } catch (e: any) {
        console.error("[client-upload-complete] unexpected error:", e?.message || e);
        return res.status(500).json({ ok: false, message: "SERVER_ERROR" });
    }
}
