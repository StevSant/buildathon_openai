# F1 — Auth & Profile Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Frontend (`frontend/**`)
**Goal:** Wire the auth flow (email + password + cédula → `verify-identity` → profile upsert), guard the post-login route group behind a Supabase session, and render the verified profile hub.
**Depends on:** Nothing to start — the frontend codes against the frozen endpoints in `CONTRACT.md`. Full end-to-end sign-up verification also needs `B1` (the `profiles` table + RLS) and `B2` (the `verify-identity` Edge Function) deployed; every task still typechecks and the guard/sign-in path runs standalone. Called out per task.
**Reads from CONTRACT:** §2 (`VerificationMethod` type), §3.1 (auth calls), §4 (`verify-identity` request/response + error envelope), §6 (env split).

**FRs covered:** FR-1, FR-2, FR-3 (surfaced), FR-4, FR-27 (entry point) · **ADRs:** ADR-012 (email+password auth), ADR-014 (frontend imports types only from `@pulso/core`), ADR-015 (manual verification), ADR-019 (bare auth screen vs. tab-barred post-login shell; safety settings behind Perfil).

> **Scaffold note (read before you start):** the route pages already exist as thin scaffolds
> (`frontend/app/auth/page.tsx`, `frontend/app/(app)/layout.tsx`, `frontend/app/(app)/profile/page.tsx`,
> `frontend/app/(app)/profile/security/page.tsx`). This plan **fleshes out / fixes** them; it does
> not create routes. The order below deviates from the dispatch numbering on purpose: the session
> helpers (Task 1) land first because the layout guard (Task 2) and the profile (Task 4) consume them.

## Global Constraints (apply to every task)
- No hardcoded URLs / keys / thresholds — everything via env. On the frontend only `NEXT_PUBLIC_*`
  vars, read through `config` in `frontend/lib/config.ts` (see `CONTRACT.md` §6). Never read
  `process.env` directly in a component.
- One thin module per concern, re-exported through the dir barrel (`frontend/lib/index.ts`,
  `frontend/components/index.ts`); consumers import from `@/lib` / `@/components`, never a deep file.
  (Grouping a few related thin data-client functions in one file — as `lib/incidents.ts` already
  does — is the established pattern; `lib/auth.ts` follows it.)
- UI copy in **Spanish** (Ecuador locale). Code comments, commit messages, this doc → **English**.
- Commit convention: Conventional Commits in English (`feat:`, `fix:`, `chore:` …).
- TypeScript: no `any` in app code; explicit types on exported functions; `import type` for
  type-only imports. The frontend imports **types only** from `@pulso/core` (ADR-014 / CONTRACT §1).

---

### Task 1: Session helpers (`lib/auth.ts`)

**Files:**
- Create: `frontend/lib/auth.ts`
- Modify: `frontend/lib/index.ts`

**Interfaces:**
- Consumes: `supabase` (browser client from `frontend/lib/supabase.ts`); `Session` type from `@supabase/supabase-js`.
- Produces: `getSession(): Promise<Session | null>`, `onAuthChange(cb: (session: Session | null) => void): () => void`, `signOut(): Promise<void>` — all re-exported from `@/lib`. Task 2 and Task 4 consume these.

- [ ] **Step 1: Create the auth helpers module.**

```ts
// frontend/lib/auth.ts
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Thin auth helpers over the browser Supabase client (mirrors the lib/incidents.ts
// data-client pattern). Screens/layouts import these from "@/lib", never from this file.

// Current auth session (null when signed out). Reads the persisted browser session.
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Subscribe to auth-state changes; returns an unsubscribe function. The callback also
// fires once on subscribe with the initial session.
export function onAuthChange(
  callback: (session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
}

// End the session. Layouts guarding on session will route back to /auth.
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
```

- [ ] **Step 2: Re-export the helpers from the `lib` barrel.**

Replace the whole file so the new exports sit next to the existing `supabase` export:

```ts
// frontend/lib/index.ts
// Barrel for the thin data/HTTP client layer. Consumers import from "@/lib", never from
// the individual files.
export { config } from "./config";
export type { AppConfig } from "./config";
export { supabase } from "./supabase";
export { getSession, onAuthChange, signOut } from "./auth";
export { getNearbyIncidents, subscribeToIncidents } from "./incidents";
export { REALTIME_TOOLS } from "./realtime-tools";
export { decideAlertTier } from "./notifications";
export type { AlertTier } from "./notifications";
export { startRealtimeSession } from "./realtime-agent";
export type {
  AssistantHandle,
  AssistantStatus,
  AssistantCallbacks,
} from "./realtime-agent";
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npm run typecheck`
Expected: no errors. `getSession`, `onAuthChange`, and `signOut` are importable from `@/lib`
(you can confirm resolution without running the app; they are consumed in Tasks 2 & 4).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/auth.ts frontend/lib/index.ts
git commit -m "feat(auth): add session helpers (getSession, onAuthChange, signOut)"
```

---

### Task 2: Guard the `(app)` route group + mount the tab bar

**Files:**
- Modify: `frontend/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `getSession`, `onAuthChange` from `@/lib` (Task 1); `TabBar` from `@/components`; `useRouter` from `next/navigation`.
- Produces: an authenticated shell — every route under `app/(app)/**` (`/`, `/report`, `/assistant`, `/profile`, `/profile/security`, `/notifications`) renders only with a session; otherwise the user is redirected to `/auth`.

