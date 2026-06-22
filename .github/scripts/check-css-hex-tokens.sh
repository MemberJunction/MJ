#!/usr/bin/env bash
#
# CI gate: hex-color enforcement
#
# Fails if any changed .css or .scss file contains hardcoded hex color values
# outside the documented allowlist or outside `var(--token, #fallback)` syntax.
#
# Usage:
#   ./check-css-hex-tokens.sh                # check files changed vs origin/next
#   ./check-css-hex-tokens.sh --base <ref>   # check files changed vs <ref>
#   ./check-css-hex-tokens.sh --all          # check ALL .css/.scss in packages/Angular
#   ./check-css-hex-tokens.sh --file <path>  # check a single file

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ALLOWLIST="$REPO_ROOT/.github/scripts/ci/hex-allowlist.txt"
BASE_REF="${BASE_REF:-origin/next}"
MODE="diff"
SINGLE_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --base) BASE_REF="$2"; shift 2 ;;
        --all) MODE="all"; shift ;;
        --file) MODE="single"; SINGLE_FILE="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

is_allowlisted() {
    local file="$1"
    grep -v '^#' "$ALLOWLIST" | grep -v '^[[:space:]]*$' | while read -r pattern; do
        if [ "$file" = "$pattern" ]; then
            echo "MATCH"
            return
        fi
    done | grep -q MATCH
}

find_offending_hex() {
    local file="$1"
    # Use perl to:
    #   1. Strip /* ... */ block comments (including multi-line) per file
    #   2. Strip // line comments
    #   3. Strip var(--token, #hex) fallback patterns
    #   4. Then emit "lineno:content" for any remaining hex
    perl -0777 -ne '
        # Strip block comments globally (across newlines)
        s{/\*.*?\*/}{ "\n" x ($& =~ tr/\n//) }gse;
        my @lines = split /\n/, $_, -1;
        for my $i (0..$#lines) {
            my $line = $lines[$i];
            # Strip // line comments
            $line =~ s{//.*$}{};
            # Strip var(--token, #hex) fallback patterns
            $line =~ s/var\([^)]*#[0-9a-fA-F]{3,8}[^)]*\)//g;
            if ($line =~ /#[0-9a-fA-F]{3,8}\b/) {
                printf "%d:%s\n", $i + 1, $lines[$i];
            }
        }
    ' "$file" 2>/dev/null || true
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
                | sed "s|^$REPO_ROOT/||"
            ;;
        diff)
            cd "$REPO_ROOT"
            git diff --name-only --diff-filter=AM "$BASE_REF"...HEAD \
                | grep -E '\.(css|scss)$' \
                | grep -v node_modules \
                | grep -v '/dist/' \
                || true
            ;;
    esac
}

VIOLATIONS=0
CHECKED=0
ALLOWLISTED=0

while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$REPO_ROOT/$file" ] && continue

    if is_allowlisted "$file"; then
        ALLOWLISTED=$((ALLOWLISTED + 1))
        continue
    fi

    CHECKED=$((CHECKED + 1))
    offending=$(find_offending_hex "$REPO_ROOT/$file")
    if [ -n "$offending" ]; then
        echo "::error file=$file::Hardcoded hex values detected. Use design tokens instead."
        echo ""
        echo "❌ $file"
        echo "$offending" | sed 's/^/    /'
        echo ""
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
done < <(get_files_to_check)

echo ""
echo "─────────────────────────────────────────"
echo "Hex color enforcement: $CHECKED checked, $ALLOWLISTED allowlisted, $VIOLATIONS violations"
echo "─────────────────────────────────────────"

if [ "$VIOLATIONS" -gt 0 ]; then
    cat <<EOF

Hardcoded hex values are not allowed in component CSS/SCSS.

Use design tokens instead:
  • Text:        var(--mj-text-primary), var(--mj-text-secondary), ...
  • Backgrounds: var(--mj-bg-surface), var(--mj-bg-page), ...
  • Brand:       var(--mj-brand-primary), var(--mj-brand-primary-hover)
  • Status:      var(--mj-status-success), var(--mj-status-error), ...
  • Borders:     var(--mj-border-default), var(--mj-border-strong)

Full token reference: CLAUDE.md → "Design Token System" section.

If your hex value is genuinely intentional (SVG paint, dark code editor,
print-media override, etc.), add the file to:
  .github/scripts/ci/hex-allowlist.txt
with a comment documenting which of the 6 categories it falls into
(see plans/complete/DESIGN_TOKEN_MIGRATION_PLAN.md).
EOF
    exit 1
fi

exit 0
