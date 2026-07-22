/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl) : null;

const nextConfig = {
  reactStrictMode: true,
  // core/ ships as TypeScript source shared with the edge functions, so Next transpiles it.
  transpilePackages: ["@pulso/core"],
  images: {
    remotePatterns: supabaseOrigin
      ? [
          {
            protocol: supabaseOrigin.protocol.replace(":", ""),
            hostname: supabaseOrigin.hostname,
            port: supabaseOrigin.port,
            pathname: "/storage/v1/object/public/report-photos/**",
          },
        ]
      : [],
  },
};

// Optional PWA app-shell service worker. Off by default (keeps the hackathon build simple).
// To enable: `npm i next-pwa` then swap the export below.
//
// import withPWA from "next-pwa";
// export default withPWA({
//   dest: "public",
//   register: true,
//   disable: process.env.NODE_ENV === "development",
// })(nextConfig);

export default nextConfig;
