#!/usr/bin/env bash
#
# CI gate: hardcoded-color enforcement
#
# Fails if any changed .css or .scss file contains hardcoded color values
# (hex, rgb, rgba, hsl, hsla, or a named colour such as `white` on a colour
# property) outside the documented allowlist or outside
# `var(--token, <fallback>)` syntax.
#
# Exception: rgba(0, 0, 0, X) and rgba(255, 255, 255, X) are allowed —
# these are neutral black/white opacities used for shadows/overlays where
# no semantic token equivalent exists. For the same reason `black` and
# `white` are allowed as a color-mix() partner (a neutral shade or tint of a
# token). transparent, currentColor, inherit, initial, unset and revert are
# not colours of their own and are allowed.
#
# A single declaration can be exempted by putting a line comment directly
# above it: `// color-exception: <reason>`. Use it only for a value that
# cannot change yet (for example a published legacy class); the reason is
# required so the exception can be found and removed later.
#
# Files under any `docs/`, `plans/`, or `guides/` directory are skipped
# entirely — they hold mockups, prototypes, and documentation snippets,
# not shipped component styles.
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
            sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
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
    #   1. Strip /* ... */ block comments (including multi-line)
    #   2. Strip // line comments
    #   3. Strip var(--token, <color>) fallback patterns
    #   4. Detect hardcoded colors:
    #      - Hex literals: #fff, #264FAF, #ffffff80, etc.
    #      - rgb()/rgba() with non-neutral colors (R=G=B=0 and R=G=B=255 are
    #        allowed — black/white opacity for shadows/overlays have no
    #        semantic token equivalent)
    #      - hsl()/hsla() with any value
    perl -0777 -ne '
        BEGIN {
            # Properties whose value is (or contains) a colour.
            our $color_props = qr{(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|column-rule(?:-color)?|text-decoration(?:-color)?|text-emphasis(?:-color)?|stop-color|flood-color|lighting-color|scrollbar-color)}i;
            # The CSS named-colour list (CSS Color Module Level 4), minus
            # transparent and currentColor.
            our $named_colors = qr{(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)}i;
        }
        our ($color_props, $named_colors);
        # Strip block comments globally (across newlines)
        s{/\*.*?\*/}{ "\n" x ($& =~ tr/\n//) }gse;
        my @lines = split /\n/, $_, -1;
        for my $i (0..$#lines) {
            my $line = $lines[$i];
            # Strip // line comments
            $line =~ s{//.*$}{};
            # Strip var(--token, ...) fallback patterns entirely (hex, rgb, hsl)
            $line =~ s/var\([^)]*\)//g;

            my $flagged = 0;

            # Hex literals
            if ($line =~ /#[0-9a-fA-F]{3,8}\b/) {
                $flagged = 1;
            }

            # rgb()/rgba() — allow only fully-neutral (000 or 255,255,255).
            # Capture R, G, B (alpha is ignored for the neutral check).
            if (!$flagged) {
                my $scan = $line;
                while ($scan =~ /\b(rgba?)\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)/g) {
                    my ($r, $g, $b) = ($2, $3, $4);
                    my $neutral_black = ($r == 0 && $g == 0 && $b == 0);
                    my $neutral_white = ($r == 255 && $g == 255 && $b == 255);
                    unless ($neutral_black || $neutral_white) {
                        $flagged = 1;
                        last;
                    }
                }
            }

            # hsl()/hsla() — always flag (no legitimate hardcoded-hsl use case yet)
            if (!$flagged && $line =~ /\bhsla?\(/) {
                $flagged = 1;
            }

            # Named colour keywords (white, black, red, ...) used as the value
            # of a colour-taking property. A keyword background stays light in
            # dark mode while the text token turns light, so these break dark
            # mode as surely as a hex literal. transparent, currentColor and
            # the CSS-wide keywords (inherit, initial, unset, revert) are not
            # colours of their own and stay allowed. Custom-property
            # declarations (--x: white) are not checked here.
            if (!$flagged) {
                my $scan = $line;
                # Quoted strings and url(...) can hold words like "red".
                $scan =~ s/"[^"]*"|\x27[^\x27]*\x27//g;
                $scan =~ s/\burl\([^)]*\)//gi;
                # black and white as a color-mix() partner are neutral
                # shades/tints of a token, the same allowance as the
                # rgba(0,0,0,X) / rgba(255,255,255,X) neutrals above.
                $scan =~ s{\bcolor-mix\(([^()]*)\)}{
                    my $args = $1;
                    $args =~ s/(?<![\w-])(?:black|white)(?![\w-])//gi;
                    "color-mix($args)";
                }gie;
                while ($scan =~ /(?:^|[\s;{])$color_props\s*:\s*([^;{}]*)/gi) {
                    my $value = $1;
                    if ($value =~ /(?<![\w\$\@.#-])$named_colors(?![\w-])/i) {
                        $flagged = 1;
                        last;
                    }
                }
            }

            # A documented per-declaration exception on the line above.
            if ($flagged && $i > 0 && $lines[$i - 1] =~ m{//\s*color-exception:\s*\S}) {
                $flagged = 0;
            }

            printf "%d:%s\n", $i + 1, $lines[$i] if $flagged;
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
                -not -path '*/docs/*' \
                -not -path '*/plans/*' \
                -not -path '*/guides/*' \
                | sed "s|^$REPO_ROOT/||"
            ;;
        diff)
            cd "$REPO_ROOT"
            git diff --name-only --diff-filter=AM "$BASE_REF"...HEAD \
                | grep -E '\.(css|scss)$' \
                | grep -v node_modules \
                | grep -v '/dist/' \
                | grep -vE '(^|/)(docs|plans|guides)/' \
                || true
            ;;
    esac
}

VIOLATIONS=0
CHECKED=0
ALLOWLISTED=0

while IFS= read -r file; do
    [ -z "$file" ] && continue
    # --file accepts an absolute path as well as a repo-relative one.
    case "$file" in
        /*) path="$file" ;;
        *)  path="$REPO_ROOT/$file" ;;
    esac
    [ ! -f "$path" ] && continue

    if is_allowlisted "$file"; then
        ALLOWLISTED=$((ALLOWLISTED + 1))
        continue
    fi

    CHECKED=$((CHECKED + 1))
    offending=$(find_offending_hex "$path")
    if [ -n "$offending" ]; then
        echo "::error file=$file::Hardcoded color values detected. Use design tokens instead."
        echo ""
        echo "❌ $file"
        echo "$offending" | sed 's/^/    /'
        echo ""
        VIOLATIONS=$((VIOLATIONS + 1))
    fi
done < <(get_files_to_check)

echo ""
echo "─────────────────────────────────────────"
echo "Hardcoded color enforcement: $CHECKED checked, $ALLOWLISTED allowlisted, $VIOLATIONS violations"
echo "─────────────────────────────────────────"

if [ "$VIOLATIONS" -gt 0 ]; then
    cat <<EOF

Hardcoded color values are not allowed in component CSS/SCSS.
Detected forms: hex (#fff), rgb(...), rgba(...), hsl(...), hsla(...), and
named colours (white, black, red, ...) on colour properties.
Exception: rgba(0, 0, 0, X) and rgba(255, 255, 255, X) are allowed for
shadow/overlay neutrals (no semantic token equivalent), as are black and
white inside color-mix(). transparent and currentColor are allowed.

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
