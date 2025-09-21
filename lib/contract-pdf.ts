// file: lib/contract-pdf.ts
// purpose: render a contract PDF and return it as a Buffer

import PDFDocument from "pdfkit";

export type Contract = {
    id: string;
    organization_id: string;
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

export type Item = {
    id: string;
    description: string | null;
    market: string | null;
    format: string | null;
    width_display: string | null;
    height_display: string | null;
    face_direction: string | null;
    geopath_id: string | null;
    qty: number | null;
    unit_price: number | null;
    cycles: number | null;
    cycle_start: string | null;
    cycle_end: string | null;

    board_number?: string | null;
    board_name?: string | null;
    ["board-name"]?: string | null;
    name?: string | null;

    [key: string]: any;
};

export type Org = { id: string; name?: string | null };
export type Terms = { content: string; version?: number | null; effective_date?: string | null };
export type PartyInfo = { name?: string | null; email?: string | null; company?: string | null };
export type Brand = { logoPath?: string; brandName?: string };

type RenderInput = {
    contract: Contract;
    items: Item[];
    org?: Org;
    terms?: Terms | null;
    buyer?: PartyInfo;
    seller?: PartyInfo;
    brand?: Brand;
};

// ---------- utils ----------
function money(n?: number | null) {
    const v = typeof n === "number" ? n : 0;
    return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function fmtDate(iso?: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
}
function faceAbbrev(s?: string | null) {
    if (!s) return "—";
    const t = s.trim().toUpperCase();
    const map: Record<string, string> = {
        N: "N",
        S: "S",
        E: "E",
        W: "W",
        NORTH: "N",
        SOUTH: "S",
        EAST: "E",
        WEST: "W",
        NORTHEAST: "NE",
        NORTHWEST: "NW",
        SOUTHEAST: "SE",
        SOUTHWEST: "SW",
        NE: "NE",
        NW: "NW",
        SE: "SE",
        SW: "SW",
    };
    return map[t] || t.slice(0, 3);
}
// Media cost = unit_price × qty
function lineTotal(it: Item): number {
    const qty = Number.isFinite(it.qty as any) ? (it.qty as number) : 1;
    const unit = Number.isFinite(it.unit_price as any) ? (it.unit_price as number) : 0;
    return qty * unit;
}
function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        doc.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        doc.end();
    });
}

// ---------- drawing helpers ----------
function centeredHeading(
    doc: PDFKit.PDFDocument,
    text: string,
    y: number,
    opts?: { size?: number; color?: string }
) {
    const { width, margins } = doc.page;
    const w = width - margins.left - margins.right;
    doc
        .font("Helvetica-Bold")
        .fontSize(opts?.size ?? 16)
        .fillColor(opts?.color ?? "#111111")
        .text(text, margins.left, y, { width: w, align: "center" })
        .fillColor("#111111");
    return doc.y;
}

function kv(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    x: number,
    y: number,
    wLabel: number,
    wValue: number,
    lineGap = 2
) {
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(label, x, y, { width: wLabel, align: "left" });
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#111").text(value || "—", x + wLabel + 6, y, {
        width: wValue,
        align: "left",
    });
    const hLabel = doc.heightOfString(label, { width: wLabel, align: "left" });
    const hValue = doc.heightOfString(value || "—", { width: wValue, align: "left" });
    const lineH = Math.max(14, hLabel, hValue);
    return y + lineH + lineGap;
}
function measureKvHeight(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    wLabel: number,
    wValue: number,
    lineGap = 2
) {
    doc.font("Helvetica").fontSize(9);
    const hLabel = doc.heightOfString(label, { width: wLabel, align: "left" });
    doc.font("Helvetica-Bold").fontSize(9);
    const hValue = doc.heightOfString(value || "—", { width: wValue, align: "left" });
    return Math.max(14, hLabel, hValue) + lineGap;
}

