/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // core/ ships as TypeScript source shared with the edge functions, so Next transpiles it.
  transpilePackages: ["@pulso/core"],
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
