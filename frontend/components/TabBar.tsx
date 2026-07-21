"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Persistent bottom navigation across all post-login screens.
// Mapa · Reportar (accent circle) · Cerca · Perfil.
const TABS = [
  { href: "/", label: "Mapa", icon: "map" },
  { href: "/report", label: "Reportar", icon: "plus", accent: true },
  { href: "/assistant", label: "Cerca", icon: "mic" },
  { href: "/profile", label: "Perfil", icon: "user" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabIcon({ name }: { name: string }) {
  const common = {
    width: 23,
    height: 23,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "map")
    return (
      <svg {...common}>
        <path d="M9 4 3 6.2v14L9 18l6 2 6-2.2v-14L15 6 9 4Z" />
        <path d="M9 4v14M15 6v14" />
      </svg>
    );
  if (name === "plus")
    return (
      <svg {...common} strokeWidth={2.6}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  if (name === "mic")
    return (
      <svg {...common}>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="grid grid-cols-4 items-center border-t border-line bg-panel px-2 pt-2"
      style={{ paddingBottom: "calc(0.7rem + env(safe-area-inset-bottom))" }}
    >
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.label}
            className={`flex flex-col items-center gap-1.5 ${
              active ? "text-accent" : "text-faint"
            }`}
          >
            {"accent" in tab && tab.accent ? (
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_6px_16px_-6px_var(--accent)]">
                <TabIcon name={tab.icon} />
              </span>
            ) : (
              <span
                className={`flex h-[34px] min-w-[46px] items-center justify-center rounded-[13px] ${
                  active ? "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]" : ""
                }`}
              >
                <TabIcon name={tab.icon} />
              </span>
            )}
            <span className="text-[10px] font-semibold">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
