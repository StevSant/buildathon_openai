# F6 — Safety, WhatsApp & SOS Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Frontend (`frontend/**`)
**Goal:** Turn the "Seguridad y WhatsApp" screen into a working safety layer — runtime-permission
onboarding, WhatsApp opt-in + phone registration, emergency-contact CRUD, the per-user alert rule,
and a functioning SOS button.
**Depends on:** B1 (schema: `whatsapp_config`, `emergency_contacts`, `alert_rules` from migration
`0002`) applied. SOS delivery and contact opt-in are fully exercised only once **B5**
(`proximity-dispatcher`) is deployed; the frontend codes against `CONTRACT.md` and creates the rows
/ posts the payloads regardless, so it is never blocked.
**Reads from CONTRACT:** §3.3 (owner-only table writes: `whatsapp_config`, `emergency_contacts`,
`alert_rules`), §4 (`proximity-dispatcher` manual-SOS payload `{ type: 'sos', location: { lat, lng } }`),
§6 (env split).

**FRs covered:** FR-22 (Task 2), FR-23 (Task 3), FR-24 (Task 4), FR-25 (Task 4 — the client writes
`alert_rules.center` so B5 can evaluate server-side), FR-26 (Task 5), FR-27 (Task 1).
**ADRs covered:** ADR-017 (WhatsApp emergency alerts / Hermes / `proximity-dispatcher` — Tasks 2–5),
ADR-019 (post-login permissions & safety onboarding — Task 1).

## Cross-lane assumptions (state them; do not act outside the frontend lane)
1. **`alert_rules` has NO `unique(user_id)` constraint** in migration `0002` (DATA-MODEL §9 — PK is
   `id`, `user_id` is a plain FK). A `.upsert(..., { onConflict: 'user_id' })` would fail at runtime
   ("no unique or exclusion constraint matching the ON CONFLICT specification"). Task 4 therefore
   uses an in-lane **read-then-write** (update the existing row by `id`, else insert) — no backend
   change required. (`whatsapp_config.user_id` **is** the PK, so its upsert in Task 2 is fine.)
