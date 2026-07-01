#!/usr/bin/env bash
#
# Coverage + regression gate: mj-alert adoption
#
# Measures migration of bespoke inline alerts/banners onto <mj-alert>, and (with
# --max) fails when the bespoke count exceeds a baseline so a new hand-rolled
# alert can't sneak back in. Markers come from a verified 4-agent classification
# sweep (see plans/alert-migration-inventory.md) — genuine alert classes only,
# with the documented false-positives EXCLUDED, plus an inline-style heuristic.
# Scans .html AND .ts (some alerts live in inline templates).
#
# Usage:
#   ./check-alerts.sh                 # report canonical/bespoke/% + remaining list
#   ./check-alerts.sh --max <N>       # also FAIL if bespoke+markerless > N (CI ratchet)
#   ./check-alerts.sh --list          # print every bespoke match (file:line)

# NB: no `pipefail` — grep legitimately exits 1 on no-match mid-pipe (the trailing
# wc/grep -c is what we want the status from).
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCOPE="$REPO_ROOT/packages/Angular"
MAX=""
LIST=0

while [ $# -gt 0 ]; do
  case "$1" in
    --max) MAX="$2"; shift 2 ;;
    --list) LIST=1; shift ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

INC=(--include='*.html' --include='*.ts')
EXC=(--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=generated --exclude-dir=initial-prototype-now-old)

# Genuine bespoke-alert class markers (verified). Bootstrap-style .alert + its
# modifiers, the *-banner family, box/card/panel forms, the .message+X-message
# pair, and the verified named one-offs.
GENUINE='class="[^"]*(alert-(error|danger|warning|info|success)|(error|mj-error|info|warning|status|status-warning|sync-result|recommendation|validation|success|merge-warning|fields-error|mj-flow-node-warning)-banner|warning-box|info-box|success-card|error-card|error-panel|result-header|suggestion-error|no-scopes-warning|no-schemas-warning|key-warning|security-note|security-notice|scope-tip|pattern-warning|calibration-warning|ddl-warning|auto-map-partial|provider-picker-(warning|error)|beta-warning|parent-info|alert-item|(message[^"]*(error|success)-message))[^"]*"|class="alert"|class="alert "'

# False-positives that the GENUINE pattern would otherwise sweep in
# (chrome/hero/state/transient) — see inventory. Dropped line-wise.
EXCLUDE='health-banner|health-warning|health-critical|health-alert|alert-header|clear-header|sync-progress-banner|saving-overlay|error-container|error-content'

# Markerless inline-style alerts: a status-tinted background set inline (no class).
# Two PRECISE signals only: the alert-designed semantic -bg token, and the hardcoded
# Bootstrap alert palette (warning #fff3cd, danger #f8d7da, success #d4edda/#f0fff4,
# info #d1ecf1, error #fff5f5, warn #fef3c7). NOTE: we deliberately do NOT match raw
# `background: color-mix(... var(--mj-status-X) ...)` — badges/pills/kpi-icons/legends
# use that too, so it can't tell an alert from a decoration. The handful of inline
# alerts written that way (e.g. action-form's wildcard/approval boxes) are tracked in
# the inventory and get migrated regardless; they're just not auto-counted here.
INLINE='style="[^"]*background:[^;"]*(--mj-status-(error|success|warning|info)-bg|#fff3cd|#f8d7da|#d4edda|#f0fff4|#d1ecf1|#fff5f5|#fef3c7)'

# Count <mj-alert> usage in CONSUMERS — exclude the component's own source
# (its TSDoc examples + DOM-test host template) which aren't real adoption.
canonical=$(grep -rHno "${EXC[@]}" "${INC[@]}" '<mj-alert' "$SCOPE" 2>/dev/null \
  | grep -v '/lib/alert/' | wc -l | tr -d ' ')

bespoke_matches=$(grep -rhnoE "${EXC[@]}" "${INC[@]}" "$GENUINE" "$SCOPE" 2>/dev/null | grep -vE "$EXCLUDE" || true)
bespoke=$(printf '%s' "$bespoke_matches" | grep -c . || true)

# Count inline-style alerts per-occurrence (not per-file). Exclude the <pre> error
# blob (a monospace content dump, not a banner — see inventory).
inline_matches=$(grep -rhnE "${EXC[@]}" "${INC[@]}" "$INLINE" "$SCOPE" 2>/dev/null | grep -v '<pre' || true)
inline=$(printf '%s' "$inline_matches" | grep -c . || true)

remaining=$((bespoke + inline))
total=$((canonical + remaining))
pct=0
[ "$total" -gt 0 ] && pct=$(( canonical * 100 / total ))

echo "mj-alert adoption"
echo "  canonical <mj-alert> ..... $canonical"
echo "  bespoke (class marker) ... $bespoke"
echo "  markerless (inline style)  $inline"
echo "  adoption ................. ${pct}%  ($canonical / $total)"

if [ "$LIST" = "1" ]; then
  echo; echo "── bespoke (class) ──"
  grep -rlnE "${EXC[@]}" "${INC[@]}" "$GENUINE" "$SCOPE" 2>/dev/null | grep -vE "$EXCLUDE" | sed "s#$REPO_ROOT/##" || true
  echo; echo "── markerless (inline-style status bg) ──"
  grep -rnE "${EXC[@]}" "${INC[@]}" "$INLINE" "$SCOPE" 2>/dev/null | grep -v '<pre' | sed "s#$REPO_ROOT/##" | cut -c1-160 || true
fi

if [ -n "$MAX" ] && [ "$remaining" -gt "$MAX" ]; then
  echo
  echo "FAIL: $remaining bespoke alerts > baseline $MAX — a new hand-rolled alert was added; use <mj-alert>." >&2
  exit 1
fi
