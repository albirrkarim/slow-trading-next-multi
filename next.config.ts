import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    output: "standalone",

    outputFileTracingExcludes: {
        "/*": [
            "./storage/**/*",
        ],
        "/api/agent/gainer/persistent-sync-all": [
            "./FEATURES.md",
            "./README.md",
            "./docs/**/*",
            "./next.config.ts",
            "./package.json",
            "./package-lock.json",
            "./src/**/*",
            "./storage/**/*",
        ],
        "next-server": [
            "./storage/**/*",
        ],
    },

    reactStrictMode: false,

    productionBrowserSourceMaps: false,

    poweredByHeader: false,

    turbopack: {
        root: __dirname,
    },
};

export default nextConfig;
