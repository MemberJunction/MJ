#!/usr/bin/env bash
#
# Capture the Application edit dialog (#6) Basic Info / Entities / System Info
# accordions in both themes, forcing the section expand flags via the Angular
# debug API. Prereq: playwright-cli with the Edit Application dialog open.
#
# Usage: e2e/screenshots/app-dialog-shot.sh <out-basename>
# Writes: plans/complete/collapsible-section-screenshots/app-dialog/<out>-light.png and -dark.png

set -eu
OUT="${1:?usage: app-dialog-shot.sh <out>}"
DIR="plans/complete/collapsible-section-screenshots/app-dialog"
mkdir -p "$DIR"

FORCE="var el=document.querySelector('mj-application-dialog'); if(el){var c=ng.getComponent(el); c.sectionExpanded.basicInfo=true; c.sectionExpanded.entities=true; c.sectionExpanded.systemInfo=true; ng.applyChanges(c);}"

shoot() {
  npx playwright-cli eval "() => { ${1}; ${FORCE} return 1; }" >/dev/null 2>&1 || true
  sleep 1
  npx playwright-cli screenshot --full-page --filename="$DIR/$2" >/dev/null 2>&1
}

shoot "document.documentElement.removeAttribute('data-theme');" "${OUT}-light.png"
shoot "document.documentElement.setAttribute('data-theme','dark');" "${OUT}-dark.png"
npx playwright-cli eval "() => { document.documentElement.removeAttribute('data-theme'); return 1; }" >/dev/null 2>&1 || true

echo "wrote $DIR/${OUT}-light.png and $DIR/${OUT}-dark.png"
