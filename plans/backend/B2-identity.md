# B2 — Identity Verification Implementation Plan

> **For the executing engineer (Codex):** implement task-by-task, top to bottom. Steps use
> checkbox (`- [ ]`) syntax. There are NO automated tests (ADR-015) — you verify each task by
> running the stated command and observing the described result. Commit after each task.

**Lane:** Backend (`backend/supabase/functions/verify-identity/**`, `backend/adapters/identity/**`,
`backend/adapters/persistence/**`, `backend/core/use-cases/verify-identity.ts`).
**Goal:** Finish the `verify-identity` edge function so a signed-in user submits their cédula,
it is validated (external registry if configured, else algorithmic module-10), and on success
their profile is marked verified — storing only an HMAC hash of the cédula, enforcing one
account per cédula, and returning exactly the CONTRACT §4 shape.
**Depends on:** B1 (the `profiles` table + its unique `cedula_hash`).
**Reads from CONTRACT:** §4 (`verify-identity` request/response), §6 (env split).

## Global Constraints (apply to every task)
- No hardcoded URLs / keys / thresholds — everything from Edge secrets via `getEnv()`
  (`CEDULA_HASH_PEPPER`, `IDENTITY_VERIFY_API_URL`, `IDENTITY_VERIFY_API_KEY`).
- One class/function per file; re-export through the package barrel.
- User-facing `reason` strings → **Spanish** (the client shows them). Comments/commits → English.
- The raw cédula is NEVER stored or logged; only its HMAC hash. The user id ALWAYS comes from
  the JWT (`userFromJwt`), never the request body.
- `supabase` CLI commands run from the `backend/` directory (that is where `supabase/config.toml` lives).

**Scaffold reality (verified):** the composition root
(`backend/supabase/functions/verify-identity/index.ts`), `AlgorithmicVerifier`,
`CompositeVerifier`, `RegistryApiVerifier`, `hashCedula`, `validateCedula`, and
`SupabaseProfileRepository.createVerified` all already have working bodies. This plan closes
three gaps: (1) one-account-per-cédula (FR-3) surfacing a clean reason, (2) the response shape
must match CONTRACT §4 exactly (`makeVerifyIdentity` currently leaks a `profile` field), and
(3) the `RegistryApiVerifier` response mapping is a stub `TODO`. Then it verifies end-to-end.

**FRs covered:** FR-1 (sign-up with cédula), FR-2 (validate; invalid blocks with a message),
FR-3 (one account per cédula), FR-4 (never store the raw cédula).

---

### Task 1: Enforce one-account-per-cédula (FR-3) in the profile repository

The `profiles.cedula_hash` column is `unique`. When a second user submits a cédula already
bound to another account, the upsert violates that constraint (Postgres error `23505`). Catch it
and surface a domain error the function can translate to a Spanish reason.

**Files:**
- Modify: `backend/adapters/persistence/supabase-profile-repository.ts` (the `createVerified` method)

**Interfaces:**
- Produces: `createVerified(...)` throws `new Error('cedula_taken')` on a unique-hash collision;
  otherwise returns the `Profile` as today.
- Consumed by: `makeVerifyIdentity` (Task 2) and the function (Task 3).

- [ ] **Step 1: Wrap the upsert to detect the unique-violation**

Replace the body of `createVerified` with:

```ts
  async createVerified(input: {
    userId: string;
    cedula: string;
    method: VerificationMethod;
  }): Promise<Profile> {
    const cedulaHash = await hashCedula(input.cedula, this.config.cedulaHashPepper);

    const { data, error } = await this.client
      .from('profiles')
      .upsert({
        id: input.userId,
        cedula_hash: cedulaHash,
        verified: true,
        verification_method: input.method,
      })
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation on cedula_hash → the cédula belongs to another account (FR-3).
      if (error.code === '23505' || /duplicate key|cedula_hash/i.test(error.message)) {
        throw new Error('cedula_taken');
      }
      throw new Error(error.message);
    }

    return this.toProfile(data as Record<string, any>);
  }
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: `backend/core` and `backend/adapters` compile with no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/adapters/persistence/supabase-profile-repository.ts
git commit -m "feat(identity): reject a cédula already bound to another account (FR-3)"
```

---

### Task 2: Return exactly the CONTRACT §4 shape from the use-case

CONTRACT §4 says `verify-identity` responds `{ verified: boolean, method: VerificationMethod,
reason?: string }`. The use-case currently returns `{ verified: true, method, profile }` — the
`profile` object is not part of the contract. Trim it, and map the `cedula_taken` error to a
Spanish reason.

**Files:**
- Modify: `backend/core/use-cases/verify-identity.ts`

**Interfaces:**
- Consumes: `IdentityVerifier.verify`, `ProfileRepository.createVerified` (throws `'cedula_taken'`).
- Produces: `makeVerifyIdentity(...)` returns `{ verified: false, reason?: string }` |
  `{ verified: true, method: VerificationMethod }`.

- [ ] **Step 1: Rewrite the use-case**

```ts
import type { IdentityVerifier, ProfileRepository } from '../ports';
import type { VerificationMethod } from '../domain';

type VerifyIdentityResult =
  | { verified: false; reason?: string }
  | { verified: true; method: VerificationMethod };

/**
 * Verify a cédula and, when valid, mark the caller's profile verified. The raw cédula is
 * passed to the repository (which hashes it) and never stored by this use-case. The result
 * matches CONTRACT §4 exactly.
 */
export function makeVerifyIdentity({
  verifier,
  profiles,
}: {
  verifier: IdentityVerifier;
  profiles: ProfileRepository;
}) {
  return async (input: { userId: string; cedula: string }): Promise<VerifyIdentityResult> => {
    const result = await verifier.verify(input.cedula);
    if (!result.valid) {
      return { verified: false, reason: result.reason };
    }

    try {
      await profiles.createVerified({
        userId: input.userId,
        cedula: input.cedula,
        method: result.method,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'cedula_taken') {
        return { verified: false, reason: 'Esta cédula ya está registrada en otra cuenta.' };
      }
      throw err;
    }

    return { verified: true, method: result.method };
  };
}
```

