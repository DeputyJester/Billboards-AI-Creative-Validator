import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";

/**
 * Resolves a client signing token to contract + signer info.
 * Works with BOTH new `documenso_signing_token` and legacy `token`.
 * Returns minimal info needed by /contracts/token.tsx to render the embed.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const tok = String(req.query.token || "").trim();
    if (!tok) return res.status(400).json({ error: "Missing token" });

    try {
        // 1) Try new column first: documenso_signing_token
        let { data: signer, error: sErr } = await supabaseAdmin
            .from("contract_signers")
            .select("id, contract_id, role, name, email, token, documenso_signing_token, documenso_signing_url")
            .eq("documenso_signing_token", tok)
            .maybeSingle();

        // 2) Fallback to legacy column: token
        if (!signer || sErr) {
            const q2 = await supabaseAdmin
                .from("contract_signers")
                .select("id, contract_id, role, name, email, token, documenso_signing_token, documenso_signing_url")
                .eq("token", tok)
                .maybeSingle();
            signer = q2.data ?? null;
            sErr = q2.error ?? null;
        }

        if (sErr) {
            console.error("by-token signer error:", sErr);
            return res.status(500).json({ error: "Signer lookup failed" });
        }
        if (!signer) {
            return res.status(400).json({ error: "Invalid token" });
        }

        // 3) Load minimal contract info (doc id is helpful, but not required for the embed)
        const { data: contract, error: cErr } = await supabaseAdmin
            .from("contracts")
            .select("id, contract_number, documenso_document_id")
            .eq("id", signer.contract_id)
            .maybeSingle();
        if (cErr) {
            console.error("by-token contract error:", cErr);
            return res.status(500).json({ error: "Contract lookup failed" });
        }
        if (!contract) {
            return res.status(404).json({ error: "Contract not found" });
        }

        // 4) Build response
        const resolvedToken = signer.documenso_signing_token || signer.token || null;
        const signingUrl = signer.documenso_signing_url || null;

        return res.status(200).json({
            ok: true,
            contract_id: contract.id,
            contract_number: contract.contract_number,
            documenso_document_id: contract.documenso_document_id ?? null,
            signer: {
                role: signer.role,
                name: signer.name,
                email: signer.email,
            },
            // client can use either a known embed origin + token, or a prebuilt signingUrl if present
            token: resolvedToken,
            signingUrl,
            embedOrigin: process.env.NEXT_PUBLIC_DOCUMENSO_EMBED_ORIGIN || null,
        });
    } catch (e: any) {
        console.error("by-token unexpected error:", e);
        return res.status(500).json({ error: "Internal error" });
    }
}
