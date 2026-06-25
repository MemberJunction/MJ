#!/usr/bin/env bash
#
# Measures adoption of canonical MJ UI components vs bespoke patterns.
# Output: plans/adoption-metrics.md (date-stamped markdown table).
# Run from repo root: ./scripts/measure-ui-adoption.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANGULAR_DIR="$REPO_ROOT/packages/Angular"
OUTPUT="$REPO_ROOT/plans/adoption-metrics.md"
DATE=$(date +"%Y-%m-%d")

# Exclude dist, node_modules, and .spec/.test files from all counts
EXCLUDE="--include=*.html --include=*.ts --exclude-dir=node_modules --exclude-dir=dist"
EXCLUDE_CSS="--include=*.css --include=*.scss --exclude-dir=node_modules --exclude-dir=dist"

count() {
  { grep -rl $EXCLUDE "$@" "$ANGULAR_DIR" 2>/dev/null || true; } | wc -l | tr -d ' '
}

count_matches() {
  { grep -r $EXCLUDE "$@" "$ANGULAR_DIR" 2>/dev/null || true; } | wc -l | tr -d ' '
}

count_css() {
  { grep -rl $EXCLUDE_CSS "$@" "$ANGULAR_DIR" 2>/dev/null || true; } | wc -l | tr -d ' '
}

count_css_matches() {
  { grep -r $EXCLUDE_CSS "$@" "$ANGULAR_DIR" 2>/dev/null || true; } | wc -l | tr -d ' '
}

# ─── Buttons ───
btn_canonical=$(count_matches -E 'mjButton|mj-button')
btn_total=$(count_matches '<button')
btn_bespoke=$((btn_total - btn_canonical))
if [ "$btn_total" -gt 0 ]; then
  btn_pct=$((btn_canonical * 100 / btn_total))
else
  btn_pct=0
fi

# ─── Switches ───
switch_canonical=$(count_matches '<mj-switch')
switch_total_checkbox=$(count_matches 'type="checkbox"')
switch_total=$((switch_canonical + switch_total_checkbox))
if [ "$switch_total" -gt 0 ]; then
  switch_pct=$((switch_canonical * 100 / switch_total))
else
  switch_pct=0
fi

# ─── Loading ───
loading_canonical=$(count_matches '<mj-loading')
loading_spinner=$(count_matches 'fa-spinner')
loading_total=$((loading_canonical + loading_spinner))
if [ "$loading_total" -gt 0 ]; then
  loading_pct=$((loading_canonical * 100 / loading_total))
else
  loading_pct=0
fi

# ─── Text inputs (.mj-input) ───
input_canonical=$(count_matches 'mj-input')
input_bare=$(count_matches -E 'type="text"|type="email"|type="url"|type="tel"|type="password"|type="search"')
input_total=$((input_canonical + input_bare))
if [ "$input_total" -gt 0 ]; then
  input_pct=$((input_canonical * 100 / input_total))
else
  input_pct=0
fi

# ─── Checkboxes (.mj-checkbox) ───
checkbox_canonical=$(count_matches 'mj-checkbox')
checkbox_total=$(count_matches 'type="checkbox"')
if [ "$checkbox_total" -gt 0 ]; then
  checkbox_pct=$((checkbox_canonical * 100 / checkbox_total))
else
  checkbox_pct=0
fi

# ─── Numeric input ───
numeric_canonical=$(count_matches '<mj-numeric-input')
numeric_bare=$(count_matches 'type="number"')
numeric_total=$((numeric_canonical + numeric_bare))
if [ "$numeric_total" -gt 0 ]; then
  numeric_pct=$((numeric_canonical * 100 / numeric_total))
else
  numeric_pct=0
fi

# ─── Datepicker ───
datepicker_canonical=$(count_matches '<mj-datepicker')
datepicker_bare=$(count_matches 'type="date"')
datepicker_total=$((datepicker_canonical + datepicker_bare))
if [ "$datepicker_total" -gt 0 ]; then
  datepicker_pct=$((datepicker_canonical * 100 / datepicker_total))
else
  datepicker_pct=0
fi

