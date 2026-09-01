#!/usr/bin/env bash
#
# CI gate: --mj-focus-ring must never be used as an outline color
#
# `--mj-focus-ring` is a complete two-part BOX-SHADOW value. Writing
# `outline: 2px solid var(--mj-focus-ring)` parses as valid-looking CSS and
# renders NOTHING: the outline shorthand's color slot rejects a multi-part
# shadow value, so the browser drops the whole declaration silently — no
# console warning, no visible focus indicator, and a WCAG 2.4.7 failure that
# survives review because the source reads correctly.
#
# The outline-safe companion is `--mj-focus-ring-color`.
#
#   WRONG:   outline: 2px solid var(--mj-focus-ring);
#   RIGHT:   outline: none; box-shadow: var(--mj-focus-ring);
#   RIGHT:   outline: var(--mj-ring-width) solid var(--mj-focus-ring-color);
#
# Block and line comments are stripped before matching, so documentation may
# quote the wrong form (the token file itself does).
#
# Usage:
#   ./check-focus-ring.sh                # check files changed vs origin/next
#   ./check-focus-ring.sh --base <ref>   # check files changed vs <ref>
#   ./check-focus-ring.sh --all          # check ALL .css/.scss/.ts in packages/Angular
#   ./check-focus-ring.sh --file <path>  # check a single file

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE_REF="${BASE_REF:-origin/next}"
MODE="diff"
SINGLE_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --base) BASE_REF="$2"; shift 2 ;;
        --all) MODE="all"; shift ;;
        --file) MODE="single"; SINGLE_FILE="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

# Emits "line<TAB>text" for each offending line, after stripping comments.
find_offending() {
    perl -0777 -ne '
        # Strip block comments, preserving line count so reported numbers are real.
        s{/\*.*?\*/}{ "\n" x ($& =~ tr/\n//) }gse;
        my @lines = split /\n/, $_, -1;
        for my $i (0..$#lines) {
            my $line = $lines[$i];
            $line =~ s{//.*$}{};
            # `outline` / `outline-color` whose value reaches var(--mj-focus-ring)
            # without crossing a declaration boundary. The trailing [,)] is what
            # excludes the legitimate --mj-focus-ring-color companion.
            if ($line =~ /outline[a-z-]*\s*:\s*[^;{}]*var\(\s*--mj-focus-ring\s*[,)]/) {
                printf("%d\t%s\n", $i + 1, $lines[$i] =~ s/^\s+//r);
            }
        }
    ' "$1"
}

case "$MODE" in
    all)
        FILES=$(find "$REPO_ROOT/packages/Angular" \
            \( -name node_modules -o -name dist -o -name .angular \) -prune -o \
            \( -name '*.css' -o -name '*.scss' -o -name '*.ts' \) -print)
        ;;
    single)
        FILES="$SINGLE_FILE"
        ;;
    *)
        FILES=$(git -C "$REPO_ROOT" diff --name-only --diff-filter=ACMR "$BASE_REF"...HEAD \
            | grep -E '\.(css|scss|ts)$' \
            | grep -v -E '(^|/)(node_modules|dist)/' \
            | sed "s|^|$REPO_ROOT/|" || true)
        ;;
esac

FAILED=0
for file in $FILES; do
    [ -f "$file" ] || continue
    hits=$(find_offending "$file" || true)
    [ -n "$hits" ] || continue
    FAILED=1
    rel="${file#"$REPO_ROOT"/}"
    while IFS=$'\t' read -r lineno text; do
        echo "  $rel:$lineno: $text"
    done <<< "$hits"
done

if [ "$FAILED" -eq 1 ]; then
    cat >&2 <<'MSG'

FAIL: --mj-focus-ring used as an outline value.

  It is a two-part box-shadow value; the outline shorthand drops the whole
  declaration silently, leaving NO visible focus indicator (WCAG 2.4.7).

  Fix with either:
    outline: none; box-shadow: var(--mj-focus-ring);
    outline: var(--mj-ring-width) solid var(--mj-focus-ring-color);
MSG
    exit 1
fi

echo "check:focus-ring — no --mj-focus-ring outline misuse found"
