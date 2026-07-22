"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

// Persistent bottom navigation across all post-login screens, matching the mockup's
// tabbar: grid columns + fixed icon boxes; "Reportar" renders as the accent circle.
const TABS = [
  { href: "/", label: "Mapa", icon: "ic-map" },
  { href: "/report", label: "Reportar", icon: "ic-plus", accent: true },
  { href: "/assistant", label: "Cerca", icon: "ic-mic" },
  { href: "/profile", label: "Perfil", icon: "ic-user" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabbar" aria-label="Navegación">
      {/* Wordmark shown only on the desktop side rail (CSS-gated); hidden on the mobile
          bottom bar. aria-hidden + non-focusable so it never enters the tab order. */}
      <span className="tabbar-brand" aria-hidden="true">
        Pul<em>so</em>
      </span>
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        const isReport = "accent" in tab && tab.accent;
        const tabClass = [
          "tab",
          isReport ? "report" : "",
          active ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <Link key={tab.href} href={tab.href} aria-label={tab.label} className={tabClass}>
            <span className="ic">
              {isReport ? (
                <span className="fabc">
                  <Icon name={tab.icon} />
                </span>
              ) : (
                <Icon name={tab.icon} />
              )}
            </span>
            <span className="lbl">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
