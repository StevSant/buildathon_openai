"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { config, signOut, supabase } from "@/lib";

// The profile is a compact hub: identity first, then focused entry points for each setting area.
export default function ProfilePage() {
  const router = useRouter();
  const [name, setName] = useState<string>("");
  const [verified, setVerified] = useState(false);
  const [trustScore, setTrustScore] = useState<number | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, verified, trust_score")
        .eq("id", userId)
        .maybeSingle();

      setName((profile?.display_name as string) ?? data.user?.email ?? "");
      setVerified(Boolean(profile?.verified));
      setTrustScore(
        typeof profile?.trust_score === "number" ? profile.trust_score : null,
      );
    }

    void load();
  }, []);

  async function onSignOut(): Promise<void> {
    await signOut();
    router.replace("/auth");
  }

  const initials = name.slice(0, 2).toUpperCase() || "PU";
  const defaultRadius = `${config.defaultRadiusMeters / 1000} km`;

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 pb-4 pt-[calc(1.2rem+env(safe-area-inset-top))]">
      <section className="flex items-center gap-3 rounded-[14px] border border-line bg-panel px-3.5 py-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-panel-2 font-mono text-[14px] font-extrabold text-accent">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-extrabold leading-5 text-ink">
            {name || "Tu perfil"}
          </h1>
          {verified ? (
            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-ok">
              <span aria-hidden="true">✓</span> Identidad verificada
            </span>
          ) : (
            <span className="mt-0.5 inline-flex text-[11px] font-semibold text-faint">
              Identidad sin verificar
            </span>
          )}
        </div>
        {trustScore !== null ? (
          <span className="flex flex-col items-end">
            <strong className="font-mono text-[16px] leading-4 text-accent">{trustScore}</strong>
            <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.08em] text-faint">
              Confianza
            </span>
          </span>
        ) : (
          <span aria-hidden="true" className="text-lg leading-none text-faint">
            ›
          </span>
        )}
      </section>

      <section className="overflow-hidden rounded-[14px] border border-line bg-panel">
        <Link href="/" className="flex min-h-[57px] items-center gap-3 px-3.5 py-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-panel-2 text-accent">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[13.5px] font-semibold">Búsqueda y mapa</span>
          <span className="font-mono text-[11px] text-muted">{defaultRadius}</span>
          <span aria-hidden="true" className="text-base text-faint">›</span>
        </Link>
        <Link href="/notifications" className="flex min-h-[57px] items-center gap-3 border-t border-line px-3.5 py-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-panel-2 text-accent">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[13.5px] font-semibold">Notificaciones</span>
          <span className="font-mono text-[11px] text-muted">Activadas</span>
          <span aria-hidden="true" className="text-base text-faint">›</span>
        </Link>
        <Link href="/assistant" className="flex min-h-[57px] items-center gap-3 border-t border-line px-3.5 py-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-panel-2 text-accent">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="8" y="3" width="8" height="12" rx="4" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[13.5px] font-semibold">Agente de voz</span>
          <span className="font-mono text-[11px] text-muted">General</span>
          <span aria-hidden="true" className="text-base text-faint">›</span>
        </Link>
      </section>

      <section className="overflow-hidden rounded-[14px] border border-line bg-panel">
        <Link href="/profile/security" className="flex min-h-[57px] items-center gap-3 px-3.5 py-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[color-mix(in_srgb,var(--ok)_16%,var(--panel-2))] text-ok">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 5h14v10H9l-4 4V5Z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[13.5px] font-semibold">Seguridad y WhatsApp</span>
          <span className="font-mono text-[11px] text-muted">contactos</span>
          <span aria-hidden="true" className="text-base text-faint">›</span>
        </Link>
        <div className="flex min-h-[57px] items-center gap-3 border-t border-line px-3.5 py-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-panel-2 text-accent">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[13.5px] font-semibold">Privacidad</span>
          <span className="font-mono text-[11px] text-muted">Aproximada</span>
          <span aria-hidden="true" className="text-base text-faint">›</span>
        </div>
        <div className="flex min-h-[57px] items-center gap-3 border-t border-line px-3.5 py-2.5">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-panel-2 text-ok">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[13.5px] font-semibold">Permisos</span>
          <span className="font-mono text-[11px] text-muted">2 / 2</span>
          <span aria-hidden="true" className="text-base text-faint">›</span>
        </div>
      </section>

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="mt-auto flex min-h-[48px] items-center justify-center gap-2 rounded-[13px] border border-line bg-panel-2 px-3 py-3 text-[13px] font-bold text-sev-fire"
      >
        <span aria-hidden="true">⇥</span> Cerrar sesión
      </button>
    </div>
  );
}
