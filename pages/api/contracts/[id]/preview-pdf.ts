// purpose: generate a contract preview PDF for a given contract id
// GET /api/contracts/:id/preview-pdf

import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseadmin";
import { renderContractPdf } from "@/lib/contract-pdf"; // returns Buffer
import fs from "fs";
import path from "path";

type Contract = {
    id: string;
    organization_id: string;
    customer_id: string | null;
    contract_number: string | null;
    name: string | null;
    description: string | null;
    status: string;
    subtotal: number | null;
    tax: number | null;
    total: number | null;
    start_date: string | null;
    end_date: string | null;
    created_at: string;
};

type Item = {
    id: string;
    // IMPORTANT: include board_id and (we’ll attach) location
    board_id?: string | null;
    location?: string | null;

    description: string | null;
    market: string | null;
    format: string | null;
    width_display: string | null;
    height_display: string | null;
    face_direction: string | null;
    geopath_id: string | null;
    qty: number | null;
    unit_price: number | null;
    copy_changes: number | null;
    cycles: number | null;
    cycle_start: string | null;
    cycle_end: string | null;

    board_number?: string | null;
    board_name?: string | null;
    ["board-name"]?: string | null;
    name?: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const id = String(req.query.id || "");
    if (!id) return res.status(400).json({ error: "missing id" });

    try {
        // 1) contract
        const { data: contract, error: cErr } = await supabaseAdmin
            .from("contracts")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (cErr) return res.status(500).json({ error: "db error (contract)", details: cErr.message });
        if (!contract) return res.status(404).json({ error: "contract not found" });

        // 2) items (include board_id so we can fetch the board's location)
        const { data: rawItems, error: iErr } = await supabaseAdmin
            .from("contract_items")
            .select("*") // assumes contract_items has a board_id column
            .eq("contract_id", id);

        if (iErr) return res.status(500).json({ error: "db error (items)", details: iErr.message });

        let items: Item[] = (rawItems ?? []) as Item[];

        // —— Inject board.location for reliable header text ——
        // Collect distinct board_ids
        const boardIds = Array.from(
            new Set(items.map((it) => it.board_id).filter((v): v is string => !!v))
        );

        if (boardIds.length > 0) {
            // Fetch locations for those boards
            const { data: boardsRows, error: bErr } = await supabaseAdmin
                .from("boards")
                .select("id,location")
                .in("id", boardIds);

            if (!bErr && Array.isArray(boardsRows)) {
                const locMap = new Map<string, string | null>();
                boardsRows.forEach((b: any) => locMap.set(b.id, b.location ?? null));

                // Attach location to each item (fallback to existing description if no board location found)
                items = items.map((it) => ({
                    ...it,
                    location: (it.board_id && locMap.get(it.board_id)) || it.location || it.description || null,
                }));
            }
        }

        // 3) org (optional niceties)
        let org: { id: string; name?: string | null } = { id: contract.organization_id };
        try {
            const { data: orgRow } = await supabaseAdmin
                .from("organizations")
                .select("id,name")
                .eq("id", contract.organization_id)
                .maybeSingle();
            if (orgRow) org = orgRow as any;
        } catch {
            /* ignore */
        }

        // 4) terms (optional)
        let terms: { content: string; version?: number | null; effective_date?: string | null } | null = null;
        try {
            const { data: t } = await supabaseAdmin
                .from("org_terms")
                .select("content,version,effective_date,active")
                .eq("org_id", contract.organization_id)
                .eq("active", true)
                .order("version", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (t?.content) terms = { content: t.content, version: t.version ?? null, effective_date: t.effective_date ?? null };
        } catch {
            /* ignore */
        }

        // 5) BUYER/SELLER: name/email from contract_signers; company from contract_parties/customers/org
        let buyer: { name?: string | null; email?: string | null; company?: string | null } = {};
        let seller: { name?: string | null; email?: string | null; company?: string | null } = {};

        try {
            const { data: signers } = await supabaseAdmin
                .from("contract_signers")
                .select("role,name,email")
                .eq("contract_id", id);

            if (Array.isArray(signers)) {
                const sBuyer = signers.find((s: any) => s.role === "client");
                const sSeller = signers.find((s: any) => s.role === "staff") || signers.find((s: any) => s.role !== "client");

                if (sBuyer) buyer = { ...buyer, name: sBuyer.name ?? null, email: sBuyer.email ?? null };
                if (sSeller) seller = { ...seller, name: sSeller.name ?? null, email: sSeller.email ?? null };
            }
        } catch {
            /* ignore */
        }

        // Try contract_parties for company names
        try {
            const { data: parties } = await supabaseAdmin
                .from("contract_parties")
                .select("role,company")
                .eq("contract_id", id);

            if (Array.isArray(parties)) {
                const pBuyer = parties.find((p: any) => p.role === "client");
                const pSeller = parties.find((p: any) => p.role === "staff") || parties.find((p: any) => p.role !== "client");
                if (pBuyer?.company) buyer.company = pBuyer.company;
                if (pSeller?.company) seller.company = pSeller.company;
            }
        } catch {
            /* ignore */
        }

        // Fallback buyer company from customer record if not set
        if (!buyer.company && contract.customer_id) {
            try {
                const { data: cust } = await supabaseAdmin
                    .from("customers")
                    .select("company,name")
                    .eq("id", contract.customer_id)
                    .maybeSingle();
                buyer.company = cust?.company || cust?.name || buyer.company || null;
            } catch {
                /* ignore */
            }
        }

        // Fallback seller company = org name
        if (!seller.company) seller.company = org.name || null;

        // 6) BRAND: pick a PNG/JPG from /public so PDFKit can render it.
        const publicDir = path.join(process.cwd(), "public");
        const logoCandidates = [
            path.join(publicDir, "brand", "loop-logo-dark.png"),
            path.join(publicDir, "brand", "loop-logo.png"),
            path.join(publicDir, "brand", "loop-logo-dark.jpg"),
            path.join(publicDir, "brand", "loop-logo.jpg"),
            path.join(publicDir, "loop-logo-dark.png"),
            path.join(publicDir, "logo.png"),
        ];
        const firstExisting = logoCandidates.find((p) => {
            try {
                return fs.existsSync(p);
            } catch {
                return false;
            }
        });

        const brand = {
            logoPath: firstExisting, // may be undefined; renderer falls back to text
            brandName: org.name || "OOH LOOP",
        };

        // 7) render
        const pdfBuffer = await renderContractPdf({
            contract: contract as Contract,
            items,
            org,
            terms,
            buyer,
            seller,
            brand,
        });

        // 8) respond
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'inline; filename="contract-preview.pdf"');
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(pdfBuffer);
    } catch (e: any) {
        return res.status(500).json({ error: "render failed", details: e?.message || String(e) });
    }
}
