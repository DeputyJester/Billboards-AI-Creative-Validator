import { supabaseAdmin } from "./supabaseadmin";

export async function logAudit(params: {
    organization_id: string;
    event_kind: string; // e.g., "contract" 
    event: string;      // e.g., "contract.created"
    actor_user_id?: string | null;
    actor_email?: string | null;
    actor_role?: "staff" | "client";
    contract_id?: string | null;
    campaign_id?: string | null;
    context?: Record<string, any>;
    ip?: string | null;
    user_agent?: string | null;
}) {
    const { error } = await supabaseAdmin.from("audit_events").insert({
        organization_id: params.organization_id,
        event_kind: params.event_kind,
        event: params.event,
        actor_user_id: params.actor_user_id ?? null,
        actor_email: params.actor_email ?? null,
        actor_role: params.actor_role ?? null,
        contract_id: params.contract_id ?? null,
        campaign_id: params.campaign_id ?? null,
        context: params.context ?? null,
        ip: params.ip ?? null,
        user_agent: params.user_agent ?? null,
    });
    if (error) console.error("audit insert error:", error);
}