> **Extension points (do NOT build here — later plans, same shell):** F5 mounts the 3-tier
> notification host inside this layout; F6's `/profile/security` route already lives in this
> group. Keep the layout minimal so those additions slot in cleanly.

- [ ] **Step 1: Convert the layout to a client component that guards on the session.**

The current layout is a server component that only mounts `TabBar`. Replace the whole file
with a client component that blocks rendering until a session is confirmed, redirects to
`/auth` when there is none, and also redirects the moment the session ends (e.g. sign-out):

```tsx
// frontend/app/(app)/layout.tsx
"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { TabBar } from "@/components";
import { getSession, onAuthChange } from "@/lib";

// Post-login shell: guards the route group (redirect to /auth without a session) and mounts
// the persistent bottom tab bar (Mapa · Reportar · Cerca · Perfil). Auth screens stay bare
// (ADR-019). F5 will later mount the notification host here; F6's /profile/security route
// already lives inside this group.
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;

    async function guard() {
      const session = await getSession();
      if (!active) return;
      if (!session) {
        router.replace("/auth");
        return;
      }
      setChecked(true);
    }
    void guard();

    // Bounce back to /auth the moment the session ends (sign-out, expiry, another tab).
    const unsubscribe = onAuthChange((session) => {
      if (!session) router.replace("/auth");
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  if (!checked) {
    return (
      <div className="app-shell items-center justify-center">
        <span className="text-[13px] text-muted">Cargando…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      <TabBar />
    </div>
  );
}
```

- [ ] **Step 2: Verify (runs standalone — no backend needed for the redirect)**

Run: `cd frontend && npm run dev` → open http://localhost:3000
Expected: with no session in the browser, visiting `/` (or `/profile`, `/report`) shows a brief
"Cargando…" then redirects to `/auth`. The tab bar does **not** appear on `/auth`. (Requires
`NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` in `frontend/.env.local` so the client constructs;
copy `frontend/.env.local.example` → `.env.local` and fill the two Supabase values. No signed-in
session is needed to observe the redirect — `getSession()` returns `null` and the guard fires.)

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(app)/layout.tsx"
git commit -m "feat(app): guard the (app) route group behind a Supabase session"
```

---

### Task 3: Verify cédula on sign-up and upsert the profile (`AuthForm`)

**Files:**
- Modify: `frontend/components/AuthForm.tsx`

> `frontend/app/auth/page.tsx` already renders `<AuthForm />` inside a bare (tab-bar-less)
> shell and needs **no change** — the sign-in/sign-up toggle is `AuthForm`'s internal `mode`
> state. All work in this task is inside `AuthForm.tsx`.

**Interfaces:**
- Consumes: `supabase`, `config` from `@/lib`; `config.functionsUrl` (= `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1`); `VerificationMethod` type from `@pulso/core`; the `verify-identity` Edge Function — request `{ cedula: string }`, response `{ verified: boolean, method: VerificationMethod, reason?: string }`, error envelope `{ error: string }` (CONTRACT §4); the `profiles` table (owner-writable under RLS — see cross-lane assumption).
- Produces: a verified `auth.users` row + a `profiles` row (`display_name`, `verified`, `verification_method`); navigates to `/` on success.

**Why the rewrite:** the current `AuthForm` sends `{ cedula, displayName }` and only checks
`res.ok` (reading a non-contract `body.message`), and it never writes a profile. The frozen
contract is body `{ cedula }` → `{ verified, method, reason? }`, so this task aligns the request,
blocks sign-up when `verified` is false, and upserts the profile client-side.

- [ ] **Step 1: Replace `AuthForm.tsx` with the contract-aligned flow.**

Only the logic (imports + the two handlers + the response type) changes; the JSX below is the
existing markup, kept verbatim. Replace the whole file:

```tsx
// frontend/components/AuthForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VerificationMethod } from "@pulso/core";
import { supabase, config } from "@/lib";

type Mode = "signup" | "signin";

