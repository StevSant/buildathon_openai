// Builds the self-contained ESM bundles the Edge Functions import through
// deploy-import-map.json (@pulso/core -> ./_pkg/core.mjs, @pulso/adapters ->
// ./_pkg/adapters.mjs).
//
// Why this exists: @pulso/core and @pulso/adapters are Node/TypeScript packages
// that re-export whole directories (export * from './ai'). Deno's bundler — used
// by `supabase functions deploy` — does not do Node-style directory/index
// resolution, so deploying against the raw source (the dev deno.json map) fails
// with "EISDIR: illegal operation on a directory, read". We pre-bundle the two
// packages into single files with esbuild and deploy against those instead.
//
// Run before deploying:
//   node supabase/functions/build-pkg.mjs        (from backend/)
//   supabase functions deploy <name> --import-map supabase/functions/deploy-import-map.json
//
// npm deps (openai, @supabase/supabase-js) stay external — the deploy import map
// maps them to npm: specifiers that Deno resolves at runtime. @pulso/core stays
// external in the adapters bundle so both bundles share one core instance.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const functionsDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(functionsDir, "..", "..");
const outDir = resolve(functionsDir, "_pkg");
const EXTERNAL_NPM = ["openai", "@supabase/supabase-js"];

const targets = [
  { entry: resolve(backendDir, "core", "index.ts"), outfile: resolve(outDir, "core.mjs"), external: EXTERNAL_NPM },
  {
    entry: resolve(backendDir, "adapters", "index.ts"),
    outfile: resolve(outDir, "adapters.mjs"),
    external: [...EXTERNAL_NPM, "@pulso/core"],
  },
];

await Promise.all(
  targets.map((target) =>
    build({
      entryPoints: [target.entry],
      outfile: target.outfile,
      bundle: true,
      format: "esm",
      platform: "neutral",
      external: target.external,
      logLevel: "info",
    }),
  ),
);
