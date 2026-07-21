#!/usr/bin/env bash
# Bundle @pulso/core and @pulso/adapters into single Deno-compatible ESM files
# under supabase/functions/_pkg/, so the Supabase Edge bundler can consume them.
#
# WHY: the shared packages live at backend/core and backend/adapters and use
# Node/tsc-style extensionless imports (`from './domain'`), which the Deno edge
# runtime cannot resolve. esbuild resolves and inlines all of that into one .mjs
# per package, leaving only the npm: deps and @pulso/core as externals (resolved
# by supabase/functions/deploy-import-map.json).
#
# Run before every `supabase functions deploy` and before local `functions serve`.
# Re-run whenever backend/core/** or backend/adapters/** change. Source of truth
# stays at backend/core and backend/adapters; _pkg/ is a gitignored build artifact.
set -euo pipefail

cd "$(dirname "$0")/.."            # -> backend/
DEST="supabase/functions/_pkg"
EXTERNALS_NPM=(--external:@supabase/supabase-js --external:openai)

rm -rf "$DEST"
mkdir -p "$DEST"

npx --yes esbuild core/index.ts \
  --bundle --format=esm --platform=neutral \
  "${EXTERNALS_NPM[@]}" \
  --outfile="$DEST/core.mjs"

npx --yes esbuild adapters/index.ts \
  --bundle --format=esm --platform=neutral \
  "${EXTERNALS_NPM[@]}" --external:@pulso/core \
  --outfile="$DEST/adapters.mjs"

echo "Bundled @pulso/core + @pulso/adapters -> $DEST/*.mjs"