// verify-identity response (CONTRACT §4). The server derives the user from the JWT and
// returns whether the cédula is verified plus which method was used.
type VerifyIdentityResponse = {
  verified: boolean;
  method: VerificationMethod;
  reason?: string;
};

// Sign-up / sign-in with email + password + cédula. On sign-up we create the auth user,
// call verify-identity (JWT + cédula), block if it is not verified, then persist the public
// profile. The raw cédula only ever lives in this form's state and the request body —
// never stored raw, never in localStorage (FR-4).
export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cedula, setCedula] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // POST verify-identity with only the cédula (CONTRACT §4: body is { cedula }).
  async function verifyIdentity(accessToken: string): Promise<VerifyIdentityResponse> {
    const res = await fetch(`${config.functionsUrl}/verify-identity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ cedula }),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<
      VerifyIdentityResponse & { error: string }
    >;
    // Non-2xx → contract error envelope { error }. This is where FR-3 (one account per
    // cédula) surfaces: the server's UNIQUE-hash violation comes back as an error message.
    if (!res.ok) {
      throw new Error(body.error ?? "No pudimos verificar tu cédula");
    }
    return {
      verified: Boolean(body.verified),
      method: (body.method as VerificationMethod) ?? "algorithmic",
      reason: body.reason,
    };
  }

  async function handleSignUp() {
    // Client-side shape check only; the authoritative module-10 validation is server-side (FR-2).
    if (!/^\d{10}$/.test(cedula)) {
      throw new Error("La cédula debe tener 10 dígitos");
    }

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) throw signUpError;
    const session = data.session;
    const userId = data.user?.id;
    if (!session || !userId) {
      throw new Error("No se pudo iniciar sesión tras el registro");
    }

    const result = await verifyIdentity(session.access_token);
    if (!result.verified) {
      // Invalid cédula blocks sign-up with a clear message (FR-2).
      throw new Error(result.reason ?? "Tu cédula no pudo ser verificada");
    }

    // Persist the public profile. display_name comes from the form; verified /
    // verification_method come from the function. verify-identity has already inserted the
    // row (id + cedula_hash) server-side, so this upsert updates it with the display name.
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      display_name: displayName.trim() || null,
      verified: result.verified,
      verification_method: result.method,
    });
    if (profileError) throw profileError;
  }

  async function handleSignIn() {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) throw signInError;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await handleSignUp();
      } else {
        await handleSignIn();
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-3 px-5 py-5">
      <h2 className="mt-1 text-[22px] font-extrabold tracking-tight">
        {mode === "signup" ? "Crea tu cuenta" : "Inicia sesión"}
      </h2>
      <p className="m-0 text-[13px] text-muted">
        Cada reporte lleva una identidad real. Sin cuentas falsas.
      </p>

      {mode === "signup" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Nombre a mostrar
          </span>
          <input
            className="rounded-xl border border-line bg-panel px-3 py-3 text-sm text-ink outline-none"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="María Torres"
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Correo
        </span>
        <input
          type="email"
          required
          className="rounded-xl border border-line bg-panel px-3 py-3 text-sm text-ink outline-none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="maria.torres@correo.ec"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
          Contraseña
        </span>
        <input
          type="password"
          required
          className="rounded-xl border border-line bg-panel px-3 py-3 text-sm text-ink outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </label>

      {mode === "signup" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
            Cédula
          </span>
          <input
            inputMode="numeric"
            required
            maxLength={10}
            className="rounded-xl border border-line bg-panel px-3 py-3 font-mono text-sm tracking-widest text-ink outline-none"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            placeholder="0102030405"
          />
        </label>
      )}

      {error && <p className="m-0 text-[12px] text-sev-fire">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-1 flex w-full items-center justify-center rounded-[14px] bg-accent px-3 py-3 text-sm font-bold text-accent-ink disabled:opacity-60"
      >
        {busy
          ? "Un momento…"
          : mode === "signup"
            ? "Crear cuenta verificada"
            : "Entrar"}
      </button>

      {mode === "signup" && (
        <p className="m-0 flex items-start gap-2 text-[11.5px] text-faint">
          Tu cédula nunca se guarda: solo un hash. No se comparte ni se muestra a nadie.
        </p>
      )}

      <button
        type="button"
        onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
        className="mt-1 bg-transparent text-[12px] font-semibold text-accent"
      >
        {mode === "signup"
          ? "¿Ya tienes cuenta? Inicia sesión"
          : "¿Sin cuenta? Regístrate"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Verify (client-side check runs standalone; full flow needs B1 + B2)**

Run: `cd frontend && npm run typecheck` — expect no errors.
Then `npm run dev` → http://localhost:3000/auth:
- **Standalone (no backend):** in sign-up mode, enter a 9-digit cédula and submit → the form
  shows "La cédula debe tener 10 dígitos" in red, with **no** network request (the shape check
  fails before `signUp`). Toggling "¿Ya tienes cuenta?" switches to sign-in and hides the
  cédula/name fields.
- **Full path (with `B1` schema + `B2` verify-identity deployed and `.env.local` pointed at the
  project):** sign up with a valid cédula → on success you land on `/` (the map); the redirect
  means a session exists and a `profiles` row was written. An invalid or already-used cédula
  keeps you on `/auth` with the server's Spanish message shown.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/AuthForm.tsx
git commit -m "feat(auth): verify cédula on sign-up and upsert the profile"
```

---

### Task 4: Profile hub — verified badge, trust score, settings, sign-out

**Files:**
- Modify: `frontend/app/(app)/profile/page.tsx`

**Interfaces:**
- Consumes: `supabase`, `signOut` from `@/lib` (Task 1); the `profiles` table columns `display_name`, `verified`, `trust_score` (read via RLS — a user reads only their own row, ARCHITECTURE §5); `useRouter` from `next/navigation`; `Link` from `next/link`.
- Produces: the Perfil screen — profile card (name + "Verificado" badge), trust score, a settings list linking to `/profile/security` (FR-27 entry point, ADR-019), and a sign-out action returning to `/auth`.

**Why the change:** the current page reads only `display_name` + `verified` and signs out via an
inline `supabase.auth.signOut()`. This task adds the **trust score** (task requirement), turns the
verified state into a proper badge, and routes sign-out through the shared `signOut` helper.

- [ ] **Step 1: Replace the profile page.**

```tsx
// frontend/app/(app)/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, signOut } from "@/lib";

// Perfil — a hub, not one long scroll. A profile card (name + verified badge + trust score)
// over settings sections that each open a focused sub-page (iOS/Android settings pattern).
export default function ProfilePage() {
  const router = useRouter();
  const [name, setName] = useState<string>("");
  const [verified, setVerified] = useState(false);
  const [trustScore, setTrustScore] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, verified, trust_score")
        .eq("id", uid)
        .maybeSingle();
      setName((profile?.display_name as string) ?? data.user?.email ?? "");
      setVerified(Boolean(profile?.verified));
      setTrustScore(
        typeof profile?.trust_score === "number" ? profile.trust_score : null,
      );
    }
    void load();
  }, []);

  async function onSignOut() {
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
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck` — expect no errors.
Then `npm run dev`, sign in (or complete Task 3's sign-up), tap the **Perfil** tab:
- The card shows your display name (falling back to your email), a green **"✓ Verificado"** badge
  when the profile is verified, and a **Confianza** score when `trust_score` is present. Without a
  `profiles` row yet (backend not seeded) it degrades: email as name, "Sin verificar", no score.
- "Seguridad y WhatsApp" navigates to `/profile/security` (F6's screen).
- "Cerrar sesión" ends the session and returns to `/auth`; the `(app)` guard (Task 2) also
  prevents navigating back into the app without signing in again.

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(app)/profile/page.tsx"
git commit -m "feat(profile): show verified badge and trust score with sign-out"
```

---

## Cross-lane assumptions (flag to Person B / verify against `B1`)

1. **`public.profiles` shape + RLS.** This plan reads `display_name`, `verified`, `trust_score`
   and upserts `{ id, display_name, verified, verification_method }`. It assumes `B1` created
   `profiles` with those columns (`trust_score` defaulting server-side, `created_at default now()`)
   and RLS allowing the authenticated owner (`auth.uid() = id`) to `insert` / `update` / `select`
   their own row. `profiles` is **not** listed in CONTRACT §3.3's table-writes; ARCHITECTURE §5
   ("a user reads only their own `profiles` row") and §3.1 (verify-identity upserts the row) cover
   the read + server insert. If B1's RLS forbids client upsert, the display-name write in Task 3
   must move into `verify-identity` — a 30-second contract sync, not a code conflict.
2. **`verify-identity` ordering.** Per ARCHITECTURE §3.1, `verify-identity` inserts the row with
   `id` + `cedula_hash` + `verified` + `verification_method` server-side (the pepper/hash must be
   server-side). Task 3's client upsert therefore **updates** that row with `display_name`; the
   `verified`/`verification_method` write is an idempotent overlap of the values the function
   returned. Depends on `B2` returning the CONTRACT §4 shape `{ verified, method, reason? }`.
3. **Email confirmation disabled.** `handleSignUp` uses the session returned by `signUp`
   immediately (ADR-012: no email round-trip during the demo). If Supabase email confirmation is
   left on, `signUp` returns a null session and sign-up cannot complete — B1/project config must
   disable it.
