#!/usr/bin/env bash
#
# CI gate: template accessibility enforcement (check:a11y)
#
# Fails if any changed .html template contains one of the mechanical,
# high-precision accessibility violations below. Deliberately narrow — every
# rule here is a WCAG failure with essentially no false-positive surface:
#
#   1. <img> without an alt attribute (WCAG 1.1.1) — alt="", [alt] and
#      [attr.alt] bindings all count as provided.
#   2. Positive tabindex (tabindex="1"+) — hijacks focus order (WCAG 2.4.3).
#   3. aria-hidden="true" combined with tabindex="0" on the same element —
#      focusable but invisible to assistive tech (WCAG 4.1.2).
#
# Files under any docs/, plans/, guides/ or mockups/ directory are skipped —
# they hold prototypes and documentation, not shipped templates.
#
# Usage:
#   ./check-a11y-templates.sh                # check files changed vs origin/next
#   ./check-a11y-templates.sh --base <ref>   # check files changed vs <ref>
#   ./check-a11y-templates.sh --all          # check ALL .html in packages/
#   ./check-a11y-templates.sh --file <path>  # check a single file

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ALLOWLIST="$REPO_ROOT/.github/scripts/ci/a11y-allowlist.txt"
BASE_REF="${BASE_REF:-origin/next}"
MODE="diff"
SINGLE_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --base) BASE_REF="$2"; shift 2 ;;
        --all) MODE="all"; shift ;;
        --file) MODE="single"; SINGLE_FILE="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

is_allowlisted() {
    local file="$1"
    [ -f "$ALLOWLIST" ] || return 1
    grep -v '^#' "$ALLOWLIST" | grep -v '^[[:space:]]*$' | while read -r pattern; do
        if [ "$file" = "$pattern" ]; then
            echo "MATCH"
            return
        fi
    done | grep -q MATCH
}

find_offending_markup() {
    local file="$1"
    # Perl scans the whole file so element tags that span lines are still one match.
    # HTML comments are stripped first (line count preserved for accurate numbers).
    perl -0777 -ne '
        s{<!--.*?-->}{ "\n" x ($& =~ tr/\n//) }gse;

        my $doc = $_;

        my $report = sub {
            my ($pos, $rule, $snippet) = @_;
            my $line = 1 + substr($doc, 0, $pos) =~ tr/\n//;
            $snippet =~ s/\s+/ /g;
            $snippet = substr($snippet, 0, 120);
            printf "%d:[%s] %s\n", $line, $rule, $snippet;
        };

        # Rule 1: <img> without alt / alt binding
        while ($doc =~ /(<img\b[^>]*>)/gs) {
            my ($tag, $pos) = ($1, $-[1]);
            next if $tag =~ /\balt\s*=/ || $tag =~ /\[alt\]/ || $tag =~ /\[attr\.alt\]/;
            $report->($pos, "img-alt", $tag);
        }

        # Rule 2: positive literal tabindex
        while ($doc =~ /(<[a-zA-Z][^>]*\btabindex\s*=\s*"([1-9][0-9]*)"[^>]*>)/gs) {
            $report->($-[1], "positive-tabindex", $1);
        }

        # Rule 3: aria-hidden="true" on a tabindex="0" element
        while ($doc =~ /(<[a-zA-Z][^>]*>)/gs) {
            my ($tag, $pos) = ($1, $-[1]);
            next unless $tag =~ /aria-hidden\s*=\s*"true"/ && $tag =~ /\btabindex\s*=\s*"0"/;
            $report->($pos, "hidden-but-focusable", $tag);
        }
    ' "$file" 2>/dev/null || true
}

get_files_to_check() {
    case "$MODE" in
        single)
            echo "$SINGLE_FILE"
            ;;
        all)
            find "$REPO_ROOT/packages" \
                -name '*.html' \
                -not -path '*/node_modules/*' \
                -not -path '*/dist/*' \
                -not -path '*/docs/*' \
                -not -path '*/plans/*' \
                -not -path '*/guides/*' \
                -not -path '*/mockups/*' \
                | sed "s|^$REPO_ROOT/||"
            ;;
        diff)
            cd "$REPO_ROOT"
            git diff --name-only --diff-filter=AM "$BASE_REF"...HEAD \
                | grep -E '^packages/.*\.html$' \
                | grep -v node_modules \
                | grep -v '/dist/' \
                | grep -vE '(^|/)(docs|plans|guides|mockups)/' \
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
    offending=$(find_offending_markup "$REPO_ROOT/$file")
    if [ -n "$offending" ]; then
        echo "::error file=$file::Template accessibility violations detected."
        echo ""
        echo "❌ $file"
        echo "$offending" | sed 's/^/    /'
        echo ""
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
done < <(get_files_to_check)

echo ""
echo "─────────────────────────────────────────"
echo "Template accessibility enforcement: $CHECKED checked, $ALLOWLISTED allowlisted, $VIOLATIONS violations"
echo "─────────────────────────────────────────"

if [ "$VIOLATIONS" -gt 0 ]; then
    cat <<EOF

Template accessibility violations are not allowed in shipped templates.

How to fix each rule:
  • img-alt:              add alt="..." (or alt="" for purely decorative images,
                          or an [alt]/[attr.alt] binding)
  • positive-tabindex:    use tabindex="0" and let DOM order drive focus order
  • hidden-but-focusable: remove tabindex="0" from aria-hidden elements, or
                          drop aria-hidden if the element is interactive

Deeper guidance: plans/accessibility-by-default/README.md

If a violation is genuinely intentional, add the file to:
  .github/scripts/ci/a11y-allowlist.txt
with a comment documenting why.
EOF
    exit 1
fi

exit 0
