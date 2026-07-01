#!/usr/bin/env bash
#
# Capture the ERD entity-details panel (#11) Fields + Related Entities accordions
# in both themes, forcing section expand state via the Angular debug API.
# Prereq: playwright-cli on the ERD (Admin > Data & Schema) with an entity selected
# (mj-entity-details mounted).
#
# Usage: e2e/screenshots/erd-details-shot.sh <out-basename> <fields 0|1> <related 0|1>
# Writes: plans/complete/collapsible-section-screenshots/erd-entity-details/<out>-light.png and -dark.png

set -eu
OUT="${1:?usage: erd-details-shot.sh <out> <fields> <related>}"
F="${2:-1}"; R="${3:-1}"
DIR="plans/complete/collapsible-section-screenshots/erd-entity-details"
mkdir -p "$DIR"

FORCE="var el=document.querySelector('mj-entity-details'); if(el){var c=ng.getComponent(el); c.fieldsSectionExpanded=${F}===1; c.relationshipsSectionExpanded=${R}===1; ng.applyChanges(c);}"

shoot() {
  npx playwright-cli eval "() => { ${1}; ${FORCE} return 1; }" >/dev/null 2>&1 || true
  sleep 1
  npx playwright-cli screenshot --full-page --filename="$DIR/$2" >/dev/null 2>&1
}

shoot "document.documentElement.removeAttribute('data-theme');" "${OUT}-light.png"
shoot "document.documentElement.setAttribute('data-theme','dark');" "${OUT}-dark.png"
npx playwright-cli eval "() => { document.documentElement.removeAttribute('data-theme'); return 1; }" >/dev/null 2>&1 || true

echo "wrote $DIR/${OUT}-light.png and $DIR/${OUT}-dark.png"
