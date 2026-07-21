// Bundles the create-realtime-session Edge Function into a single ESM file so the
// Supabase CLI can deploy it. The CLI's module walker cannot follow the Node-style
// directory imports used by the @pulso/core and @pulso/adapters barrels (EISDIR),
// while the deployed edge runtime accepts them — bundling sidesteps the walker.
//
// Output: .deploy/supabase/functions/create-realtime-session/index.ts
// Deploy: npx supabase functions deploy create-realtime-session --workdir .deploy
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

await build({
  absWorkingDir: repoRoot,
  entryPoints: ["backend/supabase/functions/create-realtime-session/index.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  // Resolved at runtime by the deploy import map (npm: specifiers).
  external: ["@supabase/supabase-js", "openai"],
  alias: {
    "@pulso/core": "./backend/core/index.ts",
    "@pulso/adapters": "./backend/adapters/index.ts",
  },
  outfile: ".deploy/supabase/functions/create-realtime-session/index.ts",
});

console.log("bundled .deploy/supabase/functions/create-realtime-session/index.ts");
