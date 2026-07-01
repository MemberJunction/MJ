#!/usr/bin/env bash
#
# Capture the agent flow-editor step properties panel (#9) accordions in both
# themes. Forces the flow editor's selectedStep + showPropertiesPanel via the
# Angular debug API (the foblex canvas node-selection is hard to drive headless).
# Prereq: playwright-cli on an agent's Flow Configuration (canvas) with >=1 step.
#
# Usage: e2e/visual-capture/agent-props-shot.sh <out-basename>
# Writes: plans/complete/collapsible-section-screenshots/agent-properties/<out>-light.png and -dark.png

set -eu
OUT="${1:?usage: agent-props-shot.sh <out>}"
DIR="plans/complete/collapsible-section-screenshots/agent-properties"
mkdir -p "$DIR"

FORCE="var all=[...document.querySelectorAll('*')]; var fe=null,steps=null; for(var i=0;i<all.length;i++){try{var c=ng.getComponent(all[i]); if(c&&c.steps&&c.steps.length&&('selectedStep' in c)){fe=c;steps=c.steps;break;}}catch(e){}} if(fe){fe.selectedStep=steps[0]; fe.selectedConnection=null; fe.selectedPathEntity=null; fe.showPropertiesPanel=true; ng.applyChanges(fe);}"

shoot() {
  npx playwright-cli eval "() => { ${1}; ${FORCE} return 1; }" >/dev/null 2>&1 || true
  sleep 1
  npx playwright-cli screenshot --full-page --filename="$DIR/$2" >/dev/null 2>&1
}

shoot "document.documentElement.removeAttribute('data-theme');" "${OUT}-light.png"
shoot "document.documentElement.setAttribute('data-theme','dark');" "${OUT}-dark.png"
npx playwright-cli eval "() => { document.documentElement.removeAttribute('data-theme'); return 1; }" >/dev/null 2>&1 || true

echo "wrote $DIR/${OUT}-light.png and $DIR/${OUT}-dark.png"