# ─── Empty-state (canonical SHIPPED — tracked as adoption %) ───
# Canonical = the <mj-empty-state> component. Bespoke = placeholder elements whose
# class contains "empty" / no-data / no-results / no-records / no-selection.
#
# TWO-TIER COUNT (precision without re-introducing the under-count blind spot):
#   1. RAW widened set — the broad class-token match MINUS the long-standing structural
#      exclusions (the canonical component itself, flex/layout helper classes kept on
#      migrated empties, table cell markers, dropdown popup rows, BEM `--empty` state
#      flags, commented code). This is the anti-blind-spot baseline — reported as-is.
#   2. GENUINE bespoke — tier 1 MINUS documented NON-PLACEHOLDER false-positives that the
#      wave-2 classification pass proved are not area placeholders (see $empty_nonplaceholder_re).
#      Adoption % is computed against this so it reflects genuine remaining work.
# Both numbers (+ the excluded delta) are reported, so nothing is silently hidden.
# Still grep-based + approximate (a bespoke-named WRAPPER around a migrated <mj-empty-state>
# on a separate line can over-count by one); the classification pass remains the exact source.
empty_canonical=$(count_matches '<mj-empty-state')
_empty_bespoke_raw_lines() {
  { grep -rE $EXCLUDE 'class="[^"]*(empty|no-data|no-results|no-records|no-selection)[^"]*"' "$ANGULAR_DIR" 2>/dev/null || true; } \
    | grep -vE 'mj-empty-state|empty-fill|empty-hint|empty-state-fill|empty-state-features|empty-row|empty-cell|dropdown-empty|--empty' \
    | grep -vE '<!--|//[[:space:]]|/\*'
}
# Documented NON-PLACEHOLDER false-positives (SKIP categories, proven by the wave-2 pass):
#   child/sub-element helpers (empty-subtext/-text/-icon/-title/-message/-label/-close/-recent/-meta/-name/-subtitle)
#   picker/dropdown popup "no options" rows (BEM __empty element, mj-dropdown-no-data, suggest-empty)
#   excluded-by-design chat greeting slots (mj-chat-empty-state-default*, conversation-empty-state)
#   table-cell markers (empty-val) · BEM state flags (is-empty) · inline analytics/config status text
#   (search-analytics-empty, schedule-empty) · drag-drop hints (section-drop-empty) · hints projected
#   INTO an already-migrated empty (empty-state-hint, rc-empty-state-hint) · sub-text (no-results-message)
empty_nonplaceholder_re='empty-val|is-empty|empty-subtext|empty-subtitle|empty-text|empty-icon|empty-title|empty-message|empty-label|empty-close|empty-recent|empty-meta|empty-name|__empty|mj-dropdown-no-data|suggest-empty|chat-empty-state-default|conversation-empty-state|search-analytics-empty|schedule-empty|section-drop-empty|empty-state-hint|no-results-message|results-empty-message'
empty_bespoke_raw=$(_empty_bespoke_raw_lines | grep -c . | tr -d ' ')
empty_bespoke=$(_empty_bespoke_raw_lines | grep -vE "$empty_nonplaceholder_re" | grep -c . | tr -d ' ')
empty_excluded=$((empty_bespoke_raw - empty_bespoke))
empty_total=$((empty_canonical + empty_bespoke))
if [ "$empty_total" -gt 0 ]; then
  empty_pct=$((empty_canonical * 100 / empty_total))
else
  empty_pct=0
fi

