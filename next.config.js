/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = nextConfig

// next.config.js
module.exports = {
    async headers() {
        return [
            {
                // client upload page (no token leaked to third parties)
                source: "/client/:token",
                headers: [
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    // If you want to be even stricter:
                    // { key: "Referrer-Policy", value: "no-referrer" },
                    { key: "Cache-Control", value: "no-store" },
                ],
            },
            {
                // token-based APIs: never cache
                source: "/api/client-resolve-token",
                headers: [{ key: "Cache-Control", value: "no-store, private" }],
            },
            {
                source: "/api/client-upload-url",
                headers: [{ key: "Cache-Control", value: "no-store, private" }],
            },
            {
                source: "/api/client-upload-complete",
                headers: [{ key: "Cache-Control", value: "no-store, private" }],
            },
        ];
    },
};


