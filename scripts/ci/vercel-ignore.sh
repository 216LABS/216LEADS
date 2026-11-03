#!/usr/bin/env bash
# Vercel Ignored Build Step (ignoreCommand in apps/web/vercel.json).
# Exit 0 skips the build; exit 1 builds. Skips only when every changed file is docs or tests.
# Anything it cannot work out (shallow clone, first deploy) builds.
cd "$(git rev-parse --show-toplevel)" || exit 1
base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
changed=$(git diff --name-only "$base" HEAD 2>/dev/null) || { echo "No base commit to compare; building."; exit 1; }
[ -n "$changed" ] || { echo "No changed files found; building."; exit 1; }
if printf '%s\n' "$changed" | grep -qvE '^docs/|\.md$|\.(test|spec)\.tsx?$|/__snapshots__/|/__fixtures__/|^apps/web/e2e/'; then
  echo "App files changed; building."
  exit 1
fi
echo "Only docs or tests changed since $base; skipping the build."
exit 0
