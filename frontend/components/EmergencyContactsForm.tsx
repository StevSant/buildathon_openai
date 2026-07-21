"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
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
    <section className="group" aria-labelledby="emergency-contacts-title">
      <div className="gl" id="emergency-contacts-title">
        Contactos de emergencia
      </div>

      {contacts.map((contact, index) => {
        const displayName = contact.display_name ?? contact.phone_e164;
        const statusClass =
          contact.opt_in_status === "accepted"
            ? "status st-acc"
            : contact.opt_in_status === "declined"
              ? "status"
              : "status st-pend";
        const statusLabel =
          contact.opt_in_status === "accepted"
            ? "Aceptado"
            : contact.opt_in_status === "declined"
              ? "Rechazado"
              : "Pendiente";

        return (
          <div key={contact.id} className="crow" style={index === 0 ? { borderTop: 0 } : undefined}>
            <span className="cav">{displayName.slice(0, 2).toUpperCase()}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cn">{displayName}</div>
              <div className="cp">{contact.phone_e164}</div>
            </div>
            <span
              className={statusClass}
              style={
                contact.opt_in_status === "declined"
                  ? {
                      color: "var(--sev-fire)",
                      background: "color-mix(in srgb, var(--sev-fire) 14%, transparent)",
                    }
                  : undefined
              }
            >
              {statusLabel}
            </span>
          </div>
        );
      })}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "11px 13px",
          borderTop: contacts.length ? "1px solid var(--line)" : 0,
        }}
      >
        <div className="input">
          <input
            placeholder="Nombre (p. ej. Mamá)"
            aria-label="Nombre del contacto"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="input mono">
          <input
            placeholder="+593991234567"
            inputMode="tel"
            aria-label="Número del contacto"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        {error ? <p style={{ margin: 0, fontSize: 11, color: "var(--sev-fire)" }}>{error}</p> : null}
      </div>

      <button
        type="button"
        className="addrow"
        style={{ borderTop: 0, opacity: busy ? 0.6 : 1 }}
        disabled={busy}
        onClick={() => void addContact()}
      >
        <Icon name="ic-plus" />
        Agregar contacto
      </button>
    </section>
  );
}
