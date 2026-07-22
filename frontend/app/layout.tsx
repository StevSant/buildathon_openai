import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IconSprite } from "@/components";
import "./globals.css";

// PWA wiring. The manifest and icon files are delivered by a separate asset step —
// this app only references their public paths, it never creates them.
export const metadata: Metadata = {
  title: "Pulso — La ciudad en tiempo real",
  description:
    "Reporta incidentes urbanos con una foto; la ciudad los ve en el mapa al instante. Identidad verificada, alertas de proximidad y un agente de voz.",
  applicationName: "Pulso",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Pulso",
  },
  // Standard PWA capability hint. Chrome/Android read `mobile-web-app-capable`; the
  // Apple-specific tag above stays for iOS. Emitted once globally — no per-route duplicates.
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a141d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <IconSprite />
        {children}
      </body>
    </html>
  );
}
