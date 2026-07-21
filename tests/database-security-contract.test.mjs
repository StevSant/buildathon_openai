import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const normalize = (sql) => sql.toLowerCase().replace(/\s+/g, " ");

const [initSql, safetySql] = await Promise.all([
  readFile(new URL("../backend/supabase/migrations/0001_init.sql", import.meta.url), "utf8"),
  readFile(
    new URL("../backend/supabase/migrations/0002_whatsapp_sos.sql", import.meta.url),
    "utf8",
  ),
]);

const init = normalize(initSql);
const safety = normalize(safetySql);

test("keeps identity and incident state server-owned", () => {
  assert.match(
    init,
    /revoke all on public\.profiles from anon, authenticated/,
  );
  assert.match(init, /revoke all on public\.incidents from anon, authenticated/);
  assert.match(
    init,
    /revoke all on public\.incident_confirmations from anon, authenticated/,
  );
});

test("restricts privileged community voting to authenticated callers", () => {
  assert.match(init, /create or replace function public\.confirm_incident/);
  assert.match(init, /security definer/);
  assert.match(init, /where i\.id = target_id for update/);
  assert.match(init, /if uid is null then raise exception 'not authenticated'/);
  assert.match(
    init,
    /revoke all on function public\.confirm_incident\(uuid, text\) from public, anon/,
  );
  assert.match(
    init,
    /grant execute on function public\.confirm_incident\(uuid, text\) to authenticated/,
  );
});

test("keeps dispatch logs and alert matching server-owned", () => {
  assert.match(
    safety,
    /revoke all on public\.whatsapp_config, public\.emergency_contacts, public\.alert_rules, public\.whatsapp_dispatch_log from anon, authenticated/,
  );
  assert.match(
    safety,
    /revoke all on function public\.get_alert_matches\(uuid\) from public, anon, authenticated/,
  );
  assert.match(
    safety,
    /grant insert \(user_id, enabled, phone_e164\) on public\.whatsapp_config to authenticated/,
  );
  assert.match(
    safety,
    /grant update \(enabled, phone_e164\) on public\.whatsapp_config to authenticated/,
  );
  assert.match(
    safety,
    /grant insert \(owner_id, display_name, phone_e164\) on public\.emergency_contacts to authenticated/,
  );
  assert.doesNotMatch(safety, /grant (?:insert|update) \([^)]*opt_in_status/);
  assert.doesNotMatch(safety, /grant (?:insert|update) \([^)]*verified/);
});
