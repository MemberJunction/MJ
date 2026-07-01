#!/usr/bin/env bash
#
# Force-state visual harness for <mj-alert>.
#
# Alerts are conditional UI (shown only on error/empty/special states), so you
# can't eyeball them by loading a page. This renders EVERY real-world shape the
# migration produces (each variant x message/title/dismiss/actions/sm) into one
# static page, using the component's OWN styles extracted from source + the real
# design tokens — so it never drifts from the component and needs no running app.
#
# Output: plans/complete/alert-screenshots/alert-states.html  (open it, or screenshot for
# a visual-regression baseline). Regenerate after any change to mj-alert.
#
# Usage: scripts/alert-states-gallery.sh

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMP="$ROOT/packages/Angular/Generic/ui-components/src/lib/alert/alert.component.ts"
TOKENS_SCSS="$ROOT/packages/Angular/Generic/shared/src/lib/_tokens.scss"
# NOTE: writes into the completed alert-migration archive; repoint out of
# plans/complete/ if reusing for active work.
OUT="$ROOT/plans/complete/alert-screenshots/alert-states.html"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# 1. Real design tokens (light :root + [data-theme=dark]).
"$ROOT/node_modules/.bin/sass" --no-source-map "$TOKENS_SCSS" "$TMP/tokens.css" >/dev/null

# 2. Extract the component's inline styles block and translate :host -> .mj-alert
#    so the same rules apply to a static wrapper element (no hand-copied CSS).
awk '/styles: \[`/{f=1;next} f&&/`\]/{f=0} f{print}' "$COMP" \
  | sed -E 's/:host\(([^)]*)\)/\1/g; s/:host/.mj-alert/g' > "$TMP/alert.css"

# 3. One fixture row.
row() { # $1 classes  $2 icon  $3 title(optional)  $4 message  $5 extra-html
  printf '<div class="mj-alert %s">' "$1"
  [ -n "$2" ] && printf '<i class="mj-alert__icon %s"></i>' "$2"
  printf '<div class="mj-alert__content">'
  [ -n "$3" ] && printf '<div class="mj-alert__title">%s</div>' "$3"
  printf '<div class="mj-alert__message">%s</div></div>%s</div>\n' "$4" "$5"
}

col() { # $1 themeClass $2 themeAttr $3 label
  printf '<div class="themecol %s" %s><h1>%s — mj-alert states</h1><div class="demo">\n' "$1" "$2" "$3"
  echo '<h2>info · message</h2>';      row "mj-alert--info"    "fa-solid fa-circle-info" "" "Changes are saved automatically." ""
  echo '<h2>success · title+message</h2>'; row "mj-alert--success" "fa-solid fa-circle-check" "Saved" "Your changes have been published." ""
  echo '<h2>warning · dismissible</h2>';   row "mj-alert--warning" "fa-solid fa-triangle-exclamation" "Unsaved changes" "Leaving now will discard them." '<button class="mj-alert__dismiss"><i class="fa-solid fa-xmark"></i></button>'
  echo '<h2>error · with action</h2>';     row "mj-alert--error"   "fa-solid fa-circle-exclamation" "" "Couldn't load permissions." '<div class="mj-alert__actions"><button class="ga-btn">Retry</button></div>'
  echo '<h2>error · sm</h2>';               row "mj-alert--error mj-alert--sm" "fa-solid fa-circle-exclamation" "" "Field is required." ""
  echo '</div></div>'
}

mkdir -p "$(dirname "$OUT")"
{
  echo '<!doctype html><html><head><meta charset="utf-8">'
  echo '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">'
  echo '<style>'
  cat "$TMP/tokens.css"
  cat "$TMP/alert.css"
  cat <<'CSS'
*{box-sizing:border-box} body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b1220}
.wrap{display:flex} .themecol{padding:24px;width:50%} .light{background:var(--mj-bg-page)}
h1{font-size:15px;margin:0 0 14px;color:var(--mj-text-primary)} h2{font-size:11px;text-transform:uppercase;letter-spacing:.6px;opacity:.55;margin:18px 0 6px;color:var(--mj-text-primary)}
.demo{max-width:560px;display:flex;flex-direction:column;gap:10px}
.ga-btn{border:1px solid currentColor;background:transparent;color:inherit;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;font-weight:600}
CSS
  echo '</style></head><body><div class="wrap">'
  col "light" "" "LIGHT"
  col "" 'data-theme="dark" style="background:var(--mj-bg-page)"' "DARK"
  echo '</div></body></html>'
} > "$OUT"

echo "Wrote $OUT"
echo "Open it, or screenshot for a visual baseline. Styles are extracted live from alert.component.ts (no drift)."
