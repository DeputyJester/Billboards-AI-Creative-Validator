// pages/api/boards/hero.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
const supabase = createPagesServerClient({ req, res });
const { boardId }:{ boardId?: string } = req.query as any;
if (!boardId) return res.status(400).end("Missing boardId");


// Validate session
const { data: { user } } = await supabase.auth.getUser();
if (!user) return res.redirect(302, "/img/placeholders/board.png");


// Fetch board and ensure same org
const { data: row } = await supabase
.from("boards")
.select("organization_id, hero_image_path, hero_updated_at")
.eq("id", boardId)
.single();


if (!row?.hero_image_path) return res.redirect(302, "/img/placeholders/board.png");


const { data: profile } = await supabase
.from("user_profiles")
.select("organization_id")
.eq("user_id", user.id)
.single();
if (!profile || profile.organization_id !== row.organization_id) {
return res.redirect(302, "/img/placeholders/board.png");
}


const { data, error } = await supabase
.storage
.from("board-photos")
.createSignedUrl(row.hero_image_path, 60);


if (error || !data?.signedUrl) return res.redirect(302, "/img/placeholders/board.png");


const t = row.hero_updated_at ? new Date(row.hero_updated_at).getTime() : Date.now();
return res.redirect(302, `${data.signedUrl}&t=${t}`);
}