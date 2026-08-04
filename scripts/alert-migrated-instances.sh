#!/usr/bin/env bash
#
# Migrated-instances gallery for <mj-alert>.
#
# Renders the ACTUAL alerts produced by each migration (real text + variant + size
# + icon overrides) so they can be eyeballed in light AND dark without driving the
# live app (the alerts are conditional/deep in flows, and the dev snapshot tooling
# is unreliable). Uses the component's OWN styles extracted from source + real
# tokens — no drift, deterministic. Regenerate as more areas migrate.
#
# Output: plans/complete/alert-screenshots/migrated-instances.html
# Usage:  scripts/alert-migrated-instances.sh

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMP="$ROOT/packages/Angular/Generic/ui-components/src/lib/alert/alert.component.ts"
TOKENS_SCSS="$ROOT/packages/Angular/Generic/shared/src/lib/_tokens.scss"
# NOTE: writes into the completed alert-migration archive; repoint out of
# plans/complete/ if reusing for active work.
OUT="$ROOT/plans/complete/alert-screenshots/migrated-instances.html"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

"$ROOT/node_modules/.bin/sass" --no-source-map "$TOKENS_SCSS" "$TMP/tokens.css" >/dev/null
awk '/styles: \[`/{f=1;next} f&&/`\]/{f=0} f{print}' "$COMP" \
  | sed -E 's/:host\(([^)]*)\)/\1/g; s/:host/.mj-alert/g' > "$TMP/alert.css"

# One migrated alert: $1 variant  $2 size(sm|"")  $3 icon-class  $4 inner-html
alert() {
  local cls="mj-alert mj-alert--$1"; [ -n "$2" ] && cls="$cls mj-alert--$2"
  printf '<div class="%s">' "$cls"
  printf '<i class="mj-alert__icon %s"></i>' "$3"
  printf '<div class="mj-alert__content">%s</div></div>\n' "$4"
}

# default icon per variant (matches the component)
ic() { case "$1" in info) echo 'fa-solid fa-circle-info';; success) echo 'fa-solid fa-circle-check';; warning) echo 'fa-solid fa-triangle-exclamation';; error) echo 'fa-solid fa-circle-exclamation';; esac; }

col() { # $1 themeAttr  $2 label
  printf '<div class="themecol" %s><h1>%s</h1><div class="demo">\n' "$1" "$2"

  echo '<div class="grp">explorer-settings · confirm-delete modals (committed)</div>'
  alert warning "" "$(ic warning)" 'This will affect all users assigned to this role.'
  alert warning "" "$(ic warning)" 'This will remove all entity associations for this application.'

  echo '<div class="grp">SystemDiagnostics (committed)</div>'
  alert info "" "$(ic info)" '<strong>What is this?</strong> This section shows entities that are loaded by multiple engines. Redundant loading indicates potential optimization opportunities.'
  alert warning "" "fa-solid fa-lightbulb" '<strong>Recommendation:</strong> Consider consolidating data loading by having dependent engines access data from a parent engine.'
  alert warning "" "$(ic warning)" '<strong>Telemetry is disabled.</strong> Enable telemetry to track RunView, RunQuery, and Engine loading performance.'
  alert warning "" "$(ic warning)" '<strong>Cache not initialized.</strong> The LocalCacheManager requires initialization with a storage provider during app startup.'
  alert warning sm "$(ic warning)" 'This pattern has been called 5 times. Consider caching or batching.'

  echo '<div class="grp">Integration (committed)</div>'
  alert warning "" "$(ic warning)" '<div class="vw"><span>Source field "amount" is not mapped to any target.</span><span>Target field "status" has no source.</span></div>'
  alert warning sm "$(ic warning)" '<div><div>Column "legacy_id" will be dropped.</div><div>Type change on "created" may truncate data.</div></div>'

  echo '<div class="grp">AI / Testing / DatabaseDesigner (committed)</div>'
  alert warning "" "$(ic warning)" 'Merging is not available for this entity. Detection results are read-only.'
  alert warning "" "$(ic warning)" 'Low agreement may indicate evaluation criteria need refinement.'
  alert warning "" "$(ic warning)" 'You do not have authorization to create entities in any schema. Contact your administrator.'

  echo '<div class="grp">MCP — error / success (committed)</div>'
  printf '<div class="mj-alert mj-alert--error"><i class="mj-alert__icon %s"></i><div class="mj-alert__content">Failed to connect to MCP server.</div><button class="mj-alert__dismiss"><i class="fa-solid fa-xmark"></i></button></div>\n' "$(ic error)"
  alert error "" "$(ic error)" 'Name is required.'
  alert success "" "$(ic success)" 'Execution Successful <span style="float:right;font-size:0.75rem">142ms</span>'
  alert error "" "$(ic error)" 'Execution Failed'

  echo '<div class="grp">Generic packages (pending commit)</div>'
  alert error "" "$(ic error)" 'Could not load form preview — component spec missing.'
  alert info "" "$(ic info)" '<div>Materializes <strong>128 records</strong> from <strong>Active Users</strong> into a static List.</div>'
  alert success "" "$(ic success)" 'Safe operation — no records will be removed from the list.'
  alert error "" "$(ic error)" '<div><strong>12 record(s) will be removed from this list.</strong> These records are members today but are no longer matched by the source.</div>'
  alert success "" "$(ic success)" 'Feedback submitted successfully!'
  alert error "" "$(ic error)" 'You do not have permission to share this resource.'

  echo '<div class="grp">core-entity-forms (committed)</div>'
  alert error "" "$(ic error)" 'Could not load provider catalog — driver not found.'
  alert warning "" "$(ic warning)" 'The selected provider'"'"'s <code>DriverClass</code> is not registered with this MJServer build.'
  printf '<div class="mj-alert mj-alert--error"><i class="mj-alert__icon %s"></i><div class="mj-alert__content"><div class="mj-alert__title">Query execution failed</div><div style="margin-top:8px;font-family:monospace;font-size:0.9em">Invalid column name '"'"'Foo'"'"'.</div></div></div>\n' "$(ic error)"
  alert error "" "$(ic error)" '<strong>Missing or malformed RuntimeActionConfiguration.</strong> This Runtime action cannot run until a valid configuration is supplied.'
  printf '<div class="mj-alert mj-alert--warning"><i class="mj-alert__icon %s"></i><div class="mj-alert__content"><div class="mj-alert__title">Wildcard permissions enabled</div><div style="font-size:0.9em">This runtime action has wildcard flags that bypass the allowlists below.</div></div></div>\n' "$(ic warning)"
  alert warning "" "$(ic warning)" 'Output example is required when output type is '"'"'object'"'"'.'

  echo '</div></div>'
}

mkdir -p "$(dirname "$OUT")"
{
  echo '<!doctype html><html><head><meta charset="utf-8">'
  echo '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">'
  echo '<style>'
  cat "$TMP/tokens.css"; cat "$TMP/alert.css"
  cat <<'CSS'
*{box-sizing:border-box} body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{display:flex} .themecol{padding:24px;width:50%;background:var(--mj-bg-page)}
h1{font-size:13px;margin:0 0 14px;color:var(--mj-text-primary);text-transform:uppercase;letter-spacing:.6px}
.grp{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--mj-text-muted);margin:18px 0 4px}
.demo{max-width:560px;display:flex;flex-direction:column;gap:8px}
.vw{display:flex;flex-direction:column;gap:2px}
CSS
  echo '</style></head><body><div class="wrap">'
  col "" "Light — migrated instances"
  col 'data-theme="dark"' "Dark — migrated instances"
  echo '</div></body></html>'
} > "$OUT"
echo "Wrote $OUT"
