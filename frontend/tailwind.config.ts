import type { Config } from "tailwindcss";

// "navegación nocturna" palette. Every color resolves to a CSS variable declared in
// app/globals.css so the theme lives in one place and stays swappable.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        "panel-3": "var(--panel-3)",
        line: "var(--line)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        "accent-deep": "var(--accent-deep)",
        "accent-ink": "var(--accent-ink)",
        ok: "var(--ok)",
        sev: {
          fire: "var(--sev-fire)",
          accident: "var(--sev-accident)",
          flood: "var(--sev-flood)",
          road: "var(--sev-road)",
          event: "var(--sev-event)",
        },
      },
      fontFamily: {
        sans: ["var(--sans)"],
        mono: ["var(--mono)"],
      },
      borderRadius: {
        sheet: "20px",
      },
    },
  },
  plugins: [],
};

export default config;
