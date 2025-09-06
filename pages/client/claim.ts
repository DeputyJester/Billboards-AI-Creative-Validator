// pages/api/client/claim.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    try {
        const auth = req.headers.authorization || "";
        const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!bearer) return res.status(401).json({ error: "Unauthorized" });

        const asUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } });
        const { data: ures, error: uerr } = await asUser.auth.getUser();
        if (uerr || !ures?.user) return res.status(401).json({ error: "Unauthorized" });
        const user = ures.user;

        const { inviteToken } = req.body || {};
        if (!inviteToken || typeof inviteToken !== "string") return res.status(400).json({ error: "Missing inviteToken" });

        const admin = createClient(url, service, { auth: { persistSession: false } });

        const { data: inv } = await admin
            .from("client_invites")
            .select("id, organization_id, campaign_id, email, used_at")
            .eq("token", inviteToken)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
        if (!inv) return res.status(404).json({ error: "Invalid or expired invite" });

        if ((user.email || "").toLowerCase() !== (inv.email || "").toLowerCase()) {
            return res.status(403).json({ error: "Invite email does not match your account email" });
        }

        // Campaign → get customer_id so we can bind
        const { data: camp } = await admin
            .from("campaigns")
            .select("id, organization_id, customer_id")
            .eq("id", inv.campaign_id)
            .maybeSingle();
        if (!camp) return res.status(404).json({ error: "Campaign not found" });

        // Link user to this customer (idempotent)
        const { error: upErr } = await admin
            .from("customer_users")
            .upsert(
                { organization_id: camp.organization_id, customer_id: camp.customer_id, user_id: user.id },
                { onConflict: "organization_id,customer_id,user_id" }
            );
        if (upErr) return res.status(400).json({ error: upErr.message });

        // Backfill any past guest uploads for this invite → set client_user_id, uploaded_by_type='account'
        await admin
            .from("campaign_creatives")
            .update({ client_user_id: user.id, uploaded_by_type: 'account' })
            .eq("invite_id", inv.id)
            .is("client_user_id", null);

        // Mark invite used and log audit
        if (!inv.used_at) {
            await admin.from("client_invites").update({ used_at: new Date().toISOString() }).eq("id", inv.id);
        }

        const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
        const ua = req.headers["user-agent"] || null;
        await admin.from("audit_events").insert({
            organization_id: camp.organization_id,
            event_kind: "token_claimed",
            actor_user_id: user.id,
            actor_invite_id: inv.id,
            actor_email: inv.email,
            actor_role: "client",
            campaign_id: camp.id,
            context: { message: "Client account linked to invite" },
            ip, user_agent: ua
        });

        return res.status(200).json({ ok: true });
    } catch (e: any) {
        return res.status(500).json({ error: e?.message || "Server error" });
    }
}