2. **`alert_rules.center`** is `extensions.geography(point)`. The client writes it as EWKT text
   (`SRID=4326;POINT(lng lat)`) — the same approach CONTRACT §3.3 uses for `incidents.location`.
   PostGIS parses EWKT on write via PostgREST. If a location is unavailable, the write is skipped
   and the rule still saves (center stays null → simply won't match server-side, per DATA-MODEL §9).
3. **SOS delivery and contact opt-in** ("responde SÍ") are owned by **B5** (`proximity-dispatcher`
   + `MessagingGateway`/Hermes). The frontend only (a) inserts the `pending` contact row and
   (b) POSTs the SOS payload. It never sends WhatsApp itself and never holds contact fan-out logic.
4. **First-run routing** to `/profile/security` after signup is owned by **F1** (auth/routing). F6
   makes this one screen serve both first-run onboarding and the always-available Perfil sub-page.

## Global Constraints (apply to every task)
- No hardcoded URLs / keys / thresholds — everything via env (`.env.local` for `NEXT_PUBLIC_*`);
  read them through `config` from `@/lib` (CONTRACT §6). This plan adds no new env vars.
- One class / function / component per file. Re-export through the barrel (`frontend/components/index.ts`);
  consumers import from `@/components`, never a deep file.
- UI copy in **Spanish** (Ecuador locale). Code comments, commit messages, this doc → **English**.
- Commit convention: Conventional Commits in English (`feat:`, `fix:`, `chore:` …).
- TypeScript: no `any` in app code; explicit types on exported functions/props; the frontend imports
  **types only** from `@pulso/core` (not needed in this plan — all shapes are local row types).
- Supabase writes are RLS-guarded owner-only; always resolve the current user id via
  `supabase.auth.getUser()` before a write and bail if there is no session.

---

### Task 1: Runtime-permission onboarding (`PermissionsCard`) — FR-27, ADR-019

**Files:**
- Create: `frontend/components/PermissionsCard.tsx`
- Modify: `frontend/components/index.ts` (barrel re-export)
- Modify: `frontend/app/(app)/profile/security/page.tsx` (mount the card at the top)

**Interfaces:**
- Consumes: browser `navigator.geolocation.getCurrentPosition`, `navigator.mediaDevices.getUserMedia`,
  and (best-effort) `navigator.permissions.query({ name: 'geolocation' })`.
- Produces: `PermissionsCard` (default export) re-exported from `@/components`.

- [ ] **Step 1: Create the permissions card.** Location is required (nearby incidents + SOS);
  microphone is optional (voice assistant). Requesting fires the native browser prompt; the pill
  reflects the outcome. No `any`: the microphone permission name is not in TS's `PermissionName`
  union, so we never query it — we only query geolocation (a valid `PermissionName`) on mount.

```tsx
"use client";

import { useEffect, useState } from "react";

// Post-login permission onboarding (ADR-019). Location is required for the map + SOS; the
// microphone is optional (only the "Cerca" voice assistant uses it). Clicking a row triggers
// the browser's native permission prompt and the pill reflects the result.
type PermState = "unknown" | "granted" | "denied";

export default function PermissionsCard() {
  const [location, setLocation] = useState<PermState>("unknown");
  const [microphone, setMicrophone] = useState<PermState>("unknown");

  useEffect(() => {
    // Best-effort read of the current geolocation grant, where the Permissions API exists.
    if (typeof navigator === "undefined" || !navigator.permissions) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        setLocation(
          status.state === "granted"
            ? "granted"
            : status.state === "denied"
              ? "denied"
              : "unknown",
        );
      })
      .catch(() => {
        // Permissions API unsupported — leave "unknown"; the request button still works.
      });
  }, []);

  async function requestLocation() {
    try {
      await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        }),
      );
      setLocation("granted");
    } catch {
      setLocation("denied");
    }
  }

  async function requestMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We only need the grant, not the stream — release the mic immediately.
      stream.getTracks().forEach((track) => track.stop());
      setMicrophone("granted");
    } catch {
      setMicrophone("denied");
    }
  }

  return (
    <div className="rounded-[14px] border border-line bg-panel">
      <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
        Permisos del dispositivo
      </div>

      <PermissionRow
        icon="📍"
        title="Ubicación · obligatorio"
        reason="Para mostrarte incidentes cerca de ti y enviar tu ubicación en un SOS."
        state={location}
        onRequest={requestLocation}
      />
      <PermissionRow
        icon="🎙️"
        title="Micrófono · opcional"
        reason="Solo para hablar con el asistente de voz “Cerca”. Puedes activarlo después."
        state={microphone}
        onRequest={requestMicrophone}
      />
    </div>
  );
}

interface PermissionRowProps {
  icon: string;
  title: string;
  reason: string;
  state: PermState;
  onRequest: () => void;
}

function PermissionRow({ icon, title, reason, state, onRequest }: PermissionRowProps) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
      <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-panel-3 text-[15px]">
        {icon}
      </span>
      <div className="flex-1">
        <div className="text-[13px] font-semibold">{title}</div>
        <div className="text-[11px] text-muted">{reason}</div>
      </div>
      {state === "granted" ? (
        <span
          className="rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase"
          style={{ color: "var(--ok)", background: "color-mix(in srgb, var(--ok) 14%, transparent)" }}
        >
          Concedido
        </span>
      ) : state === "denied" ? (
        <button
          type="button"
          onClick={onRequest}
          className="rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase"
          style={{ color: "var(--sev-fire)", background: "color-mix(in srgb, var(--sev-fire) 14%, transparent)" }}
        >
          Bloqueado · reintentar
        </button>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          className="rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-white"
        >
          Permitir
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Re-export from the barrel.** Add to `frontend/components/index.ts`:

```ts
export { default as PermissionsCard } from "./PermissionsCard";
```

- [ ] **Step 3: Mount it at the top of the security screen.** Replace the entire contents of
  `frontend/app/(app)/profile/security/page.tsx` with the following (adds the `PermissionsCard`
  import and renders it right below the header; the static WhatsApp block is replaced in Task 2):

```tsx
import Link from "next/link";
import {
  PermissionsCard,
  EmergencyContactsForm,
  AlertRulesForm,
  SosButton,
} from "@/components";

// "Seguridad y WhatsApp" — first-run onboarding (ADR-019) and the always-available Perfil
// sub-page: grant permissions, connect WhatsApp (via Hermes), manage emergency contacts with
// opt-in, tune the tighter contact-alert threshold, and the manual SOS button.
export default function SecurityPage() {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3.5">
      <div className="flex items-center gap-2 px-0.5">
        <Link href="/profile" aria-label="Volver" className="text-muted">
          ←
        </Link>
        <h1 className="text-[18px] font-extrabold">Seguridad y WhatsApp</h1>
      </div>

      <PermissionsCard />

      {/* WhatsApp integration summary (static placeholder — wired in Task 2) */}
      <div className="rounded-[14px] border border-line bg-panel">
        <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
          Integración WhatsApp · Hermes
        </div>
        <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,#25D366_20%,var(--panel))] text-[#25D366]">
            💬
          </span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold">Tu número</div>
            <div className="font-mono text-[11px] text-muted">Conectar WhatsApp</div>
          </div>
          <span className="rounded-md bg-[color-mix(in_srgb,var(--sev-road)_14%,transparent)] px-1.5 py-1 text-[10px] font-semibold uppercase text-sev-road">
            Pendiente
          </span>
        </div>
      </div>

      <EmergencyContactsForm />
      <AlertRulesForm />
      <SosButton />

      <p className="px-1 pb-2 text-[10.5px] text-faint">
        Conectas tu WhatsApp, agregas contactos (con opt-in), y defines un umbral más
        ajustado. El SOS envía tu ubicación al instante. Envío vía puerto MessagingGateway →
        adaptador Hermes.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run typecheck` then `npm run dev` and open http://localhost:3000/profile/security.
Expected: typecheck passes. On the screen, a "Permisos del dispositivo" card appears above the
WhatsApp block with two rows — "Ubicación · obligatorio" and "Micrófono · opcional", each with a
Spanish reason and a "Permitir" button. Clicking "Permitir" on Ubicación triggers the browser's
location prompt; granting flips the pill to "Concedido" (green), denying shows "Bloqueado ·
reintentar" (red). Same for Micrófono.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/PermissionsCard.tsx frontend/components/index.ts "frontend/app/(app)/profile/security/page.tsx"
git commit -m "feat(safety): add runtime-permission onboarding card to security screen"
```

---

### Task 2: WhatsApp config — enable toggle + phone registration (`WhatsAppConfigForm`) — FR-22, ADR-017

**Files:**
- Create: `frontend/components/WhatsAppConfigForm.tsx`
- Modify: `frontend/components/index.ts` (barrel re-export)
- Modify: `frontend/app/(app)/profile/security/page.tsx` (replace the static WhatsApp block)

**Interfaces:**
- Consumes: `supabase` from `@/lib`; table `whatsapp_config` (CONTRACT §3.3, PK `user_id`;
  columns `enabled`, `phone_e164`, `verified`).
- Produces: `WhatsAppConfigForm` (default export) re-exported from `@/components`.

- [ ] **Step 1: Create the WhatsApp config form.** Toggling on requires a valid E.164 number.
  Upsert on `user_id` (safe: `user_id` is the PK of `whatsapp_config`). `verified` is set by the
  backend (Hermes) — the frontend only registers the number, so an OTP flow is out of scope here.

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib";

// Per-user WhatsApp opt-in + own phone number (whatsapp_config, RLS owner-only, PK = user_id).
// Enabling requires a valid E.164 number. `verified` is owned by the backend (Hermes) — here we
// only register the number; phone verification (OTP) is beyond the hackathon scope.
interface WhatsAppConfigRow {
  enabled: boolean;
  phone_e164: string | null;
  verified: boolean;
}

// E.164: leading "+", first digit 1-9, then 7-14 more digits.
const E164 = /^\+[1-9]\d{7,14}$/;

export default function WhatsAppConfigForm() {
  const [enabled, setEnabled] = useState(false);
  const [phone, setPhone] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: row } = await supabase
        .from("whatsapp_config")
        .select("enabled, phone_e164, verified")
        .eq("user_id", uid)
        .maybeSingle();
      if (row) {
        const config = row as WhatsAppConfigRow;
        setEnabled(Boolean(config.enabled));
        setPhone(config.phone_e164 ?? "");
        setVerified(Boolean(config.verified));
      }
    }
    void load();
  }, []);

  async function save(nextEnabled: boolean, nextPhone: string) {
    setError(null);
    const trimmed = nextPhone.trim();
    if (nextEnabled && !E164.test(trimmed)) {
      setError("Ingresa un número válido en formato internacional (p. ej. +593991234567).");
      return;
    }
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { error: upsertError } = await supabase
        .from("whatsapp_config")
        .upsert(
          { user_id: uid, enabled: nextEnabled, phone_e164: trimmed || null },
          { onConflict: "user_id" },
        );
      if (upsertError) {
        setError("No se pudo guardar. Intenta de nuevo.");
        return;
      }
      setEnabled(nextEnabled);
      setPhone(trimmed);
    } finally {
      setBusy(false);
    }
  }

  const statusPill = verified
    ? { text: "Verificado", color: "var(--ok)" }
    : enabled
      ? { text: "Pendiente", color: "var(--sev-road)" }
      : { text: "Desactivado", color: "var(--muted)" };

  return (
    <div className="rounded-[14px] border border-line bg-panel">
      <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
        Integración WhatsApp · Hermes
      </div>

      <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[color-mix(in_srgb,#25D366_20%,var(--panel))] text-[#25D366]">
          💬
        </span>
        <div className="flex-1 text-[13px] font-semibold">Activar alertas por WhatsApp</div>
        <button
          type="button"
          aria-pressed={enabled}
          disabled={busy}
          onClick={() => save(!enabled, phone)}
          className={`relative h-[22px] w-[38px] flex-none rounded-full ${
            enabled ? "bg-accent" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all ${
              enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-3.5 py-3">
        <input
          className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 font-mono text-sm text-ink outline-none"
          placeholder="+593 99 123 4567"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => save(enabled, phone)}
        />
        <span
          className="rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase"
          style={{
            color: statusPill.color,
            background: `color-mix(in srgb, ${statusPill.color} 14%, transparent)`,
          }}
        >
          {statusPill.text}
        </span>
      </div>

      {error && <p className="px-3.5 pb-2.5 text-[11px] text-sev-fire">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Re-export from the barrel.** Add to `frontend/components/index.ts`:

```ts
export { default as WhatsAppConfigForm } from "./WhatsAppConfigForm";
```

- [ ] **Step 3: Swap the static block for the wired form.** Replace the entire contents of
  `frontend/app/(app)/profile/security/page.tsx` with the following (removes the static WhatsApp
  `<div>` and renders `<WhatsAppConfigForm />` in its place):

```tsx
import Link from "next/link";
import {
  PermissionsCard,
  WhatsAppConfigForm,
  EmergencyContactsForm,
  AlertRulesForm,
  SosButton,
} from "@/components";

// "Seguridad y WhatsApp" — first-run onboarding (ADR-019) and the always-available Perfil
// sub-page: grant permissions, connect WhatsApp (via Hermes), manage emergency contacts with
// opt-in, tune the tighter contact-alert threshold, and the manual SOS button.
export default function SecurityPage() {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3.5 py-3.5">
      <div className="flex items-center gap-2 px-0.5">
        <Link href="/profile" aria-label="Volver" className="text-muted">
          ←
        </Link>
        <h1 className="text-[18px] font-extrabold">Seguridad y WhatsApp</h1>
      </div>

      <PermissionsCard />
      <WhatsAppConfigForm />
      <EmergencyContactsForm />
      <AlertRulesForm />
      <SosButton />

      <p className="px-1 pb-2 text-[10.5px] text-faint">
        Conectas tu WhatsApp, agregas contactos (con opt-in), y defines un umbral más
        ajustado. El SOS envía tu ubicación al instante. Envío vía puerto MessagingGateway →
        adaptador Hermes.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run typecheck` then `npm run dev` (Supabase local running with B1 applied,
signed in). Open http://localhost:3000/profile/security.
Expected: typecheck passes. The "Integración WhatsApp · Hermes" card now has a working toggle and a
phone input. Toggling on with an empty/invalid number shows the Spanish validation error and the
toggle stays off. Enter a valid `+593…` number, toggle on, and reload — the number and enabled state
persist (row upserted into `whatsapp_config`). The pill reads "Pendiente" while enabled+unverified,
"Desactivado" when off.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/WhatsAppConfigForm.tsx frontend/components/index.ts "frontend/app/(app)/profile/security/page.tsx"
git commit -m "feat(safety): wire WhatsApp enable toggle + phone registration to whatsapp_config"
```

---

### Task 3: Harden emergency-contact CRUD (`EmergencyContactsForm`) — FR-23, ADR-017

**Files:**
- Modify: `frontend/components/EmergencyContactsForm.tsx`

**Interfaces:**
- Consumes: `supabase` from `@/lib`; table `emergency_contacts` (CONTRACT §3.3; columns `owner_id`,
  `display_name`, `phone_e164`, `opt_in_status`; `unique(owner_id, phone_e164)`).
- Produces: no new exported symbols (same default export).

- [ ] **Step 1: Rewrite the component.** Add E.164 validation, surface insert errors (including the
  duplicate-phone unique-violation), render all three `opt_in_status` values, and correct the
  misleading TODO: the opt-in WhatsApp message is sent by the backend (B5) — the frontend only
  inserts the `pending` row. Replace the entire file contents:

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib";

// Row shape from the emergency_contacts table (RLS: owner-only).
interface EmergencyContact {
  id: string;
  display_name: string;
  phone_e164: string;
  opt_in_status: "pending" | "accepted" | "declined";
}

// E.164: leading "+", first digit 1-9, then 7-14 more digits.
const E164 = /^\+[1-9]\d{7,14}$/;

// Manage emergency contacts. Adding a contact inserts a "pending" row; the opt-in WhatsApp
// message ("responde SÍ") is sent by the backend (B5, proximity-dispatcher via the Hermes
// MessagingGateway) — the frontend only creates the row here. Only "accepted" contacts are
// ever messaged.
export default function EmergencyContactsForm() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) return;
    if (!E164.test(trimmedPhone)) {
      setError("Ingresa un número válido en formato internacional (p. ej. +593991234567).");
      return;
    }
    setBusy(true);
    try {
      const { data } = await supabase.auth.getUser();
      const ownerId = data.user?.id;
      if (!ownerId) return;
      const { error: insertError } = await supabase.from("emergency_contacts").insert({
        owner_id: ownerId,
        display_name: trimmedName,
        phone_e164: trimmedPhone,
      });
      if (insertError) {
        // 23505 = unique_violation on unique(owner_id, phone_e164).
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

  function statusPill(status: EmergencyContact["opt_in_status"]) {
    if (status === "accepted") return { text: "Aceptado", color: "var(--ok)" };
    if (status === "declined") return { text: "Rechazado", color: "var(--sev-fire)" };
    return { text: "Pendiente", color: "var(--sev-road)" };
  }

  return (
    <div className="rounded-[14px] border border-line bg-panel">
      <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
        Contactos de emergencia
      </div>
      {contacts.map((c) => {
        const pill = statusPill(c.opt_in_status);
        return (
          <div key={c.id} className="flex items-center gap-3 border-t border-line px-3.5 py-3">
            <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-panel-3 font-mono text-[11px] font-extrabold text-accent">
              {c.display_name.slice(0, 2).toUpperCase()}
            </span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">{c.display_name}</div>
              <div className="font-mono text-[11px] text-muted">{c.phone_e164}</div>
            </div>
            <span
              className="rounded-md px-1.5 py-1 text-[10px] font-semibold uppercase"
              style={{
                color: pill.color,
                background: `color-mix(in srgb, ${pill.color} 14%, transparent)`,
              }}
            >
              {pill.text}
            </span>
          </div>
        );
      })}
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
        {error && <p className="text-[11px] text-sev-fire">{error}</p>}
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck` then `npm run dev` (Supabase local, signed in), open
http://localhost:3000/profile/security.
Expected: typecheck passes. Adding a contact with an invalid phone shows the Spanish E.164 error and
does not insert. A valid contact appears in the list with a "Pendiente" pill (amber). Adding the same
number again shows "Ese número ya está en tu lista de contactos." Reloading keeps the contact
(persisted `pending` row). No WhatsApp message is sent from the frontend.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/EmergencyContactsForm.tsx
git commit -m "fix(safety): validate E.164, surface insert errors, and render all opt-in states in emergency contacts"
```

---

### Task 4: Per-user alert rule + geofence center (`AlertRulesForm`) — FR-24, FR-25, ADR-017

**Files:**
- Modify: `frontend/components/AlertRulesForm.tsx`

**Interfaces:**
- Consumes: `supabase` from `@/lib`; table `alert_rules` (CONTRACT §3.3; columns `user_id`,
  `min_severity`, `radius_meters`, `enabled`, `channel`, `center`). No `unique(user_id)` exists
  (see cross-lane assumption 1) → read-then-write, not `onConflict` upsert.
- Produces: no new exported symbols (same default export).

- [ ] **Step 1: Rewrite the component.** Load the existing row (keep its `id` for updates), write
  min_severity/radius_meters/enabled/channel via read-then-write keyed on `user_id`, then best-effort
  attach the user's last-known location to `center` (EWKT) so B5 can evaluate server-side (FR-25).
  Replace the entire file contents:

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib";

// The tighter rule that governs alerts sent to a user's WhatsApp contacts. Deliberately
// stricter than the in-app map alerts (normal alerts use ~3 km; contacts get only the very
// close and severe). Persisted to alert_rules (RLS owner-only).
interface AlertRule {
  min_severity: number;
  radius_meters: number;
  enabled: boolean;
}

const DEFAULT_RULE: AlertRule = { min_severity: 4, radius_meters: 500, enabled: true };

export default function AlertRulesForm() {
  const [rule, setRule] = useState<AlertRule>(DEFAULT_RULE);
  const [ruleId, setRuleId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("alert_rules")
      .select("id, min_severity, radius_meters, enabled")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setRuleId(data.id as string);
        setRule({
          min_severity: data.min_severity as number,
          radius_meters: data.radius_meters as number,
          enabled: data.enabled as boolean,
        });
      });
  }, []);

  async function save(next: AlertRule) {
    setRule(next);
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;

    // alert_rules has no unique(user_id) constraint (DATA-MODEL §9), so read-then-write
    // instead of onConflict upsert: update the existing row by id, or insert the first one.
    let id = ruleId;
    if (!id) {
      const { data: existing } = await supabase
        .from("alert_rules")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      id = (existing?.id as string | undefined) ?? null;
    }

    const payload = {
      min_severity: next.min_severity,
      radius_meters: next.radius_meters,
      enabled: next.enabled,
      channel: "whatsapp" as const,
    };

    if (id) {
      await supabase.from("alert_rules").update(payload).eq("id", id);
    } else {
      const { data: inserted } = await supabase
        .from("alert_rules")
        .insert({ user_id: userId, ...payload })
        .select("id")
        .maybeSingle();
      id = (inserted?.id as string | undefined) ?? null;
      if (id) setRuleId(id);
    }

    if (id) void attachCenter(id);
  }

  // Best-effort: store the user's last-known location as the geofence center so the
  // server-side proximity-dispatcher (B5) can match st_dwithin(incident.location, center,
  // radius_meters). EWKT text is parsed by PostGIS on write (same approach as incident.location).
  async function attachCenter(id: string) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 }),
      );
      const { latitude, longitude } = position.coords;
      await supabase
        .from("alert_rules")
        .update({ center: `SRID=4326;POINT(${longitude} ${latitude})` })
        .eq("id", id);
    } catch {
      // Location denied/unavailable — the rule still saved; center stays null and simply
      // won't match server-side until a location is captured.
    }
  }

  return (
    <div className="rounded-[14px] border border-line bg-panel">
      <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
        Alertas a contactos · más ajustado
      </div>

      <div className="flex items-center justify-between border-t border-line px-3.5 py-3 text-[13px]">
        <span>Enviar alertas por WhatsApp</span>
        <button
          type="button"
          aria-pressed={rule.enabled}
          onClick={() => save({ ...rule, enabled: !rule.enabled })}
          className={`relative h-[22px] w-[38px] flex-none rounded-full ${
            rule.enabled ? "bg-accent" : "bg-line"
          }`}
        >
          <span
            className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all ${
              rule.enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <label className="flex items-center justify-between border-t border-line px-3.5 py-3 text-[13px]">
        <span>Severidad mínima</span>
        <select
          value={rule.min_severity}
          onChange={(e) => save({ ...rule, min_severity: Number(e.target.value) })}
          className="rounded-lg border border-line bg-panel-2 px-2 py-1 font-mono text-[12px] text-ink"
        >
          {[3, 4, 5].map((s) => (
            <option key={s} value={s}>
              {s}+ · grave
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center justify-between border-t border-line px-3.5 py-3 text-[13px]">
        <span>Radio</span>
        <select
          value={rule.radius_meters}
          onChange={(e) => save({ ...rule, radius_meters: Number(e.target.value) })}
          className="rounded-lg border border-line bg-panel-2 px-2 py-1 font-mono text-[12px] text-ink"
        >
          {[300, 500, 1000].map((m) => (
            <option key={m} value={m}>
              {m} m
            </option>
          ))}
        </select>
      </label>

      <p className="px-3.5 py-2.5 text-[10.5px] text-faint">
        Tus alertas normales usan 3 km — a contactos solo lo muy cercano y grave.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck` then `npm run dev` (Supabase local, signed in), open
http://localhost:3000/profile/security.
Expected: typecheck passes. Change "Severidad mínima" and "Radio" and toggle the switch — each change
persists (reload keeps the selected values; a single `alert_rules` row per user, updated in place, no
duplicates). In DevTools → Network, the write PATCHes/POSTs `alert_rules`; after the browser location
prompt is granted, a follow-up request sets `center` to `SRID=4326;POINT(lng lat)`. Denying location
leaves the rule saved with `center` null and shows no error.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/AlertRulesForm.tsx
git commit -m "fix(safety): persist alert rule via read-then-write and capture geofence center"
```

---

### Task 5: Working SOS button (`SosButton`) — FR-26, ADR-017

**Files:**
- Modify: `frontend/components/SosButton.tsx`

**Interfaces:**
- Consumes: `supabase`, `config` from `@/lib`; `POST ${config.functionsUrl}/proximity-dispatcher`
  with body `{ type: 'sos', location: { lat, lng } }` and `Authorization: Bearer <access token>`
  (CONTRACT §4). Response `{ dispatched: number }`.
- Produces: no new exported symbols (same default export).

- [ ] **Step 1: Fix the payload and confirm dispatch.** The current file sends the wrong shape
  (`{ sos: { lat, long } }`) — the contract requires `{ type: 'sos', location: { lat, lng } }`.
  Parse `{ dispatched }` from the response and show it in Spanish. Replace the entire file contents:

```tsx
"use client";

import { useRef, useState } from "react";
import { supabase, config } from "@/lib";

// Manual panic button. Press-and-hold to send the user's current location to their accepted
// emergency contacts via the proximity-dispatcher function (manual-SOS payload, CONTRACT §4).
const HOLD_MS = 1200;

export default function SosButton() {
  const [state, setState] = useState<"idle" | "arming" | "sending" | "sent" | "error">(
    "idle",
  );
  const [dispatched, setDispatched] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fire() {
    setState("sending");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        }),
      );
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sin sesión");
      const res = await fetch(`${config.functionsUrl}/proximity-dispatcher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "sos",
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        }),
      });
      if (!res.ok) throw new Error(`SOS falló: ${res.status}`);
      const body = (await res.json()) as { dispatched?: number };
      setDispatched(body.dispatched ?? 0);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  function startHold() {
    setState("arming");
    timer.current = setTimeout(fire, HOLD_MS);
  }

  function cancelHold() {
    if (timer.current) clearTimeout(timer.current);
    if (state === "arming") setState("idle");
  }

  const label =
    state === "sent"
      ? `Enviado a ${dispatched} ${dispatched === 1 ? "contacto" : "contactos"}`
      : state === "sending"
        ? "Enviando…"
        : state === "error"
          ? "No se pudo enviar — reintenta"
          : "SOS · Botón de pánico";

  return (
    <button
      type="button"
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      className="mt-1 flex w-full flex-col items-center gap-1 rounded-2xl border-0 bg-gradient-to-b from-[#FF6B6B] to-[#DE2A2A] px-3 py-3.5 text-white shadow-[0_12px_30px_-12px_#ff4d4d]"
    >
      <b className="text-[15px] font-extrabold tracking-wide">🆘 {label}</b>
      <small className="text-[10.5px] font-medium opacity-90">
        Mantén presionado para enviar tu ubicación a tus contactos
      </small>
    </button>
  );
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck` then `npm run dev`. With B5 running locally
(`supabase functions serve proximity-dispatcher --no-verify-jwt`) and signed in, open
http://localhost:3000/profile/security.
Expected: typecheck passes. Press-and-hold the red SOS button ~1.2s → it shows "Enviando…", then
"Enviado a N contactos" where N is the `dispatched` count returned by the function. In DevTools →
Network, the POST body is exactly `{"type":"sos","location":{"lat":…,"lng":…}}` with an
`Authorization: Bearer` header. Releasing before the hold completes cancels (stays "SOS · Botón de
pánico"). A non-2xx response shows "No se pudo enviar — reintenta".

- [ ] **Step 3: Commit**

```bash
git add frontend/components/SosButton.tsx
git commit -m "fix(safety): send contract-correct SOS payload and confirm dispatched count"
```
