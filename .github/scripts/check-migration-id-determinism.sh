#!/bin/bash
#
# check-migration-id-determinism.sh
#
# Deterministic replacement for the former Opus-powered "Claude Code Review"
# migration check (removed .github/workflows/claude.yml). Migrations must be
# immutable + deterministic: an ADDED line that mints an ID with NEWID() produces
# a different key on every apply. This flags literal NEWID() on the added lines of
# changed Flyway migration files, allowing the known-legit patterns.
#
# The regex is load-bearing, so the detection core lives HERE (not inline in a
# workflow step) with a --self-test mode of embedded fixtures. Future edits to the
# pipeline can be re-validated with:
#
#     .github/scripts/check-migration-id-determinism.sh --self-test
#
# The CI workflow runs --self-test on every PR (even PRs with no migrations), so a
# regression in the detector surfaces immediately rather than the next time someone
# happens to add a migration.
#
# ── OUT OF SCOPE (documented, deliberately NOT detected) ────────────────────────
# Two violation classes carry NO literal NEWID() text and are not caught here:
#   1. INSERT that OMITS the ID column       -> the table default NEWSEQUENTIALID()
#      e.g. INSERT INTO t (Name) VALUES ('x')   mints a fresh ID on every install
#   2. EXEC spCreateX WITHOUT @ID            -> the proc's ISNULL(@ID, NEWID())
#      e.g. EXEC spCreateFoo @Name = 'x'        fallback fires
# The old Opus prompt asked to "confirm each statement has hard-coded UUID ID
# columns"; detecting these needs multi-line INSERT column-list / proc-arg parsing,
# which is genuinely harder and out of scope for this line-oriented grep. This
# replacement narrows to the mechanically-checkable literal-NEWID() case by design.
# ────────────────────────────────────────────────────────────────────────────────
#
# Usage:
#   check-migration-id-determinism.sh <base-sha> <head-sha>   # scan a PR diff
#   check-migration-id-determinism.sh --self-test             # validate the detector
#
# Advisory by design: a hit NEVER fails the job (exit 0). The workflow surfaces hits
# as a sticky PR comment (+ ::warning + step summary) so they're visible on a green
# check, instead of blocking the merge.

set -euo pipefail

