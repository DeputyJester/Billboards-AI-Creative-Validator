import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "../../../lib/supabaseadmin";
import { logAudit } from "../../../lib/audit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    try {
        const { token, signaturePayload } = req.body ?? {};
        if (!token) return res.status(400).json({ error: "Missing token" });

        // find signer
        const { data: signer, error: sErr } = await supabaseAdmin
            .from("contract_signers")
            .select("id, role, email, contract_id")
            .eq("token", token)
            .single();
        if (sErr || !signer) return res.status(404).json({ error: "Invalid token" });

        // mark signed
        const ip = (req.headers["x-forwarded-for"] as string) || null;
        const ua = (req.headers["user-agent"] as string) || null;
        const { error: uErr } = await supabaseAdmin
            .from("contract_signers")
            .update({ signed_at: new Date().toISOString(), signed_ip: ip, signed_user_agent: ua })
            .eq("id", signer.id);
        if (uErr) throw uErr;

        // load contract + org + other signers
        const { data: contract, error: cErr } = await supabaseAdmin
            .from("contracts")
            .select("id, organization_id, status, contract_number")
            .eq("id", signer.contract_id)
            .single();
        if (cErr) throw cErr;

        const { data: allSigners, error: aErr } = await supabaseAdmin
            .from("contract_signers")
            .select("id, role, signed_at")
            .eq("contract_id", signer.contract_id);
        if (aErr) throw aErr;

        // if all signers have signed -> bump status
        const allDone = (allSigners || []).every((s) => !!s.signed_at);
        if (allDone) {
            await supabaseAdmin.from("contracts").update({ status: "signed" }).eq("id", signer.contract_id);
            // OPTIONAL: auto-create campaign + client_invite here. (Can be toggled with an env variable.)
            // await autoCreateCampaignAndInvite({ contractId: signer.contract_id });
            await logAudit({
                organization_id: contract.organization_id,
                event_kind: "contract",
                event: "contract.signed",
                actor_role: signer.role,
                actor_email: signer.email,
                contract_id: signer.contract_id,
                context: { signaturePayload: signaturePayload ?? null },
                ip, user_agent: ua,
            });
        } else {
            await logAudit({
                organization_id: contract.organization_id,
                event_kind: "contract",
                event: "contract.partial_signed",
                actor_role: signer.role,
                actor_email: signer.email,
                contract_id: signer.contract_id,
                context: { signaturePayload: signaturePayload ?? null },
                ip, user_agent: ua,
            });
        }

        return res.status(200).json({ ok: true, status: allDone ? "signed" : "pending" });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ error: e.message || "Internal error" });
    }
}
