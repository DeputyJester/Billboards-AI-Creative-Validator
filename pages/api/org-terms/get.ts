// pages/api/org-terms/get.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";

/**
 * Auth model:
 * - Frontend should send the Supabase access token as:
 *      Authorization: Bearer <access_token>
 *   We verify the user, then check org membership before returning data.
 *
 * Query params:
 * - orgId (uuid) : required
 * - history=1    : optional, include all versions (otherwise returns only active)
 *
 * Responses:
 * 200 { ok:true, active: { ... }, history?: [ ... ] }
 * 400/401/403/500 on errors
 */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const orgId = (req.query.orgId as string | undefined)?.trim();
    const includeHistory = String(req.query.history || "").trim() === "1";

    if (!orgId) {
        return res.status(400).json({ error: "Missing orgId" });
    }

    // Get Supabase auth token from Authorization header
    const authHeader = req.headers.authorization || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : "";

    if (!token) {
        return res.status(401).json({ error: "Missing bearer token" });
    }

    // Verify the user associated with this token
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
    const userId = userData.user.id;

    // Check org membership
    const { data: membership, error: mErr } = await supabaseAdmin
        .from("user_organizations")
        .select("user_id")
        .eq("organization_id", orgId)
        .eq("user_id", userId)
        .maybeSingle();

    if (mErr) {
        return res.status(500).json({ error: "db query failed (membership)" });
    }
    if (!membership) {
        return res.status(403).json({ error: "Not a member of this organization" });
    }

    // Fetch active terms
    const { data: activeRow, error: activeErr } = await supabaseAdmin
        .from("org_terms")
        .select("*")
        .eq("organization_id", orgId)
        .eq("is_active", true)
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (activeErr) {
        return res.status(500).json({ error: "db query failed (active)" });
    }

    // Optionally fetch history
    if (includeHistory) {
        const { data: historyRows, error: histErr } = await supabaseAdmin
            .from("org_terms")
            .select("*")
            .eq("organization_id", orgId)
            .order("effective_date", { ascending: false });

        if (histErr) {
            return res.status(500).json({ error: "db query failed (history)" });
        }

        return res.status(200).json({
            ok: true,
            active: activeRow ?? null,
            history: historyRows ?? [],
        });
    }

    return res.status(200).json({ ok: true, active: activeRow ?? null });
}