# ════════════════════════════════════════════════════════════════════════════
# ⚠️  MARKER BLIND-SPOT WARNING — READ BEFORE TRUSTING THE "bespoke" COUNTS BELOW
# ════════════════════════════════════════════════════════════════════════════
# The empty-state baseline ("213") UNDER-scoped the real work by ~3x: its marker
# matched only three literal class names (empty-state / no-data / no-results) and
# was blind to bespoke-named variants (drill-down-empty, rt-empty, dashboard-empty,
# ve-preview-empty, ...). The honest universe was ~619, not ~218. The empty-state
# block ABOVE shows the fix: a BROAD class-token match MINUS documented helpers /
# cell-markers / state-modifiers.
#
# EVERY "new component" marker BELOW still has that same narrow blind spot. Before
# you start migrating any of them, WIDEN its bespoke marker the same way first, or
# you'll declare victory against an under-counted baseline. Likely-missed variants:
#
#   Detail-panel      detail-panel  →  ALSO side-panel, drawer, slide-in,
#                                       record-panel, info-panel, *-detail-panel
#   Status-indicator  status-badge/dot/pill  →  ALSO state-badge, status-chip,
#                                       status-label, *-status, badge--success/-error spans
#   Collapsible       section-header  →  ALSO accordion*, collapse*, expandable*,
#                                       panel-header(+toggle), native <details>
#   Badge/pill        badge/pill/notification-badge  →  ALSO chip, tag, label,
#                                       count-badge, *-badge variants
#   Stat-tile         stat-*/kpi-card/metric-card  →  ALSO metric-tile, kpi-tile,
#                                       summary-card, stat-card, big-number, *-metric
#   Form-section      class="form-section" (EXACT!)  →  ALSO form-group, field-group,
#                                       fieldset, form-row, *-section
#   Confirm-dialog    window.confirm/.confirm(  →  ALSO bespoke modal confirms,
#                                       <mj-dialog> used as confirm, ConfirmService callers
#
# Process: run a BROAD classification grep first (count + eyeball the class names),
# THEN tighten by excluding helpers/cell-markers/modifiers. Don't trust a narrow
# marker's optimistic %. (Lesson from the empty-state wave-1 redo.)
# ════════════════════════════════════════════════════════════════════════════

# ─── Detail panels (bespoke — canonical doesn't exist yet) ───
drawer_canonical=$(count_matches '<mj-detail-drawer')
drawer_bespoke=$(count_css 'detail-panel')
drawer_total=$((drawer_canonical + drawer_bespoke))

# ─── Status indicators (bespoke — canonical doesn't exist yet) ───
status_canonical=$(count_matches '<mj-status-indicator')
status_badge=$(count_css 'status-badge')
status_dot=$(count_css 'status-dot')
status_pill=$(count_css 'status-pill')
status_bespoke=$((status_badge + status_dot + status_pill))
status_total=$((status_canonical + status_bespoke))

# ─── Collapsible sections (bespoke — canonical doesn't exist yet) ───
collapsible_canonical=$(count_matches '<mj-collapsible-section')
collapsible_bespoke=$(count_css 'section-header')
collapsible_total=$((collapsible_canonical + collapsible_bespoke))

# ─── Badges/pills (bespoke — canonical doesn't exist yet) ───
badge_canonical=$(count_matches '<mj-badge')
badge_bespoke=$(count_css_matches -E '\.badge|\.pill|\.mj-pill|\.notification-badge')
badge_total=$((badge_canonical + badge_bespoke))

# ─── Stat tiles (bespoke — canonical doesn't exist yet) ───
stat_canonical=$(count_matches '<mj-stat-tile')
stat_bespoke=$(count_css_matches -E 'stat-item|stat-label|stat-value|kpi-card|metric-card')
stat_total=$((stat_canonical + stat_bespoke))

# ─── Form sections (bespoke — canonical doesn't exist yet) ───
form_canonical=$(count_matches '<mj-form-section')
form_bespoke=$(count 'class="form-section"')
form_total=$((form_canonical + form_bespoke))

# ─── Confirm dialogs (bespoke — canonical doesn't exist yet) ───
confirm_canonical=$(count_matches '<mj-confirm-dialog')
confirm_window=$(count_matches -E 'window\.confirm|\.confirm\(')
confirm_bespoke_files=$(count 'confirm-dialog')
confirm_bespoke=$((confirm_window + confirm_bespoke_files))
confirm_total=$((confirm_canonical + confirm_bespoke))

# ─── Output ───
cat > "$OUTPUT" << HEADER
# UI Adoption Metrics

