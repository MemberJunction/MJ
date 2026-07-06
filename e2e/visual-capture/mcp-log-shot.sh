#!/usr/bin/env bash
#
# Capture the MCP log detail panel (#5) Input Arguments / Result / Error accordions
# in both themes, forcing the section expand flags via the Angular debug API.
# Prereq: playwright-cli with the MCP log detail panel open (a log row clicked).
#
# Usage: e2e/visual-capture/mcp-log-shot.sh <out-basename>
# Writes: plans/complete/collapsible-section-screenshots/mcp-log-detail/<out>-light.png and -dark.png

set -eu
OUT="${1:?usage: mcp-log-shot.sh <out>}"
DIR="plans/complete/collapsible-section-screenshots/mcp-log-detail"
mkdir -p "$DIR"

FORCE="var el=document.querySelector('mj-mcp-dashboard'); if(el){var c=ng.getComponent(el); c.LogInputArgsExpanded=true; c.LogResultExpanded=true; c.LogErrorExpanded=true; ng.applyChanges(c);}"

shoot() {
  npx playwright-cli eval "() => { ${1}; ${FORCE} return 1; }" >/dev/null 2>&1 || true
  sleep 1
  npx playwright-cli screenshot --full-page --filename="$DIR/$2" >/dev/null 2>&1
}

shoot "document.documentElement.removeAttribute('data-theme');" "${OUT}-light.png"
shoot "document.documentElement.setAttribute('data-theme','dark');" "${OUT}-dark.png"
npx playwright-cli eval "() => { document.documentElement.removeAttribute('data-theme'); return 1; }" >/dev/null 2>&1 || true

echo "wrote $DIR/${OUT}-light.png and $DIR/${OUT}-dark.png"
