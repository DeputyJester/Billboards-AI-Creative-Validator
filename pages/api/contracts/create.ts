// pages/api/contracts/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseadmin";

type CreateBody = {
    organizationId: string;
    customerId: string;
    name: string;
    startDate: string;
    endDate: string;
    items: Array<{
        boardId: string;
        unitPrice: number;
        qty: number;
        copyChanges: number; // additional costs
        cycles: number | null;
        description: string;
        cycleStart: string | null;
        cycleEnd: string | null;
    }>;
    signerClient: { name: string | null; email: string | null };
    signerStaff: { name: string | null; email: string | null };
    parties?: Array<{ role: string; company: string | null; contact_name: string | null; email: string | null }>;
};

// Make errors readable (PostgREST errors have code/message/details/hint)
function expose(err: any) {
    if (!err) return { message: "Unknown error" };
    const out: any = {};
    for (const k of ["message", "code", "details", "hint"]) {
        if (err[k]) out[k] = err[k];
    }
    // Fallback for generic Errors
    if (!out.message && err instanceof Error) out.message = err.message;
    return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    // Parse body safely
    let body: CreateBody | null = null;
    try {
        body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? null);
    } catch (e) {
        return res.status(400).json({ error: "Invalid JSON body" });
    }
    if (!body) return res.status(400).json({ error: "Missing body" });

    const actorUserId = (req.headers["x-user-id"] as string) || null;
    const actorEmail = (req.headers["x-user-email"] as string) || null;
    if (!actorUserId) return res.status(401).json({ error: "auth required" });

    const { organizationId, customerId, name, startDate, endDate, items, signerClient, signerStaff, parties = [] } = body;

    if (!organizationId || !customerId || !name || !startDate || !endDate || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        // 1) membership check
        {
            const { data, error } = await supabaseAdmin
                .from("user_organizations")
                .select("user_id")
                .eq("user_id", actorUserId)
                .eq("organization_id", organizationId)
                .maybeSingle();
            if (error) return res.status(500).json({ where: "user_organizations.select", error: expose(error) });
            if (!data) return res.status(403).json({ where: "user_organizations.select", error: "Not a member of this organization" });
        }

        // 2) contract number
        const { data: nextNum, error: numErr } = await supabaseAdmin.rpc("next_contract_number", { p_org: organizationId });
        if (numErr) return res.status(500).json({ where: "rpc.next_contract_number", error: expose(numErr) });
        const contract_number: string = nextNum as string;

        // 3) fetch boards to enrich line items
        const boardIds = items.map((i) => i.boardId);
        const { data: boardRows, error: bErr } = await supabaseAdmin
            .from("boards")
            .select("id,board_name,location,city,state,spec_group,board_type,width_display,height_display,face_direction,geopath_id")
            .in("id", boardIds);
        if (bErr) return res.status(500).json({ where: "boards.select", error: expose(bErr) });
        const boardMap = new Map((boardRows ?? []).map((b) => [b.id, b]));

        // 4) compute totals (DB will compute total if it's generated)
        const subtotal = items.reduce((sum, it) => sum + (it.unitPrice * it.qty) + (it.copyChanges || 0), 0);
        const tax = 0;

        // 5) insert contract header (omit generated `total`)
        const { data: cIns, error: cErr } = await supabaseAdmin
            .from("contracts")
            .insert({
                organization_id: organizationId,
                customer_id: customerId,
                contract_number,
                name,
                start_date: startDate,
                end_date: endDate,
                status: "draft",
                subtotal,
                tax,
            })
            .select("id,contract_number,subtotal,tax,total,organization_id")
            .single();
        if (cErr) return res.status(500).json({ where: "contracts.insert", error: expose(cErr) });

        const contractId = cIns!.id as string;

        // 6) insert items (includes descriptive columns)
        const itemRows = items.map((it) => {
            const b: any = boardMap.get(it.boardId) || {};
            const market = [b.city, b.state].filter(Boolean).join(", ") || null;
            const format = (b.spec_group || b.board_type || null) as string | null;
            return {
                contract_id: contractId,
                board_id: it.boardId,
                description: it.description || b.location || b.board_name || null,
                market,
                format,
                width_display: b.width_display || null,
                height_display: b.height_display || null,
                face_direction: b.face_direction || null,
                geopath_id: b.geopath_id || null,
                qty: it.qty,
                unit_price: it.unitPrice,
                cycles: it.cycles,
                cycle_start: it.cycleStart,
                cycle_end: it.cycleEnd,
                additional_costs: it.copyChanges || 0,
                net_media_cost: (it.unitPrice * it.qty) || 0,
            };
        });

        {
            const { error } = await supabaseAdmin.from("contract_items").insert(itemRows);
            if (error) return res.status(500).json({ where: "contract_items.insert", error: expose(error) });
        }

        // 7) signers
        {
            const signerRows = [
                { contract_id: contractId, role: "client", name: signerClient?.name || null, email: signerClient?.email || null, token: randomUUID() },
                { contract_id: contractId, role: "staff", name: signerStaff?.name || null, email: signerStaff?.email || null, token: randomUUID() },
            ];
            const { error } = await supabaseAdmin.from("contract_signers").insert(signerRows);
            if (error) return res.status(500).json({ where: "contract_signers.insert", error: expose(error) });
        }

        // 8) parties (optional) — if table/columns mismatch, we report but do not block creation
        if (Array.isArray(parties) && parties.length) {
            const partyRows = parties.map((p) => ({
                contract_id: contractId,
                role: p.role,
                company: p.company,
                contact_name: p.contact_name,
                email: p.email,
            }));
            const { error } = await supabaseAdmin.from("contract_parties").insert(partyRows);
            if (error) {
                // Return 200 with a warning (contract is created, but parties failed)
                return res.status(200).json({
                    id: contractId,
                    contract_number,
                    warning: { where: "contract_parties.insert", error: expose(error) },
                });
            }
        }

        // success
        return res.status(200).json({ id: contractId, contract_number });
    } catch (e: any) {
        // absolute fallback
        console.error("contracts/create fatal:", e);
        return res.status(500).json({ where: "fatal", error: expose(e) });
    }
}
