#!/usr/bin/env bash
#
# Backdrop-independence harness for <mj-alert>.
#
# The bug Matt flagged: the SAME error alert looked different in two dialogs
# (pink in one, maroon in the other) in dark mode. Root cause was a TRANSLUCENT
# background — it composited with whatever surface sat behind it, and the two
# dialogs had different backdrops. The fix makes the variant background an OPAQUE
# tint (color-mix into the surface), which cannot pick up the backdrop.
#
# This harness PROVES the fix: it renders the identical error alert on several
# different backdrops (mimicking different dialog/panel surfaces), in light AND
# dark. If the alerts look identical across every backdrop, the fix holds. Uses
# the component's OWN styles extracted from source + real tokens — no drift, no
# running app, deterministic.
#
# Output: plans/complete/alert-screenshots/backdrop-independence.html
# Usage:  scripts/alert-backdrop-independence.sh

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMP="$ROOT/packages/Angular/Generic/ui-components/src/lib/alert/alert.component.ts"
TOKENS_SCSS="$ROOT/packages/Angular/Generic/shared/src/lib/_tokens.scss"
OUT="$ROOT/plans/complete/alert-screenshots/backdrop-independence.html"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# Real design tokens (light :root + [data-theme=dark]).
"$ROOT/node_modules/.bin/sass" --no-source-map "$TOKENS_SCSS" "$TMP/tokens.css" >/dev/null

# Extract the component's inline styles, translate :host -> .mj-alert.
awk '/styles: \[`/{f=1;next} f&&/`\]/{f=0} f{print}' "$COMP" \
  | sed -E 's/:host\(([^)]*)\)/\1/g; s/:host/.mj-alert/g' > "$TMP/alert.css"

# The same error alert markup, placed inside a panel of a given background.
alert_on() { # $1 panel-style  $2 backdrop-label
  printf '<div class="panel" style="background:%s"><div class="plabel">%s</div>' "$1" "$2"
  printf '<div class="mj-alert mj-alert--error">'
  printf '<i class="mj-alert__icon fa-solid fa-circle-exclamation"></i>'
  printf '<div class="mj-alert__content"><div class="mj-alert__message">Couldn'"'"'t save changes. Please try again.</div></div>'
  printf '</div></div>\n'
}

col() { # $1 themeAttr $2 label
  printf '<div class="themecol" %s><h1>%s</h1><div class="demo">\n' "$1" "$2"
  # Different backdrops the alert might sit on across dialogs/panels:
  alert_on "var(--mj-bg-surface)"        "on --mj-bg-surface (plain dialog)"
  alert_on "var(--mj-bg-surface-card)"   "on --mj-bg-surface-card (tinted dialog)"
  alert_on "var(--mj-bg-surface-sunken)" "on --mj-bg-surface-sunken (inset panel)"
  alert_on "var(--mj-bg-page)"           "on --mj-bg-page (page bg)"
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
*{box-sizing:border-box} body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{display:flex}
.themecol{padding:24px;width:50%}
.themecol:first-child{background:var(--mj-bg-page)}
.themecol:last-child{background:var(--mj-bg-page)}
h1{font-size:14px;margin:0 0 16px;color:var(--mj-text-primary);text-transform:uppercase;letter-spacing:.6px}
.demo{display:flex;flex-direction:column;gap:18px;max-width:520px}
.panel{padding:16px;border-radius:10px;border:1px solid var(--mj-border-subtle)}
.plabel{font-size:10px;text-transform:uppercase;letter-spacing:.5px;opacity:.55;margin-bottom:8px;color:var(--mj-text-secondary)}
CSS
  echo '</style></head><body><div class="wrap">'
  col "" "Light — same alert, 4 backdrops"
  col 'data-theme="dark"' "Dark — same alert, 4 backdrops"
  echo '</div></body></html>'
} > "$OUT"

echo "Wrote $OUT"
echo "Open it (or screenshot). If the error alert looks identical across all 4 backdrops in each theme, the opaque-tint fix holds."
