#!/usr/bin/env bash
#
# Dual-mode visual capture — THE standard for per-site UI visual verification.
#
# Screenshots the CURRENT playwright-cli browser page in BOTH light and dark, so
# every visual check covers both themes (a migration that looks right in light can
# still be wrong in dark — always verify both). Dark is forced by setting
# `data-theme="dark"` on <html> (which drives the --mj-* design tokens); reverted
# after.
#
# For CONDITIONAL UI (alerts/error states that only show when a flag is set), pass
# a force snippet that re-applies the state in EACH theme (toggling can re-render
# and clear it). Use the Angular dev debug API, e.g.:
#   ng.getComponent(document.querySelector('mj-role-dialog')).error='...'; ng.applyChanges(...)
#
# Usage:
#   scripts/visual-shot-dual.sh <out-basename> [force-js]
# Writes: plans/alert-screenshots/migrated/<out>-light.png  and  -dark.png
#
# Prereq: dev server up, playwright-cli already navigated to the target page/state.

set -eu
OUT="${1:?usage: visual-shot-dual.sh <out-basename> [force-js]}"
FORCE="${2:-}"
DIR="plans/alert-screenshots/migrated"
mkdir -p "$DIR"

shoot() { # $1 = theme on|off  $2 = filename
  npx playwright-cli eval "() => { ${1}; ${FORCE} return 1; }" >/dev/null 2>&1 || true
  sleep 1
  npx playwright-cli screenshot --full-page --filename="$DIR/$2" >/dev/null 2>&1
}

shoot "document.documentElement.removeAttribute('data-theme');" "${OUT}-light.png"
shoot "document.documentElement.setAttribute('data-theme','dark');" "${OUT}-dark.png"
# leave the app in light
npx playwright-cli eval "() => { document.documentElement.removeAttribute('data-theme'); return 1; }" >/dev/null 2>&1 || true

echo "wrote $DIR/${OUT}-light.png and $DIR/${OUT}-dark.png"
