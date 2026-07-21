"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, supabase } from "@/lib";

// Profile hub with the public identity state and focused settings entry points.
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

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3.5">
      <div className="flex items-center gap-3 rounded-[14px] border border-line bg-panel px-3.5 py-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] bg-panel-3 font-mono text-[15px] font-extrabold text-accent">
          {initials}
        </span>
        <div className="flex-1">
          <div className="text-[15px] font-bold">{name || "Tu perfil"}</div>
          {verified ? (
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] px-1.5 py-0.5 text-[11px] font-semibold text-ok">
              ✓ Verificado
            </span>
          ) : (
            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-faint">
              Sin verificar
            </span>
          )}
        </div>
        {trustScore !== null && (
          <div className="flex flex-col items-end">
            <span className="font-mono text-[17px] font-extrabold text-accent">
              {trustScore}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">
              Confianza
            </span>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[14px] border border-line bg-panel">
        <Link
          href="/profile/security"
          className="flex items-center gap-3 border-t border-line px-3.5 py-3 first:border-t-0"
        >
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-panel-2 text-accent">
            🛡️
          </span>
          <span className="flex-1 text-[13.5px] font-semibold">
            Seguridad y WhatsApp
          </span>
          <span className="font-mono text-[11.5px] text-muted">contactos</span>
        </Link>
        <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-panel-2 text-accent">
            🔍
          </span>
          <span className="flex-1 text-[13.5px] font-semibold">Búsqueda y mapa</span>
          <span className="font-mono text-[11.5px] text-muted">Activadas</span>
        </div>
        <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-panel-2 text-accent">
            👁️
          </span>
          <span className="flex-1 text-[13.5px] font-semibold">Privacidad</span>
          <span className="font-mono text-[11.5px] text-muted">Aproximada</span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSignOut}
        className="mt-1 rounded-[14px] border border-line bg-panel-2 px-3 py-3 text-sm font-semibold text-sev-fire"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
