#!/usr/bin/env bash
#
# Capture the Integration Visual Field Editor (#4) Field Mappings + Sync Info
# accordions in both themes, forcing the section expand state via the Angular
# debug API. Prereq: playwright-cli already on a connection's entity-map editor
# (app-visual-field-editor mounted).
#
# Usage: e2e/visual-capture/integration-fieldmaps-shot.sh <out-basename> <fieldmaps 0|1> <syncinfo 0|1>
# Writes: plans/complete/collapsible-section-screenshots/integration-field-maps/<out>-light.png and -dark.png

set -eu
OUT="${1:?usage: integration-fieldmaps-shot.sh <out> <fieldmaps> <syncinfo>}"
FM="${2:-1}"; SI="${3:-0}"
DIR="plans/complete/collapsible-section-screenshots/integration-field-maps"
mkdir -p "$DIR"

FORCE="var el=document.querySelector('app-visual-field-editor'); if(el){var c=ng.getComponent(el); c.FieldMapsExpanded=${FM}===1; c.InfoPanelExpanded=${SI}===1; ng.applyChanges(c);}"

shoot() {
  npx playwright-cli eval "() => { ${1}; ${FORCE} return 1; }" >/dev/null 2>&1 || true
  sleep 1
  npx playwright-cli screenshot --full-page --filename="$DIR/$2" >/dev/null 2>&1
}

shoot "document.documentElement.removeAttribute('data-theme');" "${OUT}-light.png"
shoot "document.documentElement.setAttribute('data-theme','dark');" "${OUT}-dark.png"
npx playwright-cli eval "() => { document.documentElement.removeAttribute('data-theme'); return 1; }" >/dev/null 2>&1 || true

echo "wrote $DIR/${OUT}-light.png and $DIR/${OUT}-dark.png"
