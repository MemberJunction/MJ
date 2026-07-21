#!/usr/bin/env bash
#
# CI gate: no Sass in ngc-only Angular packages
#
# WHY THIS EXISTS
# ---------------
# Most Angular packages under packages/Angular/** build with bare `ngc`
# (`"build": "ngc"`) — there is NO Sass compilation step anywhere in the
# pipeline. `ngc` embeds the content of a component's `styleUrls` / `styleUrl`
# file RAW into the compiled JS. So a `.scss` file in such a package is never
# compiled; it ships verbatim to the browser.
#
# The subtle part: browsers now support NATIVE CSS nesting, so `&:hover` and
# `&.some-class` forms accidentally still work when embedded raw. But native
# nesting CANNOT do Sass string concatenation — so every `&__elem` / `&--mod`
# (BEM) rule is SILENTLY DROPPED by the CSS parser. The styles look right in
# the source file and simply do not exist in production. This gate exists
# because exactly that happened (MemberJunction/MJ#3105).
#
# WHAT IT CHECKS
# --------------
# For every Angular package whose build script runs `ngc` with no Sass step:
#
#   RULE 1 — Sass-only constructs (NEVER allowlisted, always a hard failure)
#     Any `.scss` reachable from a component's styleUrls/styleUrl must not
#     contain constructs that only a Sass compiler understands:
#       • BEM/selector concatenation: `&__elem`, `&--mod`, `&anything`
#       • `//` line comments (invalid CSS — swallows the following rule)
#       • Sass at-rules: @use @forward @import @mixin @include @extend
#                        @function @if @else @each @for @while
#       • Sass variables (`$foo`) and interpolation (`#{...}`)
#
#   RULE 2 — no `.scss` in styleUrls at all (allowlistable)
#     Even Sass-free `.scss` is a trap: the extension advertises a compiler
#     that isn't there, and the next person to touch the file will reach for
#     `&__`. New `.scss` styleUrls are rejected. Pre-existing, verified-safe
#     files may be listed in:
#       .github/scripts/ci/ngc-scss-allowlist.txt
#     Allowlisting only waives RULE 2 — RULE 1 still applies to those files.
#
#   RULE 3 — dangling styleUrl (hard failure)
#     A styleUrl pointing at a file that does not exist. Angular silently
#     falls back to a same-named `.css`, which hides the mistake.
#
# Usage:
#   ./check-ngc-scss.sh                 # scan every ngc-only Angular package
#   ./check-ngc-scss.sh --all           # (alias for the default)
#   ./check-ngc-scss.sh --file <path>   # check one .scss, or one component .ts

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ALLOWLIST="$REPO_ROOT/.github/scripts/ci/ngc-scss-allowlist.txt"
SEARCH_ROOT="$REPO_ROOT/packages/Angular"
MODE="all"
SINGLE_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --all) MODE="all"; shift ;;
        --file) MODE="single"; SINGLE_FILE="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,45p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

