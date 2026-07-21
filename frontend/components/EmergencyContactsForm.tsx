"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib";

// Row shape from the emergency_contacts table (RLS: owner-only). display_name is
// nullable in the schema (migration 0002).
interface EmergencyContact {
  id: string;
  display_name: string | null;
  phone_e164: string;
  opt_in_status: "pending" | "accepted" | "declined";
}

// Manage emergency contacts. Adding a contact triggers a WhatsApp opt-in ("responde SÍ")
// sent by the backend; until they accept, their status stays "pending".
export default function EmergencyContactsForm() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("emergency_contacts")
      .select("id, display_name, phone_e164, opt_in_status")
      .order("created_at", { ascending: true });
    setContacts((data ?? []) as EmergencyContact[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function addContact() {
    if (!name || !phone) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const ownerId = data.user?.id;
      if (!ownerId) return;
      await supabase.from("emergency_contacts").insert({
        owner_id: ownerId,
        display_name: name,
        phone_e164: phone,
      });
      // TODO: trigger the WhatsApp opt-in message via the MessagingGateway (Hermes).
      setName("");
      setPhone("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-line bg-panel">
      <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
        Contactos de emergencia
      </div>
      {contacts.map((c) => (
        <div key={c.id} className="flex items-center gap-3 border-t border-line px-3.5 py-3">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-panel-3 font-mono text-[11px] font-extrabold text-accent">
            {(c.display_name ?? c.phone_e164.replace("+", "")).slice(0, 2).toUpperCase()}
          </span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold">
              {c.display_name ?? c.phone_e164}
            </div>
            <div className="font-mono text-[11px] text-muted">{c.phone_e164}</div>
          </div>
          <span
            className="rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase"
            style={
              c.opt_in_status === "accepted"
                ? { color: "var(--ok)", background: "color-mix(in srgb, var(--ok) 14%, transparent)" }
                : { color: "var(--sev-road)", background: "color-mix(in srgb, var(--sev-road) 14%, transparent)" }
            }
          >
            {c.opt_in_status === "accepted" ? "Aceptado" : "Pendiente"}
          </span>
        </div>
      ))}
      <div className="flex flex-col gap-2 border-t border-line px-3.5 py-3">
        <input
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none"
          placeholder="Nombre (p. ej. Mamá)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm text-ink outline-none"
          placeholder="+593 99 123 4567"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={addContact}
          className="flex items-center gap-2 text-[13px] font-semibold text-accent disabled:opacity-60"
        >
          + Agregar contacto
        </button>
      </div>
    </div>
  );
}