// stacked key/value: label above value, full width (good for long text)
function kvStack(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
    lineGap = 6
) {
    doc.font("Helvetica").fontSize(8).fillColor("#6b7280").text(label, x, y, { width, align: "left" });
    const h1 = doc.heightOfString(label, { width, align: "left" });
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111").text(value || "—", x, y + h1 + 1, {
        width,
        align: "left",
    });
    const h2 = doc.heightOfString(value || "—", { width, align: "left" });
    return y + h1 + h2 + lineGap;
}
function measureKvStackHeight(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    width: number,
    lineGap = 6
) {
    doc.font("Helvetica").fontSize(8);
    const h1 = doc.heightOfString(label, { width, align: "left" });
    doc.font("Helvetica-Bold").fontSize(10);
    const h2 = doc.heightOfString(value || "—", { width, align: "left" });
    return h1 + h2 + lineGap;
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string, x: number, y: number, w: number) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#1f2937").text(text, x, y, { width: w, align: "left" }).fillColor("#111");
    return doc.y + 6;
}
function drawBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    opts?: { fill?: string | null; stroke?: string; radius?: number }
) {
    const r = opts?.radius ?? 8;
    if (opts?.fill) {
        doc.save().roundedRect(x, y, w, h, r).fill(opts.fill).restore();
    }
    doc.save().roundedRect(x, y, w, h, r).lineWidth(0.8).strokeColor(opts?.stroke ?? "#e5e7eb").stroke().restore();
}
function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number, y: number, marginBottom = 36) {
    const usableBottom = doc.page.height - marginBottom;
    if (y + requiredHeight <= usableBottom) return y;
    doc.addPage();
    return doc.page.margins.top;
}

