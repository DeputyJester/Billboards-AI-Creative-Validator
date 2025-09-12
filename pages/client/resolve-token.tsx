// pages/api/client/resolve-token.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function splitFormats(s: string | null | undefined) {
    return (s || "")
        .split(",")
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    try {
        const { token } = req.body || {};
        if (!token || typeof token !== "string") return res.status(400).json({ error: "Missing token" });

        const admin = createClient(url, service, { auth: { persistSession: false } });

        // Invite (include id so we can audit)
        const { data: invite, error: ierr } = await admin
            .from("client_invites")
            .select("id, organization_id, campaign_id, email, expires_at, used_at")
            .eq("token", token)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
        if (ierr) return res.status(400).json({ error: ierr.message });
        if (!invite) return res.status(404).json({ error: "Invalid or expired invite" });

        // Campaign
        const { data: camp, error: cerr } = await admin
            .from("campaigns")
            .select("id, organization_id, name, description, status, start_date, end_date")
            .eq("id", invite.campaign_id)
            .maybeSingle();
        if (cerr) return res.status(400).json({ error: cerr.message });
        if (!camp) return res.status(404).json({ error: "Campaign not found" });

        // Creative groups
        const { data: groups, error: gerr } = await admin
            .from("campaign_creative_groups")
            .select("id, group_key, label, width_px, height_px, status, created_at")
            .eq("campaign_id", camp.id)
            .order("created_at", { ascending: true });
        if (gerr) return res.status(400).json({ error: gerr.message });

        // Boards → derive allowed formats/limits per WxH
        const { data: cb } = await admin
            .from("campaign_boards")
            .select("board_id")
            .eq("campaign_id", camp.id);

        const boardIds = (cb || []).map((r: any) => r.board_id).filter(Boolean);
        let boards: any[] = [];
        if (boardIds.length) {
            const { data: b } = await admin
                .from("boards")
                .select("id, width_px, height_px, supported_file_format, supported_animated_file_format, max_file_size_mb, dpi_min, dpi_max")
                .in("id", boardIds);
            boards = b || [];
        }

        const aggByPx = new Map<string, {
            allowed: Set<string>;
            allowedAnimated: Set<string>;
            minDpi: number | null;
            maxDpi: number | null;
            maxSizeMb: number | null;
        }>();

        for (const b of boards) {
            const key = `${b.width_px || 0}x${b.height_px || 0}`;
            if (!aggByPx.has(key)) {
                aggByPx.set(key, { allowed: new Set(), allowedAnimated: new Set(), minDpi: null, maxDpi: null, maxSizeMb: null });
            }
            const slot = aggByPx.get(key)!;
            splitFormats(b.supported_file_format).forEach(f => slot.allowed.add(f));
            splitFormats(b.supported_animated_file_format).forEach(f => slot.allowedAnimated.add(f));
            if (typeof b.dpi_min === "number") slot.minDpi = slot.minDpi === null ? b.dpi_min : Math.max(slot.minDpi, b.dpi_min);
            if (typeof b.dpi_max === "number") slot.maxDpi = slot.maxDpi === null ? b.dpi_max : Math.min(slot.maxDpi, b.dpi_max);
            if (typeof b.max_file_size_mb === "number") slot.maxSizeMb = slot.maxSizeMb === null ? b.max_file_size_mb : Math.min(slot.maxSizeMb, b.max_file_size_mb);
        }

        const payloadGroups = (groups || []).map(g => {
            const slot = aggByPx.get(`${g.width_px || 0}x${g.height_px || 0}`);
            const maxMb = slot?.maxSizeMb ?? 5;
            return {
                id: g.id,
                label: g.label,
                group_key: g.group_key,
                width_px: g.width_px,
                height_px: g.height_px,
                status: g.status,
                rules: {
                    allowed_formats: Array.from(slot?.allowed || new Set(["png", "jpg", "jpeg"])),
                    allowed_animated_formats: Array.from(slot?.allowedAnimated || new Set<string>()),
                    max_file_size_mb: maxMb,
                    dpi_min: slot?.minDpi ?? null,
                    dpi_max: slot?.maxDpi ?? null
                }
            };
        });

        // AUDIT: invite opened
        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
        const ua = req.headers["user-agent"] || null;
        await admin.from("audit_events").insert({
            organization_id: invite.organization_id,
            event_kind: "invite_opened",
            actor_invite_id: invite.id,
            actor_email: invite.email,
            actor_role: "client",
            campaign_id: camp.id,
            context: { token },
            ip,
            user_agent: ua
        });

        return res.status(200).json({
            campaign: camp,
            invite: { email: invite.email, expires_at: invite.expires_at, id: invite.id },
            groups: payloadGroups
        });
    } catch (e: any) {
        return res.status(500).json({ error: e?.message || "Server error" });
    }
}

// Force SSR so Next.js doesn't try to pre-render this page at build time
export async function getServerSideProps() {
    return { props: {} };
}