# ── Core detector ───────────────────────────────────────────────────────────────
# Reads candidate SQL text on stdin, prints the offending (original) lines on stdout.
# One portable `perl` pass — no `grep -P` (BSD grep on macOS lacks it), so the same
# code runs identically in CI and in a local `--self-test`. For each line:
#
# 1. On a COPY, strip single-quoted string literals FIRST (T-SQL escapes a quote by
#    doubling it: ''; matched via \x27 so the program itself needs no shell-escaped
#    quotes). This does two things:
#      (a) NEWID() text inside quoted metadata values (e.g. N'(newid())') no longer
#          trips the guard — so no separate quoted-value allowlist is needed; and
#      (b) it closes the `--`-inside-a-string false negative: without this,
#          VALUES (N'my--slug', NEWID()) collapses to "VALUES (N'my" when -- comments
#          are stripped, hiding a real violation.
#    Stripping per line (not a slurp) keeps line boundaries intact so the ORIGINAL,
#    unmangled line is what gets displayed; the only case it misses is a single string
#    literal that spans physical lines AND hides a NEWID() — vanishingly rare in a
#    migration, and not among the documented violation classes.
# 2. Strip `--` line comments on the copy (now safe — no surviving string masks a --).
# 3. Require literal NEWID(). NEWSEQUENTIALID() never matches (no "NEWID" substring).
# 4. Drop /* */ prose (lines starting with *, /*, or a "- " bullet) and the two legit
#    code patterns: the CodeGen spCreate `ISNULL(@ID, NEWID())` fallback and column
#    defaults `DEFAULT (NEWID())`.
filter_hits() {
  perl -ne '
    my $orig = $_;
    my $l = $_;
    $l =~ s/\x27(?:\x27\x27|[^\x27])*\x27//g;             # strip single-quoted literals
    $l =~ s/--.*//;                                       # strip -- line comments
    next unless $l =~ /NEWID\s*\(\s*\)/i;                 # literal NEWID()
    next if $l =~ /^\s*\*/;                               # /* */ block prose continuation
    next if $l =~ /^\s*\/\*/;                             # /* ... comment open
    next if $l =~ /^\s*-\s/;                              # "- " bullet prose
    next if $l =~ /ISNULL\s*\(\s*\@\w+\s*,\s*NEWID/i;     # spCreate ISNULL(@ID, NEWID()) fallback
    next if $l =~ /DEFAULT\s*\(?\s*NEWID/i;               # column DEFAULT (NEWID())
    print $orig;
  '
}

# ── PR-diff scan ────────────────────────────────────────────────────────────────
run_check() {
  local base="$1" head="$2"
  local found=0
  local comment_file="${COMMENT_BODY_FILE:-}"

  # Flyway migrations only: V<12-digit timestamp>__*.sql. Exclude tests/ fixture SQL
  # (e.g. migrations/v5/tests/**/*.sql) — those aren't Flyway migrations and their
  # NEWID() calls on throwaway assertion rows are legitimate.
  local files
  files=$(git diff --name-only "$base" "$head" \
    | grep -E '(^|/)V[0-9]{12}__.*\.sql$' \
    | grep -vE '(^|/)tests?/' || true)

  [ -n "$comment_file" ] && : > "$comment_file"

  local file added hits
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    # Only the lines this PR ADDS (leading '+', excluding the '+++' file header).
    # `|| true` guards the pipeline in case a matched file has no added lines (e.g.
    # a pure deletion) so grep's exit-1 can't fail the job under a pipefail shell.
    added=$(git diff "$base" "$head" -- "$file" \
      | grep -E '^\+' | grep -vE '^\+\+\+' | sed -E 's/^\+//' || true)
    [ -n "$added" ] || continue

    hits=$(printf '%s\n' "$added" | filter_hits)
    [ -n "$hits" ] || continue

    found=1
    echo "::warning file=$file::Added line(s) use NEWID() to generate an ID — migrations must use hard-coded UUIDs so replays are immutable and deterministic. Offending lines:"
    printf '%s\n' "$hits" | sed 's/^/    /'

    local block
    block=$(printf '### ⚠️ Non-deterministic ID in `%s`\n```sql\n%s\n```\n' "$file" "$hits")
    [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$block" >> "$GITHUB_STEP_SUMMARY"
    [ -n "$comment_file" ] && printf '%s\n' "$block" >> "$comment_file"
  done <<< "$files"

  if [ "$found" -eq 0 ]; then
    echo "No non-deterministic NEWID() ID generation found in added migration lines."
  fi

  # Wrap the sticky-comment body with an explanation so the PR comment is self-contained.
  if [ -n "$comment_file" ] && [ "$found" -eq 1 ]; then
    local body; body=$(cat "$comment_file")
    {
      echo "## 🔒 Migration ID determinism"
      echo
      echo "One or more **added** migration lines call \`NEWID()\` to generate an ID. Migrations must use **hard-coded UUIDs** so every replay produces the same keys. Replace \`NEWID()\` with a fixed UUID literal, or use an allowed pattern (a column \`DEFAULT (NEWID())\`, or the CodeGen \`ISNULL(@ID, NEWID())\` spCreate fallback)."
      echo
      echo "$body"
      echo "<sub>Deterministic replacement for the former Opus migration review. Detects literal \`NEWID()\` only — implicit cases (an INSERT that omits the ID column, or \`EXEC spCreate\` without \`@ID\`) are out of scope; see the workflow step comments.</sub>"
    } > "$comment_file"
  fi

  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    [ "$found" -eq 1 ] && echo "found=true" >> "$GITHUB_OUTPUT" || echo "found=false" >> "$GITHUB_OUTPUT"
  fi

  # Advisory: a hit is surfaced via comment/annotation, never a job failure.
  return 0
}

# ── Self-test ───────────────────────────────────────────────────────────────────
self_test() {
  local fail=0
  assert_hit() {
    if [ -z "$(printf '%s\n' "$1" | filter_hits)" ]; then
      echo "FAIL (expected HIT)  : $2"; fail=1
    else
      echo "ok   (hit)           : $2"
    fi
  }
  assert_clean() {
    if [ -n "$(printf '%s\n' "$1" | filter_hits)" ]; then
      echo "FAIL (expected CLEAN): $2"; fail=1
    else
      echo "ok   (clean)         : $2"
    fi
  }

  # ── should FLAG (real violations) ──
  assert_hit  "INSERT INTO Foo (ID, Name) VALUES (NEWID(), 'x');"      "raw INSERT minting ID with NEWID()"
  assert_hit  "EXEC spCreateFoo @ID = NEWID(), @Name = 'y';"          "spCreate passing NEWID() for @ID"
  assert_hit  "SET @SomeID = NEWID();"                                "variable assigned NEWID()"
  assert_hit  "INSERT INTO Foo (ID) VALUES (newid())"                 "case-insensitive newid()"
  assert_hit  "VALUES (N'my--slug', NEWID())"                         "-- inside a string must not mask NEWID()"

  # ── should stay CLEAN (legit patterns / non-violations) ──
  assert_clean "ID UNIQUEIDENTIFIER NOT NULL DEFAULT (NEWID()),"      "column DEFAULT (NEWID())"
  assert_clean "  SET @ID = ISNULL(@ID, NEWID());"                    "spCreate ISNULL(@ID, NEWID()) fallback"
  assert_clean "ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID()," "NEWSEQUENTIALID() default"
  assert_clean "  -- this once used NEWID() but is now hard-coded"    "-- comment mentioning NEWID()"
  assert_clean " * uses NEWID() internally (prose in a /* */ block)"  "/* */ block prose line"
  assert_clean "UPDATE EntityField SET DefaultValue = N'(newid())';"  "quoted metadata value newid()"
  assert_clean "REPLACE(ContentType, '/*', '/%')"                     "/* inside a string literal, no NEWID"

  if [ "$fail" -ne 0 ]; then
    echo "SELF-TEST FAILED"
    return 1
  fi
  echo "SELF-TEST PASSED"
  return 0
}

# ── Entry point ─────────────────────────────────────────────────────────────────
case "${1:-}" in
  --self-test)   self_test ;;
  -h|--help)     echo "usage: $0 --self-test | $0 <base-sha> <head-sha>" ;;
  "")            echo "usage: $0 --self-test | $0 <base-sha> <head-sha>" >&2; exit 2 ;;
  *)             run_check "$1" "${2:?head sha required}" ;;
esac
