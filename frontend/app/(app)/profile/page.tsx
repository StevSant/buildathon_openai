"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components";
import { config, signOut, supabase } from "@/lib";

// The profile is a compact hub: identity first, then focused entry points for each setting area.
export default function ProfilePage() {
  const router = useRouter();
  const [name, setName] = useState<string>("");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    async function load(): Promise<void> {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, verified")
        .eq("id", userId)
        .maybeSingle();

      setName((profile?.display_name as string) ?? data.user?.email ?? "");
      setVerified(Boolean(profile?.verified));
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
    <div className="s-hub">
      <div className="hubcard">
        <span className="av">{initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hn">{name || "Tu perfil"}</div>
          {verified ? (
            <span className="badge-ok">
              <Icon name="ic-check" style={{ width: 14, height: 14, strokeWidth: 2.3 }} />
              Identidad verificada
            </span>
          ) : (
            <span className="hint">Identidad sin verificar</span>
          )}
        </div>
        <span className="chev">
          <Icon name="ic-chevron" />
        </span>
      </div>

      <div className="menu">
        <Link href="/" className="mrow">
          <span className="mi">
            <Icon name="ic-target" />
          </span>
          <span className="mt">Búsqueda y mapa</span>
          <span className="mv">{defaultRadius}</span>
          <span className="chev">
            <Icon name="ic-chevron" />
          </span>
        </Link>
        <Link href="/notifications" className="mrow">
          <span className="mi">
            <Icon name="ic-bell" />
          </span>
          <span className="mt">Notificaciones</span>
          <span className="mv">Activadas</span>
          <span className="chev">
            <Icon name="ic-chevron" />
          </span>
        </Link>
        <Link href="/assistant" className="mrow">
          <span className="mi">
            <Icon name="ic-mic" />
          </span>
          <span className="mt">Agente de voz</span>
          <span className="mv">General</span>
          <span className="chev">
            <Icon name="ic-chevron" />
          </span>
        </Link>
      </div>

      <div className="menu">
        <Link href="/profile/security" className="mrow">
          <span
            className="mi"
            style={{
              background: "color-mix(in srgb,#25D366 18%,var(--panel))",
              color: "#25D366",
            }}
          >
            <Icon name="ic-chat" />
          </span>
          <span className="mt">Seguridad y WhatsApp</span>
          <span className="mv">Contactos</span>
          <span className="chev">
            <Icon name="ic-chevron" />
          </span>
        </Link>
        <div className="mrow">
          <span className="mi">
            <Icon name="ic-shield" />
          </span>
          <span className="mt">Privacidad</span>
          <span className="mv">Aproximada</span>
          <span className="chev">
            <Icon name="ic-chevron" />
          </span>
        </div>
        <div className="mrow">
          <span className="mi">
            <Icon name="ic-check" />
          </span>
          <span className="mt">Permisos</span>
          <span className="mv">2 / 2</span>
          <span className="chev">
            <Icon name="ic-chevron" />
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="btn ghost"
        style={{ color: "var(--sev-fire)" }}
      >
        <Icon name="ic-logout" style={{ width: 16, height: 16 }} />
        Cerrar sesión
      </button>
    </div>
  );
}
