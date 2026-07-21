# Pulso opening pitch slide design

## Goal

Create one 16:9 HTML/CSS slide that opens the Pulso pitch with a clear commercial promise,
shows the product's real-time urban context, and gives judges a direct path to the demo.

## Audience and job to be done

The audience is an OpenAI Buildathon jury watching a presentation, often from a distance and
with limited time to parse detail. The slide must answer three questions immediately:

1. What is Pulso?
2. Why should I trust it?
3. How can I see it working?

## Approved concept

Use the **“del caos a la claridad”** direction. The central visual is a dark, stylized urban
map with live-looking incident markers and one selected verified alert. The map is not a fake
analytics dashboard; it is a visual metaphor for the product's collaborative incident layer.

## Copy

Primary headline:

> Pulso convierte el caos urbano en decisiones seguras.

Supporting copy:

> La plataforma cívica que conecta reportes ciudadanos, inteligencia artificial y datos en
> tiempo real para que cada persona sepa qué ocurre cerca de ella y pueda actuar mejor.

Differentiators:

- Mapa colaborativo en tiempo real
- Reportes estructurados con IA
- Agente de voz “Cerca”
- Identidad verificada

Closing line:

> De una alerta aislada a una ciudad que se cuida en tiempo real.

QR call to action:

> Escanea para ver la demo

The slide must not include an unverified speed, adoption, or impact metric.

## Layout

- Full-viewport canvas with a 16:9 presentation frame and a safe margin around all content.
- Left column: Pulso wordmark, headline, supporting copy, and closing line.
- Right column: map scene with a selected alert panel and a small “Reporte verificado” status.
- Bottom rail: four differentiators in a restrained horizontal sequence, each with a compact
  label and supporting icon treatment.
- Bottom-right: high-contrast QR code with a short action label. The QR is a supporting CTA,
  not a competing hero element.

## Visual language

Reuse the existing Pulso “navegación nocturna” tokens from `frontend/app/globals.css`:

- Near-black blue background and blue-tinted panels.
- Teal accent for the product signal and verified states.
- Coral/red, amber, blue, and violet markers for incident categories.
- System sans stack already used by the PWA; no new font dependency.

Avoid gradients in text, oversized rounded cards, repeated identical feature cards, and dense
technical labels. Use solid surfaces, controlled glow, and map geometry to create depth.

## Motion and interaction

The slide is static-first and works without JavaScript. CSS-only motion may add a slow pulse to
the active map marker and a subtle reveal on load, but all content must be visible before motion
starts. Disable non-essential motion under `prefers-reduced-motion: reduce`.

The QR uses the user-provided image as a local asset and has descriptive alternative text. No
network request is required for the slide itself.

## Implementation boundary

Create a portable static presentation surface under `frontend/public/pitch/`:

- `index.html` — semantic slide markup.
- `styles.css` — scoped presentation styles and responsive fallback.
- `pulso-demo-qr.png` — user-provided QR asset.

The existing PWA remains unchanged. The slide is reachable from the Next.js public directory
at `/pitch/index.html` and can be opened directly for presentation or screenshot capture.

## Responsive and accessibility requirements

- Preserve the 16:9 composition at desktop and projector sizes.
- At narrow widths, stack the map below the copy and keep the QR scannable.
- Use semantic headings and list markup.
- Maintain readable contrast for body copy and labels.
- Do not rely on color alone to identify incident categories.
- Include `lang="es"`, focus-visible styles for the focusable QR wrapper, and meaningful image
  alt text. The QR is a figure rather than an invented external link because its destination is
  encoded in the user-provided image.

## Verification

- Open `/pitch/index.html` through the Next.js dev server and inspect desktop and narrow
  viewport layouts.
- Confirm the QR remains sharp and scannable at presentation size.
- Run the repository's frontend typecheck/build commands because the asset lives in the
  Next.js public tree.
- Check the reduced-motion media query and keyboard focus treatment.