// ---------- renderer ----------
export async function renderContractPdf({
    contract,
    items,
    org,
    terms,
    buyer,
    seller,
    brand,
}: RenderInput): Promise<Buffer> {
    const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 54, left: 54, right: 54, bottom: 54 },
        autoFirstPage: true,
    });

    const { width, margins } = doc.page;
    const contentW = width - margins.left - margins.right;
    let y = margins.top;

    const twoColW = (contentW - 16) / 2;

    // Logo centered
    if (brand?.logoPath) {
        try {
            const displayW = 180;
            const x = margins.left + (contentW - displayW) / 2;
            doc.image(brand.logoPath, x, y, { width: displayW });
            y += 48;
        } catch {
            y = centeredHeading(doc, brand?.brandName || org?.name || "OOH LOOP", y, { size: 16 });
            y += 8;
        }
    } else {
        y = centeredHeading(doc, brand?.brandName || org?.name || "OOH LOOP", y, { size: 16 });
        y += 8;
    }

    // Title
    y = centeredHeading(doc, "Media Purchasing Agreement", y, { size: 18 });
    y += 10;

    // Contract meta (two columns, no "Contract" header label)
    const metaColW = contentW / 2 - 8;
    const metaX1 = margins.left;
    const metaX2 = metaX1 + metaColW + 16;

    let yMetaLeft = y;
    yMetaLeft = kv(doc, "Contract #", contract.contract_number ?? "—", metaX1, yMetaLeft, 90, metaColW - 96);
    yMetaLeft = kv(doc, "Name", contract.name ?? "—", metaX1, yMetaLeft, 90, metaColW - 96);
    yMetaLeft = kv(doc, "Created", fmtDate(contract.created_at), metaX1, yMetaLeft, 90, metaColW - 96);
    yMetaLeft = kv(doc, "Period", `${fmtDate(contract.start_date)} – ${fmtDate(contract.end_date)}`, metaX1, yMetaLeft, 90, metaColW - 96);

    let yMetaRight = y;
    yMetaRight = kv(doc, "Company", org?.name || "—", metaX2, yMetaRight, 90, metaColW - 96);
    yMetaRight = kv(doc, "Status", contract.status, metaX2, yMetaRight, 90, metaColW - 96);

    y = Math.max(yMetaLeft, yMetaRight) + 10;

    // Buyer / Seller info boxes (same height)
    const leftX = margins.left;
    const rightX = leftX + twoColW + 16;

    const boxTopPad = 10;
    const boxBottomPad = 12;
    const innerW = twoColW - 24;

    const buyerContentH =
        measureKvStackHeight(doc, "Company", buyer?.company || "—", innerW) +
        measureKvStackHeight(doc, "Name", buyer?.name || "—", innerW) +
        measureKvStackHeight(doc, "Email", buyer?.email || "—", innerW);

    const sellerContentH =
        measureKvStackHeight(doc, "Company", seller?.company || "—", innerW) +
        measureKvStackHeight(doc, "Name", seller?.name || "—", innerW) +
        measureKvStackHeight(doc, "Email", seller?.email || "—", innerW);

    const titleH = doc.font("Helvetica-Bold").fontSize(11).heightOfString("X", { width: innerW });
    const buyerBoxH = boxTopPad + titleH + 6 + buyerContentH + boxBottomPad;
    const sellerBoxH = boxTopPad + titleH + 6 + sellerContentH + boxBottomPad;
    const boxH = Math.max(buyerBoxH, sellerBoxH);

    y = ensureSpace(doc, boxH, y);

    drawBox(doc, leftX, y, twoColW, boxH, { fill: "#f8fafc", stroke: "#e5e7eb", radius: 10 });
    drawBox(doc, rightX, y, twoColW, boxH, { fill: "#f8fafc", stroke: "#e5e7eb", radius: 10 });

    // Buyer (stacked)
    let yB = y + boxTopPad;
    yB = sectionTitle(doc, "Media Buyer Information", leftX + 12, yB, innerW);
    yB += 4;
    yB = kvStack(doc, "Company", buyer?.company || "—", leftX + 12, yB, innerW);
    yB = kvStack(doc, "Name", buyer?.name || "—", leftX + 12, yB, innerW);
    yB = kvStack(doc, "Email", buyer?.email || "—", leftX + 12, yB, innerW);

    // Seller (stacked)
    let yS = y + boxTopPad;
    yS = sectionTitle(doc, "Media Seller Information", rightX + 12, yS, innerW);
    yS += 4;
    yS = kvStack(doc, "Company", seller?.company || "—", rightX + 12, yS, innerW);
    yS = kvStack(doc, "Name", seller?.name || "—", rightX + 12, yS, innerW);
    yS = kvStack(doc, "Email", seller?.email || "—", rightX + 12, yS, innerW);

    y = y + boxH + 16;

    // Inventory heading
    y = centeredHeading(doc, "Board Inventory Information", y, { size: 14 });
    y += 6;

    // tiles
    const tilePadTop = 12;
    const tilePadBottom = 20;
    const tileGap = 12;
    const tileW = contentW;
    const leftLabelW = 90;
    const leftValueW = tileW / 2 - leftLabelW - tilePadTop * 2 - 10;
    const rightColX = margins.left + tileW / 2 + 6;
    const rightLabelW = 96;
    const rightValueW = tileW / 2 - rightLabelW - tilePadTop * 2 - 6;

    items.forEach((it, idx) => {
        // header prefers location; then desc; then names; etc.
        const headerText =
            (it as any).location ||
            it.description ||
            it.board_name ||
            it["board-name"] ||
            it.board_number ||
            it.name ||
            it.geopath_id ||
            "Board";

        const boardDisplay =
            it.board_number ??
            it.board_name ??
            it["board-name"] ??
            it.description ??
            it.name ??
            it.geopath_id ??
            "—";

        doc.font("Helvetica-Bold").fontSize(10);
        const headerH = doc.heightOfString(headerText, { width: tileW - tilePadTop * 2 });

        const sizeFeet =
            it.width_display && it.height_display ? `${it.width_display} × ${it.height_display}` : "—";

        // left heights
        const leftHeights = [
            measureKvHeight(doc, "Board #", String(boardDisplay), leftLabelW, leftValueW),
            measureKvHeight(doc, "Geopath ID", it.geopath_id || "—", leftLabelW, leftValueW),
            measureKvHeight(doc, "Format", it.format || "—", leftLabelW, leftValueW),
            measureKvHeight(doc, "Market", it.market || "—", leftLabelW, leftValueW),
            measureKvHeight(doc, "Size (ft)", sizeFeet, leftLabelW, leftValueW),
            measureKvHeight(doc, "Face", faceAbbrev(it.face_direction), leftLabelW, leftValueW),
        ];
        const leftSum = leftHeights.reduce((a, b) => a + b, 0);

        // right heights
        const rightHeights = [
            measureKvHeight(doc, "Cycle start", fmtDate(it.cycle_start), rightLabelW, rightValueW),
            measureKvHeight(doc, "Cycle end", fmtDate(it.cycle_end), rightLabelW, rightValueW),
            measureKvHeight(doc, "# of cycles", String(it.cycles ?? "—"), rightLabelW, rightValueW),
            measureKvHeight(doc, "Units", String(it.qty ?? "—"), rightLabelW, rightValueW),
            measureKvHeight(doc, "Media cost", money(lineTotal(it)), rightLabelW, rightValueW),
        ];
        const rightSum = rightHeights.reduce((a, b) => a + b, 0);

        const bodyH = Math.max(leftSum, rightSum);
        const tileH = tilePadTop + headerH + 8 + bodyH + 6 + tilePadBottom;

        y = ensureSpace(doc, tileH, y);

        const fill = idx % 2 === 0 ? "#f9fafb" : "#ffffff";
        drawBox(doc, margins.left, y, tileW, tileH, { fill, stroke: "#e5e7eb", radius: 10 });

        // header
        let yIn = y + tilePadTop;
        doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor("#111")
            .text(headerText, margins.left + tilePadTop, yIn, {
                width: tileW - tilePadTop * 2,
                align: "left",
            });
        yIn += headerH + 8;

        // left column
        const leftXIn = margins.left + tilePadTop;
        let yL = yIn;
        yL = kv(doc, "Board #", String(boardDisplay), leftXIn, yL, leftLabelW, leftValueW);
        yL = kv(doc, "Geopath ID", it.geopath_id || "—", leftXIn, yL, leftLabelW, leftValueW);
        yL = kv(doc, "Format", it.format || "—", leftXIn, yL, leftLabelW, leftValueW);
        yL = kv(doc, "Market", it.market || "—", leftXIn, yL, leftLabelW, leftValueW);
        yL = kv(doc, "Size (ft)", sizeFeet, leftXIn, yL, leftLabelW, leftValueW);
        yL = kv(doc, "Face", faceAbbrev(it.face_direction), leftXIn, yL, leftLabelW, leftValueW);

        // right column
        let yR = yIn;
        yR = kv(doc, "Cycle start", fmtDate(it.cycle_start), rightColX, yR, rightLabelW, rightValueW);
        yR = kv(doc, "Cycle end", fmtDate(it.cycle_end), rightColX, yR, rightLabelW, rightValueW);
        yR = kv(doc, "# of cycles", String(it.cycles ?? "—"), rightColX, yR, rightLabelW, rightValueW);
        yR = kv(doc, "Units", String(it.qty ?? "—"), rightColX, yR, rightLabelW, rightValueW);
        yR = kv(doc, "Media cost", money(lineTotal(it)), rightColX, yR, rightLabelW, rightValueW);

        // subtle separator
        const yBottom = Math.max(yL, yR) + 6;
        doc
            .save()
            .moveTo(margins.left + 8, yBottom)
            .lineTo(margins.left + tileW - 8, yBottom)
            .lineWidth(0.4)
            .strokeColor("#e5e7eb")
            .stroke()
            .restore();

        y = y + tileH + tileGap;
    });

    // Totals
    const computedSubtotal = items.reduce((sum, it) => sum + lineTotal(it), 0);
    const subtotal = typeof contract.subtotal === "number" ? contract.subtotal : computedSubtotal;
    const tax = typeof contract.tax === "number" ? contract.tax : 0;
    const total = typeof contract.total === "number" ? contract.total : subtotal + tax;

    const totalsH = 88;
    y = ensureSpace(doc, totalsH + 16, y);
    drawBox(doc, margins.left, y, contentW, totalsH, { fill: "#ffffff", stroke: "#e5e7eb", radius: 10 });
    let yT = y + 12;
    yT = sectionTitle(doc, "Totals", margins.left + 12, yT, contentW - 24);
    yT += 2;
    const totalsLabelW = 80;
    const totalsValueW = contentW - 24 - totalsLabelW - 6;
    yT = kv(doc, "Subtotal", money(subtotal), margins.left + 12, yT, totalsLabelW, totalsValueW);
    yT = kv(doc, "Tax", money(tax), margins.left + 12, yT, totalsLabelW, totalsValueW);
    yT = kv(doc, "Total", money(total), margins.left + 12, yT, totalsLabelW, totalsValueW);
    y = y + totalsH + 12;

    // Terms
    y = centeredHeading(doc, "Terms of Service", y, { size: 13 });
    y += 6;

    const termsText =
        terms?.content ||
        "These terms govern this Media Purchasing Agreement. Replace this placeholder with your organization’s active Terms of Service configured in the admin panel.";
    const paraOpts = { width: contentW, align: "left" as const };
    const paragraphs = termsText.split(/\n{2,}/g);
    paragraphs.forEach((p) => {
        const est = Math.max(40, Math.ceil(p.length / 4));
        y = ensureSpace(doc, est, y, 54);
        doc.font("Helvetica").fontSize(10).fillColor("#222").text(p, margins.left, y, paraOpts);
        y = doc.y + 8;
    });

    // ---------- Signatures (auto-height & symmetric) ----------
    const sigTopPad = 12;
    const sigBottomPad = 14;
    const sigInnerW = twoColW - 24;

    // measure title (approx height)
    const sigTitleH = doc.font("Helvetica-Bold").fontSize(11).heightOfString("X", { width: sigInnerW });

    // measure stacked content on each side
    const leftStackH =
        measureKvStackHeight(doc, "Company", buyer?.company || "—", sigInnerW) +
        measureKvStackHeight(doc, "Name", buyer?.name || "—", sigInnerW) +
        measureKvStackHeight(doc, "Email", buyer?.email || "—", sigInnerW);

    const rightStackH =
        measureKvStackHeight(doc, "Company", seller?.company || "—", sigInnerW) +
        measureKvStackHeight(doc, "Name", seller?.name || "—", sigInnerW) +
        measureKvStackHeight(doc, "Email", seller?.email || "—", sigInnerW);

    // reserve space at bottom for signature line + token text
    const signatureZoneH = 36; // bump if needed

    const leftSigBoxH = sigTopPad + sigTitleH + 4 + leftStackH + signatureZoneH + sigBottomPad;
    const rightSigBoxH = sigTopPad + sigTitleH + 4 + rightStackH + signatureZoneH + sigBottomPad;
    const sigH = Math.max(leftSigBoxH, rightSigBoxH);

    y = ensureSpace(doc, sigH + 10, y);

    const leftSigX = margins.left;
    const rightSigX = leftSigX + twoColW + 16;

    drawBox(doc, leftSigX, y, twoColW, sigH, { fill: "#ffffff", stroke: "#e5e7eb", radius: 10 });
    drawBox(doc, rightSigX, y, twoColW, sigH, { fill: "#ffffff", stroke: "#e5e7eb", radius: 10 });

    // Buyer box
    let ySigL = y + sigTopPad;
    ySigL = sectionTitle(doc, "Media Buyer", leftSigX + 12, ySigL, sigInnerW);
    ySigL += 2;
    ySigL = kvStack(doc, "Company", buyer?.company || "—", leftSigX + 12, ySigL, sigInnerW);
    ySigL = kvStack(doc, "Name", buyer?.name || "—", leftSigX + 12, ySigL, sigInnerW);
    ySigL = kvStack(doc, "Email", buyer?.email || "—", leftSigX + 12, ySigL, sigInnerW);

    // signature line near bottom (kept inside box)
    const ySigLineL = y + sigH - sigBottomPad - 12;
    doc
        .save()
        .moveTo(leftSigX + 12, ySigLineL)
        .lineTo(leftSigX + twoColW - 12, ySigLineL)
        .lineWidth(0.6)
        .strokeColor("#d1d5db")
        .stroke()
        .restore();
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#6b7280").text("{{SIGNATURE_BUYER}}", leftSigX + 12, ySigLineL - 14);
    doc.fillColor("#111");

    // Documenso date field just below the signature line
    const yDate = ySigLineL + 6; // a little spacing below the line
    doc.font("Helvetica").fontSize(9).fillColor("#111").text("Date:", leftSigX + 12, yDate);
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#6b7280").text("{{DATE_BUYER}}", leftSigX + 48, yDate);
    doc.fillColor("#111");


    // Seller box (no signature)
    let ySigR = y + sigTopPad;
    ySigR = sectionTitle(doc, "Media Seller", rightSigX + 12, ySigR, sigInnerW);
    ySigR += 2;
    ySigR = kvStack(doc, "Company", seller?.company || "—", rightSigX + 12, ySigR, sigInnerW);
    ySigR = kvStack(doc, "Name", seller?.name || "—", rightSigX + 12, ySigR, sigInnerW);
    ySigR = kvStack(doc, "Email", seller?.email || "—", rightSigX + 12, ySigR, sigInnerW);

    return await docToBuffer(doc);
}
