// pages/api/client-upload-url.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

/**
 * ENV expected:
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY   (service key, not the anon key)
 * Optional:
 *  - CAMPAIGN_UPLOADS_BUCKET     (default "campaign-uploads")
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = process.env.CAMPAIGN_UPLOADS_BUCKET || "campaign-uploads";

type Data =
    | { ok: true; uploadUrl: string; path: string; creativeId: string }
    | { ok: false; message: string };

function noStore(res: NextApiResponse) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
}

function getClientIP(req: NextApiRequest): string | null {
    const xf = (req.headers["x-forwarded-for"] || "") as string;
    const first = xf.split(",")[0]?.trim();
    const ip = first || (req.socket?.remoteAddress ?? null);
    return ip || null;
}

function sanitizeFilename(name: string): string {
    const n = name.replace(/[/\\]/g, " ").replace(/\s+/g, " ").trim();
    // keep common ascii + basic punctuation
    return n.replace(/[^\w.\-() @]/g, "");
}

function extForContentType(ct: string): string {
    const t = (ct || "").toLowerCase();
    if (t.includes("png")) return ".png";
    if (t.includes("jpeg")) return ".jpg";
    if (t.includes("jpg")) return ".jpg";
    return ""; // fallback if unknown
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
    noStore(res);

    if (req.method !== "GET") {
        return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ ok: false, message: "Server misconfigured" });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
        const token = (req.query.token as string) || "";
        const groupId = (req.query.groupId as string) || "";
        const originalName = (req.query.name as string) || "upload.png";
        const contentType = (req.query.contentType as string) || "";

        if (!token || !groupId || !originalName || !contentType) {
            return res.status(400).json({ ok: false, message: "MISSING_FIELDS" });
        }

        // 1) Resolve invite by token; ensure not expired
        const { data: invite, error: invErr } = await supabase
            .from("client_invites")
            .select("id, organization_id, campaign_id, email, expires_at")
            .eq("token", token)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();

        if (invErr || !invite) {
            return res.status(400).json({ ok: false, message: "INVITE_NOT_FOUND_OR_EXPIRED" });
        }

        // 2) Ensure group belongs to the campaign
        const { data: group, error: grpErr } = await supabase
            .from("campaign_creative_groups")
            .select("id, campaign_id, width_px, height_px")
            .eq("id", groupId)
            .eq("campaign_id", invite.campaign_id)
            .maybeSingle();

        if (grpErr || !group) {
            return res.status(400).json({ ok: false, message: "GROUP_NOT_IN_CAMPAIGN" });
        }

        // 3) Build safe filename and storage path
        const safeBase = sanitizeFilename(originalName);
        const ensuredExt = safeBase.includes(".") ? safeBase : `${safeBase}${extForContentType(contentType) || ""}`;
        const safeFile = ensuredExt || `upload${extForContentType(contentType) || ".png"}`;

        const creativeId = randomUUID();
        const storagePath = `org_${invite.organization_id}/campaigns/${invite.campaign_id}/groups/${groupId}/${creativeId}/${safeFile}`;

        // 4) Insert DB row FIRST with all NOT NULLs satisfied
        const ip = getClientIP(req);
        const ua = (req.headers["user-agent"] as string) || null;

        const insertPayload = {
            id: creativeId,                       // explicit so we can use it in the storage path
            organization_id: invite.organization_id,
            campaign_id: invite.campaign_id,
            group_id: groupId,
            storage_path: storagePath,            // NOT NULL
            file_name: safeFile,                  // NOT NULL
            mime_type: contentType,               // NOT NULL  <-- fixes your current error
            // nullable / nice-to-have at init:
            original_filename: originalName || safeFile,
            content_type: contentType,            // nullable but we populate it
            path: storagePath,                    // nullable, mirror storage_path for convenience
            invite_id: invite.id,
            uploader_email: invite.email || null,
            uploaded_ip: ip,
            uploaded_user_agent: ua,
            // status has default 'pending', uploaded_at & created_at default now(), uploaded_by_type default 'guest'
        };

        const { error: insErr } = await supabase.from("campaign_creatives").insert(insertPayload);
        if (insErr) {
            console.error("[client-upload-url] insert creative error:", insErr.message || insErr);
            return res.status(400).json({ ok: false, message: "CREATE_FAILED" });
        }

        // 5) Create a signed upload URL (PUT)
        const up = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
        if (up.error || !up.data?.signedUrl) {
            console.error("[client-upload-url] signed upload error:", up.error?.message || up.error || "no url");
            // Optional: rollback the DB row if you want strict consistency (not required, but can be added)
            return res.status(400).json({ ok: false, message: "SIGN_FAILED" });
        }

        return res.status(200).json({
            ok: true,
            uploadUrl: up.data.signedUrl,
            path: storagePath,
            creativeId,
        });
    } catch (e: any) {
        console.error("[client-upload-url] unexpected error:", e?.message || e);
        return res.status(500).json({ ok: false, message: "SERVER_ERROR" });
    }
}