> Auto-generated by \`scripts/measure-ui-adoption.sh\`. Do not edit manually.
>
> **Last measured**: $DATE
> **Search scope**: \`packages/Angular/\` (excluding \`node_modules\`, \`dist\`)

---

## Existing primitives (adoption %)

Components that already exist — tracking migration progress to 100%.

| Component | Canonical | Bespoke | Total | Adoption |
|-----------|-----------|---------|-------|----------|
| Button (\`mjButton\`) | $btn_canonical | $btn_bespoke | $btn_total | **${btn_pct}%** |
| Switch (\`<mj-switch>\`) | $switch_canonical | $switch_total_checkbox | $switch_total | **${switch_pct}%** |
| Loading (\`<mj-loading>\`) | $loading_canonical | $loading_spinner | $loading_total | **${loading_pct}%** |
| Text input (\`.mj-input\`) | $input_canonical | $input_bare | $input_total | **${input_pct}%** |
| Checkbox (\`.mj-checkbox\`) | $checkbox_canonical | $checkbox_total | $checkbox_total | **${checkbox_pct}%** |
| Numeric (\`<mj-numeric-input>\`) | $numeric_canonical | $numeric_bare | $numeric_total | **${numeric_pct}%** |
| Datepicker (\`<mj-datepicker>\`) | $datepicker_canonical | $datepicker_bare | $datepicker_total | **${datepicker_pct}%** |
| Empty-state (\`<mj-empty-state>\`) | $empty_canonical | $empty_bespoke | $empty_total | **${empty_pct}%** |

> **Empty-state precision note**: \`Bespoke\` counts **genuine placeholder** elements only.
> The widened class-token match found **$empty_bespoke_raw** bespoke-ish hits; **$empty_excluded**
> are documented NON-placeholders (child helper sub-elements, picker/dropdown "no options"
> rows, chat greeting slots, table-cell markers, BEM state flags, inline-status text, drag
> hints, and hints projected into an already-migrated empty) excluded per the SKIP-classification
> rules. The remaining **$empty_bespoke** are genuine bespoke empties still to migrate (many in
> packages outside the wave-2 scope). The raw widened count is retained as the anti-blind-spot
> baseline so narrowing can never silently hide a real bespoke empty.

## New components (bespoke pattern counts)

Components not yet built — tracking how many bespoke patterns need to be replaced.

| Pattern | Canonical | Bespoke | Files/Instances |
|---------|-----------|---------|-----------------|
| Detail-panel | $drawer_canonical | $drawer_bespoke | ${drawer_bespoke} files with .detail-panel CSS |
| Status-indicator | $status_canonical | $status_bespoke | ${status_bespoke} files (.status-badge + .status-dot + .status-pill) |
| Collapsible-section | $collapsible_canonical | $collapsible_bespoke | ${collapsible_bespoke} files with .section-header CSS |
| Badge/pill | $badge_canonical | $badge_bespoke | ${badge_bespoke} CSS references |
| Stat-tile | $stat_canonical | $stat_bespoke | ${stat_bespoke} CSS references |
| Form-section | $form_canonical | $form_bespoke | ${form_bespoke} files with .form-section class |
| Confirm-dialog | $confirm_canonical | $confirm_bespoke | ${confirm_bespoke} patterns (window.confirm + bespoke components) |

---

## Methodology

### Existing primitives
- **Numerator**: grep for the canonical component/directive/class
- **Denominator**: canonical + bespoke alternatives (e.g., \`<button\` without \`mjButton\`)
- **Adoption %**: numerator / denominator × 100 (integer)
- Both \`.html\` templates and \`.ts\` inline templates are counted

### New components
- Canonical count will be 0 until the component ships
- Bespoke count = number of patterns to be replaced
- Counts are file-based (how many files contain the pattern) or match-based (total instances) as noted

### Known limitations
- ~5% margin of error from grep-based counting (commented-out code, false positives in string literals)
- Checkbox count includes both true checkboxes and toggle-styled checkboxes (switch denominator is overstated)
- Some bespoke patterns use non-standard class names not captured by these greps
- Trend over time matters more than exact point-in-time numbers

### Exclusions
- \`node_modules/\` and \`dist/\` directories
- Non-Angular files (server-side packages, CLI tools)
HEADER

echo "✓ Adoption metrics written to plans/adoption-metrics.md (measured $DATE)"
