// pages/api/webhooks/_ping.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    res.json({ ok: true, where: "/api/webhooks/_ping", method: req.method });
}
