#!/bin/bash
#
# check-migration-id-determinism.sh
#
# Deterministic replacement for the former Opus-powered "Claude Code Review"
# migration check (removed .github/workflows/claude.yml). Migrations must be
# immutable + deterministic: a record whose ID is minted at apply-time gets a
# DIFFERENT key on every database, breaking cross-DB metadata references.
#
# This flags, on the lines a PR ADDS to changed Flyway migration files, the two
# mechanically-checkable ways a migration mints a non-deterministic ID:
#
#   CASE 1  A literal NEWID() used to generate an ID
#           e.g. INSERT INTO t (ID, ...) VALUES (NEWID(), ...)
#           (line-based; allow-lists the known-legit NEWID() uses)
#
#   CASE 3  An `EXEC spCreate<Entity>` invocation whose arg list OMITS @ID
#           e.g. EXEC spCreateAction @Name = '...'      (no @ID)
#           -> the CodeGen proc's ISNULL(@ID, NEWID()) fallback mints a fresh ID.
#           (structural / multi-line; a proper SQL-aware scan, not a grep)
#
# The regexes are load-bearing, so the detection core lives HERE (not inline in a
# workflow step) with a --self-test mode of embedded fixtures. Future edits to the
# pipeline can be re-validated with:
#
#     .github/scripts/check-migration-id-determinism.sh --self-test
#
# The CI workflow runs --self-test on every PR (even PRs with no migrations), so a
# regression in the detector surfaces immediately rather than the next time someone
# happens to add a migration.
#
# Both detectors were retro-validated against all committed migrations (617 files):
#   - CASE 1: 9 files flagged, every one a genuine raw-INSERT NEWID(), 0 FP / 0 FN.
#   - CASE 3: 86 flagged of ~38,000 spCreate invocations (0.2%) — the good CodeGen /
#     metadata-sync pattern always passes `@ID = @ID_<hash>` (a variable pre-DECLAREd
#     to a UUID literal), so it never trips; the hits are hand-authored metadata
#     (Actions, TemplateParams) that genuinely omit @ID. High signal, low noise.
#
# ── OUT OF SCOPE (deliberately NOT detected — a judgment call, not a grep) ───────
# A raw INSERT that OMITS the ID column also mints a fresh key via the table default
# NEWSEQUENTIALID():
#     INSERT INTO t (Name) VALUES ('x')          -- no ID column
# This is detectable syntactically, but omitting ID is NOT a violation in general:
# CodeGen / metadata-sync deliberately omit ID on bulk-metadata inserts
# (EntityPermission, EntityFieldValue, GeneratedCode, EntityField, ApplicationEntity,
# EntityRelationship, …) and rely on the default. A retro-scan found 6,186 such
# inserts across the 617 committed migrations — virtually all legitimate. Flagging
# them requires deciding *which tables' rows need cross-DB-stable IDs* (i.e. are
# FK-referenced by other hard-coded metadata) — a semantic judgment the old LLM
# review was implicitly making, not something a line/structure scan can settle
# without a maintained table allow-list. So it stays out of scope by design; if the
# spCreate path (CASE 3) doesn't cover a table, that record should be inserted via
# its spCreate with an explicit @ID, or with a hard-coded ID column.
# ────────────────────────────────────────────────────────────────────────────────
#
# Usage:
#   check-migration-id-determinism.sh <base-sha> <head-sha>   # scan a PR diff
#   check-migration-id-determinism.sh --self-test             # validate the detector
#
# Advisory by design: a hit NEVER fails the job (exit 0). The workflow surfaces hits
# as a sticky PR comment (+ ::warning + step summary) so they're visible on a green
# check, instead of blocking the merge.
#
# ── KNOWN LIMITATIONS (accepted; advisory check, and all are edit-time-only) ─────
# The scan runs over the blob of lines a PR ADDS. For a NEW migration file the blob
# is the whole file (well-formed, balanced strings), so these don't arise — they only
# bite when EDITING an already-committed migration, which policy forbids (migrations
# are immutable). We accept them rather than harm the common case:
#   - A PR hunk that begins INSIDE a multi-line string literal hands CASE 3 an
#     unterminated string; the mask then blanks the rest of the blob and a real
#     violation there is missed. We do NOT newline-resync the masker to "fix" this —
#     that would re-break the legitimate multi-line string literals (prompt/template
#     bodies) that are the whole reason for a stateful masker.
#   - CASE 1 is line-based, so a NEWID() mentioned in prose on an interior line of a
#     multi-line string literal (no quote on that physical line) can be flagged. Rare;
#     retro-validation over the committed migrations found 0 such occurrences.

set -euo pipefail