# ---------------------------------------------------------------------------
# Is a package "ngc-only"? Its build script invokes `ngc` and contains no Sass
# compilation step (`sass`, `node-sass`) and no Angular CLI / ng-packagr build
# (both of which DO compile Sass).
# ---------------------------------------------------------------------------
is_ngc_only_package() {
    local pkg_json="$1"
    node -e '
        const fs = require("fs");
        let j;
        try { j = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
        catch { process.exit(1); }
        const build = (j.scripts && j.scripts.build) || "";
        const usesNgc = /(^|[\s&|;])ngc(\s|$|&|\|)/.test(build);
        const compilesSass = /\bnode-sass\b|\bsass\s+[^&|]*\.scss|\bng\s+build\b|\bng-packagr\b/.test(build);
        process.exit(usesNgc && !compilesSass ? 0 : 1);
    ' "$pkg_json"
}

is_allowlisted() {
    local file="$1"
    [ -f "$ALLOWLIST" ] || return 1
    grep -v '^#' "$ALLOWLIST" | grep -v '^[[:space:]]*$' | grep -qxF "$file"
}

# ---------------------------------------------------------------------------
# Extract every styleUrls/styleUrl entry from a component .ts file.
# Emits: <lineNumber>:<relative style path>
# ---------------------------------------------------------------------------
extract_style_refs() {
    perl -0777 -ne '
        my @lines = split /\n/, $_, -1;
        for my $i (0..$#lines) {
            my $line = $lines[$i];
            next unless $line =~ /\bstyleUrls?\s*:/;
            # Pull every quoted path on the line (styleUrls arrays in this repo
            # are single-line; styleUrl is always a single string).
            while ($line =~ /["'\'']([^"'\'']*\.(?:s?css))["'\'']/g) {
                printf "%d:%s\n", $i + 1, $1;
            }
        }
    ' "$1" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# RULE 1 detector — Sass-only constructs in a stylesheet.
# Emits: <lineNumber>:<construct>:<source line>
# ---------------------------------------------------------------------------
find_sass_constructs() {
    perl -0777 -ne '
        # Strip /* ... */ block comments (preserving line count) so commented
        # -out Sass and prose mentioning "&__" are not flagged.
        s{/\*.*?\*/}{ "\n" x ($& =~ tr/\n//) }gse;
        my @lines = split /\n/, $_, -1;
        for my $i (0..$#lines) {
            my $l = $lines[$i];
            my $why = "";

            # `&` followed immediately by an identifier char = Sass selector
            # concatenation (&__elem, &--mod). Native CSS nesting cannot do this;
            # the browser drops the whole rule.
            if ($l =~ /&(?=[A-Za-z0-9_-])/)     { $why = "sass selector concatenation (&__ / &--)"; }

            # `//` line comment — not valid CSS. Guard against `http://`, `//cdn`.
            elsif ($l =~ m{(?<![:/(])//})       { $why = "// line comment (invalid CSS)"; }

            # Sass-only at-rules. @media/@keyframes/@supports/@font-face/@layer/
            # @container/@property are real CSS and are NOT flagged.
            elsif ($l =~ /\@(use|forward|import|mixin|include|extend|function|if|else|each|for|while)\b/) {
                                                  $why = "sass at-rule (\@$1)"; }

            # Sass variables and interpolation.
            elsif ($l =~ /(?<![\w-])\$[A-Za-z_][\w-]*/) { $why = "sass variable (\$var)"; }
            elsif ($l =~ /#\{/)                 { $why = "sass interpolation (#{...})"; }

            printf "%d:%s:%s\n", $i + 1, $why, $lines[$i] if $why;
        }
    ' "$1" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Discover the component .ts files to inspect.
# ---------------------------------------------------------------------------
list_component_ts() {
    if [ "$MODE" = "single" ]; then
        case "$SINGLE_FILE" in
            *.ts) echo "$REPO_ROOT/$SINGLE_FILE" ;;
            *)    : ;;   # a stylesheet was passed — handled separately below
        esac
        return
    fi

    while IFS= read -r pkg_json; do
        is_ngc_only_package "$pkg_json" || continue
        local pkg_src
        pkg_src="$(dirname "$pkg_json")/src"
        [ -d "$pkg_src" ] || continue
        find "$pkg_src" -name '*.ts' -not -path '*/node_modules/*' -not -path '*/dist/*'
    done < <(find "$SEARCH_ROOT" -name package.json -not -path '*/node_modules/*' -not -path '*/dist/*')
}

VIOLATIONS=0
CHECKED_TS=0
CHECKED_SCSS=0
ALLOWLISTED=0

report() {
    local file="$1" msg="$2" detail="$3"
    echo "::error file=$file::$msg"
    echo ""
    echo "❌ $file"
    echo "$msg" | sed 's/^/    /'
    [ -n "$detail" ] && echo "$detail" | sed 's/^/    /'
    echo ""
    VIOLATIONS=$((VIOLATIONS + 1))
}

# Check one stylesheet for RULE 1. $2 = the referencing component (for context).
check_stylesheet() {
    local abs="$1"
    local rel="${abs#"$REPO_ROOT"/}"
    rel="$(printf '%s' "$rel" | sed 's|/\./|/|g')"
    CHECKED_SCSS=$((CHECKED_SCSS + 1))
    local hits
    hits=$(find_sass_constructs "$abs")
    if [ -n "$hits" ]; then
        report "$rel" \
            "Sass-only constructs in a stylesheet embedded RAW by ngc — these rules are DEAD in production." \
            "$hits"
    fi
}

# --- single-file mode: a stylesheet was passed directly -> RULE 1 only -------
if [ "$MODE" = "single" ]; then
    case "$SINGLE_FILE" in
        *.scss|*.css)
            check_stylesheet "$REPO_ROOT/$SINGLE_FILE"
            ;;
    esac
fi

# --- component .ts scan: RULE 1 + RULE 2 + RULE 3 ---------------------------
while IFS= read -r ts_abs; do
    [ -z "$ts_abs" ] && continue
    [ -f "$ts_abs" ] || continue

    refs=$(extract_style_refs "$ts_abs")
    [ -z "$refs" ] && continue

    ts_rel="${ts_abs#"$REPO_ROOT"/}"
    ts_dir="$(dirname "$ts_abs")"
    CHECKED_TS=$((CHECKED_TS + 1))

    while IFS= read -r ref; do
        [ -z "$ref" ] && continue
        lineno="${ref%%:*}"
        style_rel="${ref#*:}"
        style_abs="$ts_dir/$style_rel"
        style_repo_rel="${style_abs#"$REPO_ROOT"/}"
        # normalise ./ segments
        style_repo_rel="$(printf '%s' "$style_repo_rel" | sed 's|/\./|/|g')"

        # RULE 3 — dangling reference
        if [ ! -f "$style_abs" ]; then
            report "$ts_rel" \
                "Line $lineno: styleUrl points at a file that does not exist: $style_rel" \
                "Angular silently falls back to a same-named .css, hiding the typo. Point at the real file."
            continue
        fi

        case "$style_rel" in
            *.scss)
                # RULE 1 (never waived)
                check_stylesheet "$style_abs"
                # RULE 2 (allowlistable)
                if is_allowlisted "$style_repo_rel"; then
                    ALLOWLISTED=$((ALLOWLISTED + 1))
                else
                    report "$ts_rel" \
                        "Line $lineno: .scss in styleUrls of an ngc-only package (no Sass step) — rename to .css." \
                        "-> $style_repo_rel"
                fi
                ;;
            *.css)
                # RULE 1 only — a .css styleUrl embedded raw by ngc is dead in production
                # for stray &__elem / &--modifier residue exactly like a .scss one. RULE 2
                # (the .scss -> .css rename) doesn't apply to a file that is already .css.
                check_stylesheet "$style_abs"
                ;;
        esac
    done <<< "$refs"
done < <(list_component_ts)

echo ""
echo "─────────────────────────────────────────"
echo "ngc/Sass trap: $CHECKED_TS components with styleUrls, $CHECKED_SCSS stylesheets checked, $ALLOWLISTED allowlisted, $VIOLATIONS violations"
echo "─────────────────────────────────────────"

if [ "$VIOLATIONS" -gt 0 ]; then
    cat <<'EOF'

These Angular packages build with bare `ngc` — there is NO Sass step.
`ngc` embeds styleUrls content RAW into the compiled JS, so a `.scss` file
ships to the browser uncompiled.

Browsers DO support native CSS nesting, so `&:hover` / `&.active` accidentally
work. But native nesting CANNOT do string concatenation, so every `&__elem` and
`&--modifier` rule is SILENTLY DROPPED — the styling simply does not exist in
production while looking perfectly correct in source.

Fix:
  1. Flatten the file to plain CSS — expand every `&__x` / `&--x` into its
     fully-qualified selector (`.block__x`, `.block--x`).
  2. Rename it to `.css` and update the component's styleUrls.
  3. Use design tokens for colors (see CLAUDE.md → "Design Token System").

If a `.scss` file is genuinely Sass-free and must keep its extension (e.g. it
is also shipped as a global asset), add it to:
  .github/scripts/ci/ngc-scss-allowlist.txt
Allowlisting waives the extension rule ONLY — Sass constructs remain a failure.
EOF
    exit 1
fi

exit 0
