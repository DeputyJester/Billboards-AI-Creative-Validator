// lib/documenso.ts
/**
 * Centralized Documenso API client that works whether your env already includes
 * "/api/v1" or not. It also attaches the API key and JSON content headers.
 */

function resolveBase(): string {
    const raw =
        (process.env.DOCUMENSO_API_URL || process.env.DOCUMENSO_BASE_URL || "").replace(/\/+$/, "");
    if (!raw) throw new Error("Missing DOCUMENSO_API_URL or DOCUMENSO_BASE_URL");
    return raw;
}

function buildApiUrl(pathNoLeadingSlash: string): string {
    const base = resolveBase();
    const hasV1 = /\/api\/v1$/i.test(base);
    const pathClean = pathNoLeadingSlash.replace(/^\/+/, "");
    return hasV1 ? `${base}/${pathClean}` : `${base}/api/v1/${pathClean}`;
}

export async function dFetch(pathNoLeadingSlash: string, init?: RequestInit) {
    const url = buildApiUrl(pathNoLeadingSlash);
    const apiKey = process.env.DOCUMENSO_API_KEY || process.env.OCUMENSO_API_KEY || "";
    return fetch(url, {
        ...init,
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
            ...(init?.headers || {}),
        },
    });
}
