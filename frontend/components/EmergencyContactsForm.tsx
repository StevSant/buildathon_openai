"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib";

interface EmergencyContact {
  id: string;
  display_name: string | null;
  phone_e164: string;
  opt_in_status: "pending" | "accepted" | "declined";
}

// E.164: a leading "+", then a non-zero country-code digit and 7–14 more digits.
const E164 = /^\+[1-9]\d{7,14}$/;

// Creates owner-scoped contacts. The integrations lane sends the opt-in WhatsApp message;
// this client only persists the pending contact row.
export default function EmergencyContactsForm() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    const { data, error: loadError } = await supabase
      .from("emergency_contacts")
      .select("id, display_name, phone_e164, opt_in_status")
      .order("created_at", { ascending: true });

    if (loadError) {
      setError("No se pudieron cargar tus contactos. Intenta de nuevo.");
      return;
    }

    setContacts((data ?? []) as EmergencyContact[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function addContact(): Promise<void> {
    setError(null);
    const displayName = name.trim();
    const phoneE164 = phone.trim();

    if (!displayName || !phoneE164) {
      setError("Ingresa el nombre y el número de tu contacto.");
      return;
    }

    if (!E164.test(phoneE164)) {
      setError("Ingresa un número válido en formato internacional (p. ej. +593991234567).");
      return;
    }

    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const ownerId = userData.user?.id;
      if (!ownerId) {
        setError("Tu sesión expiró. Ingresa nuevamente para continuar.");
        return;
      }

      const { error: insertError } = await supabase.from("emergency_contacts").insert({
        owner_id: ownerId,
        display_name: displayName,
        phone_e164: phoneE164,
      });

      if (insertError) {
        setError(
          insertError.code === "23505"
            ? "Ese número ya está en tu lista de contactos."
            : "No se pudo agregar el contacto. Intenta de nuevo.",
        );
        return;
      }

      setName("");
      setPhone("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-line bg-panel" aria-labelledby="emergency-contacts-title">
      <h2
        id="emergency-contacts-title"
        className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint"
      >
        Contactos de emergencia
      </h2>

      {contacts.map((contact) => {
        const status =
          contact.opt_in_status === "accepted"
            ? { label: "Aceptado", color: "var(--ok)" }
            : contact.opt_in_status === "declined"
              ? { label: "Rechazado", color: "var(--sev-fire)" }
              : { label: "Pendiente", color: "var(--sev-road)" };
        const displayName = contact.display_name ?? contact.phone_e164;

        return (
          <div key={contact.id} className="flex items-center gap-3 border-t border-line px-3.5 py-3">
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-panel-3 font-mono text-[11px] font-extrabold text-accent">
              {displayName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold">{displayName}</div>
              <div className="font-mono text-[11px] text-muted">{contact.phone_e164}</div>
            </div>
            <span
              className="rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase"
              style={{
                color: status.color,
                background: `color-mix(in srgb, ${status.color} 14%, transparent)`,
              }}
            >
              {status.label}
            </span>
          </div>
        );
      })}

      <div className="flex flex-col gap-2 border-t border-line px-3.5 py-3">
        <input
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
          placeholder="Nombre (p. ej. Mamá)"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
          placeholder="+593991234567"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        {error ? <p className="text-[11px] text-sev-fire">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void addContact()}
          className="flex items-center gap-2 self-start text-[13px] font-semibold text-accent disabled:opacity-60"
        >
          + Agregar contacto
        </button>
      </div>
    </section>
  );
}
