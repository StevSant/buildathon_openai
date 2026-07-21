# Pulso — PWA icons & manifest integration

Generated from `assets/icon-pulso.svg` (the animated source stays untouched). All PNGs
were rasterized from two flattened working SVGs in this folder:

- `icon-pulso-static.svg` — animation block removed, every radar blip pinned to
  `opacity="0.7"`, sweep kept at its base position. Source for the "any"-purpose icons,
  the apple-touch-icon, and all favicons.
- `icon-pulso-maskable.svg` — full-bleed opaque `#060a10` background with the radar art
  scaled to 0.8 about center (256,256) so nothing is clipped under a circular/rounded
  platform mask. Source for the maskable icons.

Renderer: **resvg-py** (Rust `resvg`, prebuilt wheel — no system deps). Blip visibility
was verified by probing the exact blip pixel coordinates in the 512px renders.

## File copy map → `frontend/public/`

| Source (this folder)              | Destination under `frontend/public/`      |
| --------------------------------- | ----------------------------------------- |
| `icons/icon-192.png`              | `public/icons/icon-192.png`               |
| `icons/icon-512.png`              | `public/icons/icon-512.png`               |
| `icons/icon-192-maskable.png`     | `public/icons/icon-192-maskable.png`      |
| `icons/icon-512-maskable.png`     | `public/icons/icon-512-maskable.png`      |
| `apple-touch-icon.png`            | `public/apple-touch-icon.png`             |
| `favicon-16.png`                  | `public/favicon-16.png`                   |
| `favicon-32.png`                  | `public/favicon-32.png`                   |
| `favicon-48.png`                  | `public/favicon-48.png`                   |
| `favicon.ico`                     | `public/favicon.ico`                      |
| `manifest.json`                   | `public/manifest.json`                    |

Summary: `icons/*` → `public/icons/`; `apple-touch-icon.png`, all `favicon-*.png`,
`favicon.ico` and `manifest.json` → `public/` root.

The manifest's `icons[].src` paths (`/icons/icon-192.png`, etc.) resolve against the
`public/` root once copied, so no path rewriting is needed.

### Quick copy (from repo root, PowerShell)

```powershell
$dst = "frontend/public"
New-Item -ItemType Directory -Force "$dst/icons" | Out-Null
Copy-Item assets/pwa/icons/*.png            "$dst/icons/"
Copy-Item assets/pwa/apple-touch-icon.png   "$dst/"
Copy-Item assets/pwa/favicon-16.png         "$dst/"
Copy-Item assets/pwa/favicon-32.png         "$dst/"
Copy-Item assets/pwa/favicon-48.png         "$dst/"
Copy-Item assets/pwa/favicon.ico            "$dst/"
Copy-Item assets/pwa/manifest.json          "$dst/"
```

## Next.js App Router wiring

Add to `frontend/app/layout.tsx` (or wherever the root `metadata`/`viewport` live).
Next.js serves `public/` at the site root, so all `url`/`href` values are absolute
paths without the `public` segment.

```ts
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  applicationName: "Pulso",
  title: "Pulso",
  description: "Reporta y descubre incidentes urbanos en tiempo real",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48.png", type: "image/png", sizes: "48x48" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a141d",
};
```

Note: the manifest already declares the maskable icons, so they do not need to be
repeated in `metadata.icons`. `background_color` (`#0a0e13`, matching the app's `--bg`)
and `theme_color` (`#0a141d`) come from `manifest.json`; `viewport.themeColor` mirrors
the theme color for the browser chrome.

## Regenerating

From the repo root, re-run the rasterization script (requires `uv`):

```bash
uv run --with resvg-py --with pillow python <path-to>/rasterize.py
```

Edit the two flattened SVGs here if the art changes; never edit `assets/icon-pulso.svg`
for raster output (its CSS animations are lost by SVG→PNG rasterizers, which is exactly
why the flattened working files exist).
