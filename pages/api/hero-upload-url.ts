// pages/api/hero-upload-url.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getAccessToken(req: NextApiRequest): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.cookies?.["sb-access-token"] ?? null; // fallback if present
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const token = getAccessToken(req);
    if (!token) return res.status(401).json({ error: "Unauthorized (no token)" });

    // 🔑 Create a Supabase client that runs queries AS THIS USER (JWT attached)
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Identify caller (now works via header)
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) return res.status(401).json({ error: `Unauthorized (${userErr.message})` });
    const user = userRes?.user;
    if (!user) return res.status(401).json({ error: "Unauthorized (no user)" });

    const { boardId, heroName = "hero.webp", thumbName = "thumb.webp" } = req.body || {};
    if (!boardId || typeof boardId !== "string") {
      return res.status(400).json({ error: "Missing or invalid boardId" });
    }

    // 1) Get all orgs the user belongs to (RLS now allows it)
    const { data: memberships, error: mErr } = await supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", user.id);

    if (mErr) return res.status(400).json({ error: mErr.message });
    const orgIds = (memberships ?? []).map((m) => m.organization_id).filter(Boolean);
    if (orgIds.length === 0) {
      return res.status(403).json({ error: "Forbidden (no org memberships)" });
    }

    // 2) Fetch the board within the user's orgs (works with RLS)
    const { data: board, error: bErr } = await supabase
      .from("boards")
      .select("id, organization_id")
      .eq("id", boardId)
      .in("organization_id", orgIds)
      .maybeSingle();

    if (bErr) return res.status(400).json({ error: bErr.message });
    if (!board) return res.status(403).json({ error: "Forbidden (board not accessible)" });

    const orgId = board.organization_id as string;

    // 3) Build storage paths, issue signed upload URLs
    const heroPath = `org_${orgId}/boards/${boardId}/${heroName}`;
    const thumbPath = `org_${orgId}/boards/${boardId}/${thumbName}`;

    const hero = await supabase.storage.from("board-photos").createSignedUploadUrl(heroPath);
    if (hero.error) return res.status(400).json({ error: hero.error.message });

    const thumb = await supabase.storage.from("board-photos").createSignedUploadUrl(thumbPath);
    if (thumb.error) return res.status(400).json({ error: thumb.error.message });

    return res.status(200).json({
      heroUrl: hero.data.signedUrl,
      heroPath,
      thumbUrl: thumb.data.signedUrl,
      thumbPath,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
}
