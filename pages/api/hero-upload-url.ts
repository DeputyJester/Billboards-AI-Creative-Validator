// pages/api/boards/hero-upload-url.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
const supabase = createPagesServerClient({ req, res });


try {
const { boardId, orgId, heroName = "hero.webp", thumbName = "thumb.webp" } = req.body || {};
if (!boardId || !orgId) return res.status(400).json({ error: "Missing boardId or orgId" });


// Validate user session
const { data: { user } } = await supabase.auth.getUser();
if (!user) return res.status(401).json({ error: "Unauthorized" });


// Ensure board belongs to org and user belongs to same org
const { data: profile } = await supabase
.from("user_profiles")
.select("organization_id")
.eq("user_id", user.id)
.single();
if (!profile || profile.organization_id !== orgId) return res.status(403).json({ error: "Forbidden" });


const { data: board } = await supabase
.from("boards")
.select("id, organization_id")
.eq("id", boardId)
.single();
if (!board || board.organization_id !== orgId) return res.status(403).json({ error: "Forbidden" });


const heroPath = `org_${orgId}/boards/${boardId}/${heroName}`;
const thumbPath = `org_${orgId}/boards/${boardId}/${thumbName}`;


const hero = await supabase.storage.from("board-photos").createSignedUploadUrl(heroPath);
if (hero.error) return res.status(400).json({ error: hero.error.message });


const thumb = await supabase.storage.from("board-photos").createSignedUploadUrl(thumbPath);
if (thumb.error) return res.status(400).json({ error: thumb.error.message });


return res.status(200).json({ heroUrl: hero.data.signedUrl, heroPath, thumbUrl: thumb.data.signedUrl, thumbPath });
} catch (e: any) {
return res.status(500).json({ error: e.message });
}
}