# ── CASE 1 detector — literal NEWID() (line-based) ───────────────────────────────
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
    next if $l =~ /ISNULL\s*\(\s*\@ID\s*,\s*NEWID/i;      # spCreate ISNULL(@ID, NEWID()) fallback (ONLY @ID — a
                                                         # hand-authored ISNULL(@OtherID, NEWID()) is a real violation)
    next if $l =~ /DEFAULT\s*\(?\s*NEWID/i;               # column DEFAULT (NEWID())
    print $orig;
  '
}

# ── CASE 3 detector — spCreate<Entity> without @ID (structural / multi-line) ──────
# Reads a SQL blob on stdin, prints the offending EXEC line(s) on stdout.
#
# spCreate invocations routinely span many physical lines (@ID on line 1, @Name on
# line 2, …), so a line grep can't see the whole arg list. We instead build a
# length- and newline-preserving MASK where string literals, `--` comments and
# `/* */` comments are blanked to spaces (a char-walk state machine — the only robust
# way, since `/` `'` `;` and comment markers all legally appear inside string
# literals). Char offsets in the mask map 1:1 to the original text, so we detect
# statement structure on the mask (immune to keywords hiding in strings/comments) and
# report the ORIGINAL line by offset.
#
# For each `EXEC[UTE] [schema.]spCreate<Entity>` we read a bounded window of the
# following text, truncate it at the next statement boundary, and require @ID in it.
# Window extraction (vs a non-greedy capture) is what keeps this linear on multi-MB
# baseline files instead of catastrophically backtracking. `GRANT EXECUTE ON …
# spCreateX` and `EXEC sp_addextendedproperty …` do not match (the proc token isn't
# `spCreate…` at the invocation position).
filter_spcreate_no_id() {
  perl -e '
    my $sql = do { local $/; <STDIN> };
    $sql = q{} unless defined $sql;

    my @ch = split //, $sql, -1;
    my $mask = q{};
    my $state = q{code};
    my $bdepth = 0;   # nested /* */ depth (T-SQL nests block comments)
    for (my $i = 0; $i < @ch; $i++) {
      my $c = $ch[$i];
      my $n = ($i + 1 < @ch) ? $ch[$i + 1] : q{};
      if ($state eq q{code}) {
        if    ($c eq qq{\x27})            { $state = q{str};   $mask .= qq{\x27}; }
        elsif ($c eq q{-} && $n eq q{-})  { $state = q{line};  $mask .= q{  }; $i++; }
        elsif ($c eq q{/} && $n eq q{*})  { $state = q{block}; $bdepth = 1; $mask .= q{  }; $i++; }
        else                              { $mask .= $c; }
      } elsif ($state eq q{str}) {
        if    ($c eq qq{\x27} && $n eq qq{\x27}) { $mask .= q{  }; $i++; }
        elsif ($c eq qq{\x27})                   { $state = q{code}; $mask .= qq{\x27}; }
        else  { $mask .= ($c eq qq{\n} ? qq{\n} : q{ }); }
      } elsif ($state eq q{line}) {
        if ($c eq qq{\n}) { $state = q{code}; $mask .= qq{\n}; } else { $mask .= q{ }; }
      } elsif ($state eq q{block}) {
        if    ($c eq q{/} && $n eq q{*}) { $bdepth++; $mask .= q{  }; $i++; }
        elsif ($c eq q{*} && $n eq q{/}) { $bdepth--; $mask .= q{  }; $i++; $state = q{code} if $bdepth == 0; }
        else { $mask .= ($c eq qq{\n} ? qq{\n} : q{ }); }
      }
    }
    # Collapse runs of spaces (masked string/comment bodies are now spaces). Newlines
    # are untouched, so offset->line mapping still holds — and a multi-KB masked arg
    # before @ID no longer pushes @ID past the inspection window (FP on large args).
    $mask =~ s/ +/ /g;

    my @lines = split /\n/, $sql, -1;
    # Invocation head: EXEC[UTE], optional `@rc =` return capture, zero-or-more
    # `qualifier.` segments (db.schema.proc / [schema]. / ${flyway}.), then spCreate<Entity>.
    # `(?=[\s\[@])` after EXEC tolerates `EXEC[dbo].` (no space) without matching `EXECfoo`.
    while ($mask =~ /\bEXEC(?:UTE)?(?=[\s\[\@])\s*(?:\@\w+\s*=\s*)?(?:(?:\[[^\]]*\]|\$\{[^}]*\}|\w+)\s*\.\s*)*\[?\s*spCreate(\w+)/gis) {
      my $off = $-[0];
      my $args = substr($mask, $+[0], 8000);
      # Truncate at the next statement boundary so an @ID on an UNRELATED later statement
      # cannot suppress a genuinely @ID-less call. Keyword list = T-SQL statement starters.
      $args =~ s/(?:;|\bGO\b|\bEXEC(?:UTE)?\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDECLARE\b|\bSELECT\b|\bMERGE\b|\bWITH\b|\bIF\b|\bWHILE\b|\bBEGIN\b|\bEND\b|\bOPEN\b|\bFETCH\b|\bCLOSE\b|\bDEALLOCATE\b|\bGRANT\b|\bREVOKE\b|\bALTER\b|\bCREATE\b|\bDROP\b|\bTRUNCATE\b|\bCOMMIT\b|\bROLLBACK\b|\bWAITFOR\b|\bRAISERROR\b|\bTHROW\b|\bRETURN\b|\bUSE\b|\bPRINT\b|\bSET\b).*//is;
      next if $args =~ /\@ID\b/i;
      my $ln = (substr($mask, 0, $off) =~ tr/\n//);
      print $lines[$ln] // q{}, qq{\n};
    }
  '
}

# Run both detectors over a blob of candidate (added) SQL lines; print all hits.
detect_all() {
  local blob="$1"
  printf '%s\n' "$blob" | filter_hits
  printf '%s\n' "$blob" | filter_spcreate_no_id
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

    hits=$(detect_all "$added")
    hits=$(printf '%s\n' "$hits" | grep -v '^$' || true)
    [ -n "$hits" ] || continue

    found=1
    echo "::warning file=$file::Added line(s) mint a non-deterministic ID (NEWID(), or an spCreate call missing @ID) — migrations must use hard-coded UUIDs so replays are immutable and deterministic. Offending lines:"
    printf '%s\n' "$hits" | sed 's/^/    /'

    local block
    block=$(printf '### ⚠️ Non-deterministic ID in `%s`\n```sql\n%s\n```\n' "$file" "$hits")
    [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$block" >> "$GITHUB_STEP_SUMMARY"
    [ -n "$comment_file" ] && printf '%s\n' "$block" >> "$comment_file"
  done <<< "$files"

  if [ "$found" -eq 0 ]; then
    echo "No non-deterministic ID generation found in added migration lines."
  fi

  # Wrap the sticky-comment body with an explanation so the PR comment is self-contained.
  if [ -n "$comment_file" ] && [ "$found" -eq 1 ]; then
    local body; body=$(cat "$comment_file")
    {
      echo "## 🔒 Migration ID determinism"
      echo
      echo "One or more **added** migration lines mint a **non-deterministic ID**. Migrations must use **hard-coded UUIDs** so every replay produces the same keys. Fix each hit by:"
      echo
      echo "- **\`NEWID()\` generating an ID** → replace it with a fixed UUID literal (an allowed pattern is a column \`DEFAULT (NEWID())\`, or the CodeGen \`ISNULL(@ID, NEWID())\` spCreate fallback)."
      echo "- **\`EXEC spCreate…\` missing \`@ID\`** → pass an explicit \`@ID = '<fixed-uuid>'\` (or \`@ID = @ID_<var>\` pre-\`DECLARE\`d to a UUID literal, the metadata-sync convention). Without it the proc's \`ISNULL(@ID, NEWID())\` fallback mints a fresh ID on every database."
      echo
      echo "$body"
      echo "<sub>Deterministic replacement for the former Opus migration review. A raw INSERT that omits the ID column is intentionally out of scope (CodeGen omits ID on bulk-metadata tables by design); see the workflow step comments.</sub>"
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
  # CASE 3 assertions run the structural detector (which slurps a whole blob).
  assert_sp_hit() {
    if [ -z "$(printf '%s\n' "$1" | filter_spcreate_no_id)" ]; then
      echo "FAIL (expected HIT)  : $2"; fail=1
    else
      echo "ok   (hit)           : $2"
    fi
  }
  assert_sp_clean() {
    if [ -n "$(printf '%s\n' "$1" | filter_spcreate_no_id)" ]; then
      echo "FAIL (expected CLEAN): $2"; fail=1
    else
      echo "ok   (clean)         : $2"
    fi
  }

  # ── CASE 1: literal NEWID() — should FLAG ──
  assert_hit  "INSERT INTO Foo (ID, Name) VALUES (NEWID(), 'x');"      "raw INSERT minting ID with NEWID()"
  assert_hit  "EXEC spCreateFoo @ID = NEWID(), @Name = 'y';"          "spCreate passing NEWID() for @ID"
  assert_hit  "SET @SomeID = NEWID();"                                "variable assigned NEWID()"
  assert_hit  "INSERT INTO Foo (ID) VALUES (newid())"                 "case-insensitive newid()"
  assert_hit  "VALUES (N'my--slug', NEWID())"                         "-- inside a string must not mask NEWID()"

  # hand-authored ISNULL(@OtherID, NEWID()) is NOT the spCreate fallback — it mints a
  # per-DB ID, so it must FLAG (the allowlist is narrowed to @ID only).
  assert_hit  "SET @CategoryID = ISNULL(@CategoryID, NEWID());"       "hand-authored ISNULL(@OtherID, NEWID())"

  # ── CASE 1: legit patterns / non-violations — should stay CLEAN ──
  assert_clean "ID UNIQUEIDENTIFIER NOT NULL DEFAULT (NEWID()),"      "column DEFAULT (NEWID())"
  assert_clean "  SET @ID = ISNULL(@ID, NEWID());"                    "spCreate ISNULL(@ID, NEWID()) fallback"
  assert_clean "ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID()," "NEWSEQUENTIALID() default"
  assert_clean "  -- this once used NEWID() but is now hard-coded"    "-- comment mentioning NEWID()"
  assert_clean " * uses NEWID() internally (prose in a /* */ block)"  "/* */ block prose line"
  assert_clean "UPDATE EntityField SET DefaultValue = N'(newid())';"  "quoted metadata value newid()"
  assert_clean "REPLACE(ContentType, '/*', '/%')"                     "/* inside a string literal, no NEWID"

  # ── CASE 3: spCreate without @ID — should FLAG ──
  assert_sp_hit "EXEC [\${flyway:defaultSchema}].spCreateAction @Name = 'x', @Type = 'Custom'"  "spCreate invocation with no @ID"
  assert_sp_hit "EXEC spCreateTemplateParam @TemplateID = '8E5F', @Name = 'p'"                 "unqualified spCreate with no @ID"
  assert_sp_hit "$(printf 'EXEC [${flyway:defaultSchema}].spCreateAction @CategoryID = %s,\n@Name = %s,\n@Type = %s' "'3D'" "'HubSpot'" "'Custom'")" "multi-line spCreate with no @ID"
  assert_sp_hit "EXEC MyDB.dbo.spCreateFoo @Name = 'x'"                       "three-part-name spCreate with no @ID"
  assert_sp_hit "EXEC @rc = spCreateFoo @Name = 'x'"                          "spCreate with return-code capture, no @ID"
  assert_sp_hit "EXEC[dbo].[spCreateFoo] @Name = 'x'"                         "spCreate with no space after EXEC, no @ID"
  assert_sp_hit "$(printf "EXEC spCreateFoo @Name = 'x'\nOPEN cur\nFETCH NEXT FROM cur INTO @ID\n")" "unrelated later @ID (OPEN/FETCH) must not suppress"

  # ── CASE 3: legit patterns / non-invocations — should stay CLEAN ──
  assert_sp_clean "EXEC [\${flyway:defaultSchema}].spCreateQueryField @ID = @ID_109dc3b9, @Name = 'x'" "spCreate with @ID = variable (metadata-sync)"
  assert_sp_clean "EXEC spCreateFoo @ID = '11111111-1111-1111-1111-111111111111', @Name = 'x'"        "spCreate with @ID = literal"
  assert_sp_clean "$(printf 'EXEC [${flyway:defaultSchema}].spCreateAction @ID = @ID_1,\n@Name = %s,\n@Type = %s' "'x'" "'Custom'")" "multi-line spCreate WITH @ID on line 1"
  assert_sp_clean "EXEC spCreateFoo @EntityID = @e, @ID = @i, @Name = 'x'"                             "@EntityID present but real @ID also present"
  assert_sp_clean "EXEC spCreateFoo @Description = N'$(printf 'x%.0s' $(seq 1 9000))', @ID = @i"       "large masked arg before @ID (window/space-collapse)"
  assert_sp_clean "/* outer /* inner */ EXEC spCreateFoo @Name = 'x' */"                               "nested block comment (T-SQL) wrapping spCreate"
  assert_sp_clean "GRANT EXECUTE ON [\${flyway:defaultSchema}].[spCreateAIAction] TO [cdp_Developer]"  "GRANT EXECUTE ON spCreate proc (not an invocation)"
  assert_sp_clean "EXEC sp_addextendedproperty N'MS_Description', N'... spCreate ...', 'SCHEMA'"       "sp_addextendedproperty mentioning spCreate"
  assert_sp_clean "-- EXEC spCreateFoo @Name = 'x'  (example in a comment)"                            "commented-out spCreate call"

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
