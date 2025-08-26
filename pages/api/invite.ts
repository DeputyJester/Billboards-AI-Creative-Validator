// pages/api/invite.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server-only key

function getAccessToken(req: NextApiRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.cookies?.["sb-access-token"] ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: "Server not configured (service role missing)" });

  try {
    const { email, orgName, role = "admin" } = req.body ?? {};
    if (!email || !orgName) return res.status(400).json({ error: "Missing email or orgName" });

    // 1) Verify caller is logged in and is admin/superadmin
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const userClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: meRes, error: meErr } = await userClient.auth.getUser();
    if (meErr || !meRes?.user) return res.status(401).json({ error: "Unauthorized" });

    // Look up role from profiles or users
    let callerRole: string | null = null;
    const { data: p } = await userClient.from("profiles").select("role").eq("id", meRes.user.id).maybeSingle();
    if (p?.role) callerRole = p.role as string;
    if (!callerRole) {
      const { data: u } = await userClient.from("users").select("role").eq("id", meRes.user.id).maybeSingle();
      callerRole = (u?.role as string | null) ?? null;
    }
    if (!(callerRole === "admin" || callerRole === "superadmin")) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 2) Use service role for privileged ops
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Ensure org exists (get or create)
    let orgId: string | null = null;
    {
      const { data } = await admin
        .from("organizations")
        .select("id")
        .eq("name", orgName)
        .maybeSingle();

      if (data?.id) {
        orgId = data.id;
      } else {
        const { data: ins, error: insErr } = await admin
          .from("organizations")
          .insert({ name: orgName })
          .select("id")
          .single();
        if (insErr) return res.status(400).json({ error: insErr.message });
        orgId = ins.id;
      }
    }

    // Save/overwrite pending invite
    const { error: pendErr } = await admin
      .from("pending_org_invites")
      .upsert({ email, organization_id: orgId!, role }, { onConflict: "email" });
    if (pendErr) return res.status(400).json({ error: pendErr.message });

    // Send invite email
    const { data: inviteRes, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { orgName, role },
    });
    if (inviteErr) return res.status(400).json({ error: inviteErr.message });

    return res.status(200).json({ ok: true, orgId, inviteId: inviteRes?.user?.id ?? null });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
