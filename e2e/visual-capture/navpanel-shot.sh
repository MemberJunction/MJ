#!/usr/bin/env bash
#
# Capture the DataExplorer navigation-panel (#1 collapsible migration) in both
# themes, forcing the section expand/collapse state via the Angular debug API so
# the [Fill] entities tree + capped Favorites/Recent bodies are visible.
#
# Usage: e2e/visual-capture/navpanel-shot.sh <out-basename> <fav 0|1> <recent 0|1> <entities 0|1>
# Writes: plans/complete/collapsible-section-screenshots/nav-panel-fill/<out>-light.png and -dark.png
#
# Prereq: dev server up, playwright-cli already navigated to a data-explorer entity page.

set -eu
OUT="${1:?usage: navpanel-shot.sh <out> <fav> <recent> <entities>}"
FAV="${2:-0}"; REC="${3:-1}"; ENT="${4:-1}"
DIR="plans/complete/collapsible-section-screenshots/nav-panel-fill"
mkdir -p "$DIR"

FORCE="var el=document.querySelector('mj-explorer-navigation-panel'); if(el){var c=ng.getComponent(el); c.favoritesSectionExpanded=${FAV}===1; c.recentSectionExpanded=${REC}===1; c.entitiesSectionExpanded=${ENT}===1; ng.applyChanges(c);}"

shoot() { # $1 = theme js  $2 = filename
  npx playwright-cli eval "() => { ${1}; ${FORCE} return 1; }" >/dev/null 2>&1 || true
  sleep 1
  npx playwright-cli screenshot --full-page --filename="$DIR/$2" >/dev/null 2>&1
}

shoot "document.documentElement.removeAttribute('data-theme');" "${OUT}-light.png"
shoot "document.documentElement.setAttribute('data-theme','dark');" "${OUT}-dark.png"
npx playwright-cli eval "() => { document.documentElement.removeAttribute('data-theme'); return 1; }" >/dev/null 2>&1 || true

echo "wrote $DIR/${OUT}-light.png and $DIR/${OUT}-dark.png"
