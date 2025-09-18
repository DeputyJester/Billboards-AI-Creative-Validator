import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";

type PartyRow = {
    id: string;
    role: string | null;
    email: string | null;
    documenso_signing_token?: string | null;
    documenso_signing_url?: string | null;
};

async function getClientParty(contractId: string) {
    // Try contract_parties first (our new schema)
    let { data, error } = await supabaseAdmin
        .from("contract_parties")
        .select("id, role, email, documenso_signing_token, documenso_signing_url")
        .eq("contract_id", contractId)
        .eq("role", "client")
        .maybeSingle();

    if (error && String(error.message || "").toLowerCase().includes("relation")) {
        // Fallback: some projects used contract_signers table name
        const fallback = await supabaseAdmin
            .from("contract_signers")
            .select("id, role, email, documenso_signing_token, documenso_signing_url")
            .eq("contract_id", contractId)
            .eq("role", "client")
            .maybeSingle();
        data = fallback.data as any;
        error = fallback.error as any;
    }

    return { data: data as PartyRow | null, error };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const contractId = String(req.query.id || "").trim();
    if (!contractId) return res.status(400).json({ error: "Missing contract id" });

    try {
        const { data: party, error } = await getClientParty(contractId);
        if (error) return res.status(500).json({ error: "DB error", detail: error });

        if (!party) {
            return res.status(404).json({ error: "Client party not found for this contract" });
        }

        // If the Documenso columns exist but no token yet, the contract wasn't prepared.
        if (!("documenso_signing_token" in party)) {
            return res.status(422).json({
                error: "Schema missing Documenso columns",
                hint: "Run the ALTER TABLE migration to add documenso_signing_token and documenso_signing_url.",
            });
        }

        if (!party.documenso_signing_token) {
            return res.status(409).json({
                error: "Not prepared",
                hint: "Call POST /api/contracts/:id/prepare to create the Documenso document and store the token.",
            });
        }

        return res.json({
            ok: true,
            token: party.documenso_signing_token,
            signingUrl: party.documenso_signing_url || null,
        });
    } catch (e: any) {
        console.error("sign-info fatal:", e);
        return res.status(500).json({ error: "Internal error", detail: e?.message || String(e) });
    }
}