- [ ] **Step 2: Confirm the function just forwards this result**

Open `backend/supabase/functions/verify-identity/index.ts`. It already does
`Response.json(result, { headers: corsHeaders })` — with the trimmed use-case result this is now
exactly the CONTRACT §4 body. No change needed. (Confirm the error envelope stays `{ message }`
with 401 for `unauthorized`, 400 otherwise.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/core/use-cases/verify-identity.ts
git commit -m "refactor(identity): return the exact CONTRACT §4 verify-identity shape"
```

---

### Task 3: Map the registry provider response (only used when configured)

`RegistryApiVerifier.verify` has a `TODO` for the provider's real response shape. The algorithmic
path is the guaranteed one (FR-2), so this only matters when `IDENTITY_VERIFY_API_URL` is set.
Make the mapping defensive so an unexpected body throws (routing `CompositeVerifier` to the
algorithmic fallback) rather than silently passing.

**Files:**
- Modify: `backend/adapters/identity/registry-api-verifier.ts`

**Interfaces:**
- Produces: `verify(cedula)` → `{ valid, method: 'registry', reason? }`, or throws on a
  non-OK response or an unrecognized body (so the composite falls back to algorithmic).

- [ ] **Step 1: Harden the response mapping**

Replace the part after the `fetch` with:

```ts
    if (!response.ok) {
      // Throwing lets CompositeVerifier route to the algorithmic fallback.
      throw new Error(`Identity provider responded ${response.status}`);
    }

    const data = (await response.json()) as { valid?: unknown; reason?: unknown };
    if (typeof data.valid !== 'boolean') {
      // Unknown shape → don't guess; fall back to the algorithmic verifier.
      throw new Error('Identity provider returned an unrecognized body');
    }

    return {
      valid: data.valid,
      method: 'registry',
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    };
```

> Note: the exact field names depend on the provider you wire via `IDENTITY_VERIFY_API_URL`.
> If the provider uses different keys (e.g. `{ isValid, message }`), adjust the reads here — this
> is the ONLY place that knows the provider's shape.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/adapters/identity/registry-api-verifier.ts
git commit -m "fix(identity): defensive registry response mapping with algorithmic fallback"
```

---

### Task 4: Verify end-to-end against the local stack

`verify-identity` has `verify_jwt = true`, so it needs a real user token. Create a local user,
grab its access token, and call the function.

**Files:** none (verification only).

- [ ] **Step 1: Set the pepper secret for local functions**

Create/append `backend/supabase/functions/.env` (git-ignored) with a local pepper:
```
CEDULA_HASH_PEPPER=local-dev-pepper-change-me
```
(Do NOT commit real secrets. `IDENTITY_VERIFY_API_URL` stays unset locally so the algorithmic
path runs.)

- [ ] **Step 2: Serve the function with the DB up**

Run (two terminals, both from `backend/`):
```bash
cd backend && supabase start
cd backend && supabase functions serve verify-identity --env-file supabase/functions/.env
```
Expected: the function boots and logs `Serving functions on http://127.0.0.1:54321/functions/v1/verify-identity`.

- [ ] **Step 3: Create a local user and capture its access token**

Run (anon key is printed by `supabase start`):
```bash
ANON="<anon key from supabase start>"
TOKEN=$(curl -s "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: $ANON" -H "content-type: application/json" \
  -d '{"email":"demo@pulso.ec","password":"pulso1234"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
echo "$TOKEN"
```
Expected: prints a JWT (a signed-in local user now exists).

- [ ] **Step 4: Verify a VALID cédula succeeds**

Run (use any cédula that passes module-10; `0602910944` is a valid example format):
```bash
curl -s "http://127.0.0.1:54321/functions/v1/verify-identity" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"cedula":"0602910944"}'
```
Expected: `{"verified":true,"method":"algorithmic"}`.

- [ ] **Step 5: Verify an INVALID cédula is blocked (FR-2)**

Run:
```bash
curl -s "http://127.0.0.1:54321/functions/v1/verify-identity" \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"cedula":"1234567890"}'
```
Expected: `{"verified":false,"reason":"La cédula no supera la validación (módulo 10)."}`.

- [ ] **Step 6: Verify the raw cédula was NOT stored**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select verified, verification_method, cedula_hash from public.profiles limit 5;"
```
Expected: `verified = t`, `verification_method = algorithmic`, and `cedula_hash` is a 64-char hex
string — never the raw digits (FR-4).

- [ ] **Step 7: Commit** (verification note only)

```bash
git commit --allow-empty -m "chore(identity): verify-identity verified end-to-end (valid/invalid/hash-only)"
```

---

## Self-review notes
- **Coverage:** FR-1 (function accepts `{cedula}` from a signed-in user) ✓; FR-2 (algorithmic
  validation, invalid blocked with Spanish reason) ✓; FR-3 (`cedula_taken` → Spanish reason) ✓;
  FR-4 (only `cedula_hash` stored, verified in Task 4 Step 6) ✓.
- **Contract:** response is exactly `{ verified, method, reason? }` (CONTRACT §4).
- **Lane:** only `backend/**`. Frontend consumes this via F1.
- **Security:** user id from JWT only; pepper + provider creds from env; raw cédula never persisted.
