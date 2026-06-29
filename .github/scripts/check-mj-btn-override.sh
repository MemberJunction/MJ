#!/usr/bin/env bash
#
# CI gate: .mj-btn override prevention
#
# Fails when any changed .css or .scss file outside the canonical button
# stylesheet defines `.mj-btn` rules. The `mjButton` directive owns the
# button's appearance — overrides silently fork the styling.
#
# Files under any `docs/` or `plans/` directory are skipped entirely —
# they hold mockups, prototypes, and documentation snippets, not shipped
# component styles.
#
# Usage:
#   ./check-mj-btn-override.sh                # check files changed vs origin/next
#   ./check-mj-btn-override.sh --base <ref>   # check files changed vs <ref>
#   ./check-mj-btn-override.sh --all          # check ALL .css/.scss
#   ./check-mj-btn-override.sh --file <path>  # check a single file

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CANONICAL="packages/Angular/Generic/ui-components/src/lib/button/button.scss"
BASE_REF="${BASE_REF:-origin/next}"
MODE="diff"
SINGLE_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --base) BASE_REF="$2"; shift 2 ;;
        --all) MODE="all"; shift ;;
        --file) MODE="single"; SINGLE_FILE="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

# Detect .mj-btn class selectors in CSS/SCSS. Match `.mj-btn` followed by
# a non-identifier character (so we catch `.mj-btn`, `.mj-btn:hover`,
# `.mj-btn.active`, `.mj-btn--variant`, etc., but not unrelated identifiers).
#
# A rule is allowed if a comment containing `@mj-btn-override:` appears in
# any of the 3 lines immediately above it. Use the annotation only for
# documented one-offs — the reason MUST appear after the colon:
#
#   /* @mj-btn-override: reason this override is needed (issue #1234) */
#   .mj-btn.warning { ... }
find_mj_btn_rules() {
    local file="$1"
    perl -e '
        my @raw;
        while (<STDIN>) { chomp; push @raw, $_; }

        # Record any line containing an @mj-btn-override: annotation.
        # The annotation only matters when in a comment; outside a comment
        # the string would be a CSS syntax error so we trust the developer.
        my %has_annotation;
        for my $i (0..$#raw) {
            $has_annotation{$i} = 1 if $raw[$i] =~ /\@mj-btn-override:/;
        }

        # Strip block + line comments so commented-out rules are not flagged.
        my $stripped = join("\n", @raw);
        $stripped =~ s{/\*.*?\*/}{ "\n" x ($& =~ tr/\n//) }gse;
        my @clean = split /\n/, $stripped, -1;
        for (@clean) { s{//.*$}{}; }

        for my $i (0..$#clean) {
            next unless $clean[$i] =~ /\.mj-btn(?![a-zA-Z0-9_-])/;
            # Allowed if any of the 3 lines immediately above has the annotation.
            my $protected = 0;
            for my $j (($i >= 3 ? $i - 3 : 0)..($i - 1)) {
                if ($has_annotation{$j}) { $protected = 1; last; }
            }
            printf "%d:%s\n", $i + 1, $raw[$i] unless $protected;
        }
    ' < "$file" 2>/dev/null || true
}

get_files_to_check() {
    case "$MODE" in
        single)
            echo "$SINGLE_FILE"
            ;;
        all)
            find "$REPO_ROOT/packages/Angular" \
                \( -name '*.css' -o -name '*.scss' \) \
                -not -path '*/node_modules/*' \
                -not -path '*/dist/*' \
                -not -path '*/docs/*' \
                -not -path '*/plans/*' \
                | sed "s|^$REPO_ROOT/||"
            ;;
        diff)
            cd "$REPO_ROOT"
            git diff --name-only --diff-filter=AM "$BASE_REF"...HEAD \
                | grep -E '\.(css|scss)$' \
                | grep -v node_modules \
                | grep -v '/dist/' \
                | grep -vE '(^|/)(docs|plans)/' \
                || true
            ;;
    esac
}

VIOLATIONS=0
CHECKED=0
SKIPPED=0

while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$REPO_ROOT/$file" ] && continue

    # The canonical stylesheet is allowed to define .mj-btn
    if [ "$file" = "$CANONICAL" ]; then
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    CHECKED=$((CHECKED + 1))
    offending=$(find_mj_btn_rules "$REPO_ROOT/$file")
    if [ -n "$offending" ]; then
        echo "::error file=$file::.mj-btn override detected. Use mjButton directive inputs (variant, size) instead."
        echo ""
        echo "❌ $file"
        echo "$offending" | sed 's/^/    /'
        echo ""
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
done < <(get_files_to_check)

echo ""
echo "─────────────────────────────────────────"
echo ".mj-btn override prevention: $CHECKED checked, $SKIPPED canonical, $VIOLATIONS violations"
echo "─────────────────────────────────────────"

if [ "$VIOLATIONS" -gt 0 ]; then
    cat <<EOF

Component-scoped .mj-btn overrides are not allowed.

The mjButton directive owns the button's appearance. Overriding it in
component CSS silently forks the styling — different buttons in different
contexts end up looking different even when they share the same directive.

If you need a different visual, use the directive's inputs:
  <button mjButton variant="primary" size="sm">…</button>
  <button mjButton variant="ghost" size="md">…</button>

Variants: 'primary' | 'secondary' | 'flat' | 'ghost' | 'danger' | 'icon'
Sizes:    'sm' | 'md' | 'lg'

If a genuinely new variant is needed, add it to the canonical:
  packages/Angular/Generic/ui-components/src/lib/button/button.scss

For documented one-off overrides (rare), add an annotation in the 3 lines
above the rule:

  /* @mj-btn-override: reason this override is needed (issue #1234) */
  .mj-btn.warning { ... }

The reason after the colon is required for code review.
EOF
    exit 1
fi

exit 0
