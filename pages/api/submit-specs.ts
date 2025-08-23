// pages/api/submit-specs.ts
import { NextApiRequest, NextApiResponse } from "next";
import supabase from "@/lib/supabaseclient";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { specs } = req.body;

    if (!Array.isArray(specs) || specs.length === 0) {
      return res.status(400).json({ error: "No specs provided" });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userId = user.id;

    const { data: userProfile, error: profileError } = await supabase
      .from("users")
      .select("id, organization_id")
      .eq("id", userId)
      .single();

    if (profileError || !userProfile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const organization_id = userProfile.organization_id;

    // Prepare insert payload
    const payload = specs.map((row: any) => ({
      ...row,
      organization_id,
    }));

    const { data, error } = await supabase.from("boards").insert(payload);

    if (error) {
      console.error("Insert error:", error);
      return res.status(500).json({ error: "Failed to insert specs" });
    }

    return res.status(200).json({ message: "Specs inserted successfully", inserted: data });
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Unexpected server error" });
  }
}
