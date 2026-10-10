import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return [
      {
        // Everything except the public call page: never indexed, never framed.
        source: "/((?!call(?:/|$)).*)",
        headers: [...common, { key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "X-Frame-Options", value: "DENY" }],
      },
      {
        // Public call page: may be embedded on the studio's website, and needs the microphone.
        source: "/call",
        headers: [...common, { key: "Content-Security-Policy", value: "frame-ancestors *" }, { key: "Permissions-Policy", value: "microphone=(self)" }],
      },
    ];
  },
};

export default nextConfig;
