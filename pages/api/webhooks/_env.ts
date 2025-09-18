import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
    const val = process.env.DOCUMENSO_WEBHOOK_SECRET || "";
    res.json({
        has: !!val,
        length: val.length,          // lets us compare lengths without revealing it
        preview: val ? val.slice(0, 4) + "..." : ""  // mild sanity check
    });
}
