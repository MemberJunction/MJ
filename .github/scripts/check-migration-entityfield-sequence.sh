#!/bin/bash
#
# check-migration-entityfield-sequence.sh
#
# A migration must not INSERT an EntityField row with a LITERAL Sequence value.
#
# ── WHY ─────────────────────────────────────────────────────────────────────────
# When CodeGen discovers a new column it inserts the EntityField at a TEMPORARY
# sequence, `MAX(Sequence) + 100000 + ordinal`. That placeholder is rewritten to a
# proper low value moments later by spUpdateExistingEntityFieldsFromSchema — run
# live by CodeGen, and again by the repeatable script R__RefreshMetadata.sql.
#
# On the machine that generated it, this always looks fine. The trap is that the
# generated INSERT gets appended VERBATIM to a migration, and Flyway runs ALL
# versioned migrations before ANY repeatable script. On a database built only from
# migrations the renumber therefore never runs in between — so two migrations that
# add columns to the SAME entity within one release each carry a placeholder derived
# from the same low MAX, and the second collides on:
#
#     UQ_EntityField_EntityID_Sequence
#
# Worse, the failure lies about itself. The scripts do not SET XACT_ABORT ON, so the
# unique violation aborts only that STATEMENT; execution continues, and the run dies
# further down on a FOREIGN KEY error against EntityFieldValue whose rows point at
# the field that was never inserted. Reading the reported error leads nowhere.
#
# This cannot be caught by review — whether it collides depends on a migration
# somebody else wrote, and on the state of a database nobody is looking at. It also
# cannot be caught by any test that runs against a long-lived dev database, because
# there the renumber has already happened. It only ever appears on a fresh install:
# CI, a new developer, a release. See MJ#3670 for the instance that found it.
#
# ── THE FIX ─────────────────────────────────────────────────────────────────────
# Emit the sequence as an expression evaluated at APPLY time, which cannot collide
# on any database in any order:
#
#     (SELECT COALESCE(MAX([Sequence]), 0) + 1
#        FROM [${flyway:defaultSchema}].[EntityField]
#       WHERE [EntityID] = '<entity-id>')
#
# CodeGen now emits exactly this (manage-metadata.ts, getPendingEntityFieldINSERTSQL),
# so freshly generated blocks pass. This gate exists for hand-authored SQL and for
# blocks generated before that change.
#
# ── SCOPE ───────────────────────────────────────────────────────────────────────
# Only the lines a PR ADDS to changed migration files are scanned. 106 of the 138
# committed migrations carrying an EntityField INSERT use the old literal form; they
# all apply cleanly today and rewriting them would change Flyway checksums on every
# existing database for no benefit. They are left alone unless someone edits them.
#
# Self-test (run by CI on every PR, so a regression in the detector surfaces even on
# PRs that touch no migrations):
#
#     .github/scripts/check-migration-entityfield-sequence.sh --self-test
#
set -uo pipefail

RED=$'\033[0;31m'; YELLOW=$'\033[0;33m'; GREEN=$'\033[0;32m'; DIM=$'\033[2m'; NC=$'\033[0m'

# A literal placeholder sequence: a standalone VALUES element that is a 6-digit
# integer in the 100000+ band, i.e. the `MAX + 100000 + ordinal` signature. CodeGen
# never emits a low literal for a NEW field, so this band is the whole population and
# the pattern needs no positional parsing to be exact.
readonly LITERAL_SEQ_RE='^[[:space:]]*1[0-9]{5},[[:space:]]*$'
# Opening of an EntityField INSERT, in either quoting dialect.
readonly EF_INSERT_RE='INSERT[[:space:]]+INTO[[:space:]]+.*(\[EntityField\]|"EntityField")'

# Scan one file's content for an EntityField INSERT containing a literal sequence.
# Reads stdin. Echoes "<lineno>:<line>" per offending line. Returns 1 if any found.
scan_stream() {
    # NOTE: the INSERT test uses index() on a literal substring rather than a regex.
    # Passing a bracketed pattern through `awk -v` turns `\[EntityField\]` into the
    # CHARACTER CLASS [EntityField], which matches any line containing any of those
    # letters — i.e. nearly everything. The self-test's unrelated-table fixture exists
    # precisely because that mistake looks correct until something disproves it.
    awk -v seq_re="$LITERAL_SEQ_RE" '
        BEGIN { in_insert = 0; found = 0 }
        # An EntityField INSERT opens a window. It stays open across the column list
        # and the VALUES list (both of which contain bare ")" lines), and closes on a
        # statement terminator. Anything narrower would close before reaching VALUES.
        (toupper($0) ~ /INSERT[[:space:]]+INTO/) && (index($0, "EntityField") > 0) { in_insert = 1 }
        in_insert && $0 ~ /^[[:space:]]*(END|GO|;)[[:space:]]*$/ { in_insert = 0 }
        in_insert && $0 ~ seq_re { print NR ":" $0; found = 1 }
        END { exit (found ? 1 : 0) }
    '
}

self_test() {
    local fails=0

    # FIXTURE 1 — the bad form. Must be flagged.
    local bad
    bad=$(cat <<'SQL'
      IF NOT EXISTS (SELECT 1 FROM [__mj].[EntityField] WHERE ID = 'abc') BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name]
         )
         VALUES
         (
            'da98df59-65aa-469a-b44a-8059aa839366',
            '34248F34-2837-EF11-86D4-6045BDEE16E6',
            100025,
            'RunMode'
         )
      END;
SQL
)
    if echo "$bad" | scan_stream >/dev/null; then
        echo "${RED}self-test FAIL${NC}: literal sequence 100025 was NOT flagged"; fails=$((fails+1))
    else
        echo "${GREEN}self-test ok${NC}: literal placeholder sequence flagged"
    fi

    # FIXTURE 2 — the fixed form. Must NOT be flagged.
    local good
    good=$(cat <<'SQL'
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name]
         )
         VALUES
         (
            'da98df59-65aa-469a-b44a-8059aa839366',
            '34248F34-2837-EF11-86D4-6045BDEE16E6',
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [__mj].[EntityField] WHERE [EntityID] = '34248F34-2837-EF11-86D4-6045BDEE16E6'),
            'RunMode'
         )
SQL
)
    if echo "$good" | scan_stream >/dev/null; then
        echo "${GREEN}self-test ok${NC}: computed sequence accepted"
    else
        echo "${RED}self-test FAIL${NC}: computed sequence was wrongly flagged"; fails=$((fails+1))
    fi

    # FIXTURE 3 — a 6-digit literal OUTSIDE an EntityField insert. Must NOT be flagged.
    local unrelated
    unrelated=$(cat <<'SQL'
         INSERT INTO [${flyway:defaultSchema}].[SomeOtherTable]
         (
            [ID],
            [Threshold]
         )
         VALUES
         (
            'abc',
            100025,
         )
SQL
)
    if echo "$unrelated" | scan_stream >/dev/null; then
        echo "${GREEN}self-test ok${NC}: literal outside an EntityField insert ignored"
    else
        echo "${RED}self-test FAIL${NC}: false positive on an unrelated table"; fails=$((fails+1))
    fi

    if [ "$fails" -gt 0 ]; then
        echo; echo "${RED}$fails self-test failure(s)${NC}"; return 1
    fi
    echo; echo "${GREEN}all self-tests passed${NC}"; return 0
}

main() {
    case "${1:-}" in
        --self-test) self_test; exit $? ;;
    esac

    local base="${BASE_REF:-origin/next}"
    local files
    if [ "${1:-}" = "--all" ]; then
        files=$(find migrations -name '*.sql' -type f 2>/dev/null)
    else
        files=$(git diff --name-only --diff-filter=ACM "$base"...HEAD -- 'migrations/**/*.sql' 2>/dev/null)
    fi

    [ -z "$files" ] && { echo "${DIM}no changed migrations to check${NC}"; exit 0; }

    local violations=0
    while IFS= read -r f; do
        [ -f "$f" ] || continue
        local hits
        hits=$(scan_stream < "$f") || true
        [ -z "$hits" ] && continue
        echo "${RED}✗ $f${NC}"
        echo "$hits" | while IFS= read -r h; do echo "    ${YELLOW}line ${h%%:*}${NC}: $(echo "${h#*:}" | sed 's/^[[:space:]]*//')"; done
        violations=$((violations+1))
    done <<< "$files"

    if [ "$violations" -gt 0 ]; then
        cat <<EOF

${RED}EntityField INSERT with a literal Sequence${NC}

That number is a TEMPORARY placeholder (MAX + 100000 + ordinal) that only gets
renumbered when CodeGen or R__RefreshMetadata runs. Flyway runs every versioned
migration BEFORE any repeatable script, so on a database built only from migrations
the renumber never happens in between — and a second migration touching the same
entity collides on UQ_EntityField_EntityID_Sequence.

The collision does not report itself honestly: without SET XACT_ABORT ON the unique
violation aborts one statement, execution continues, and the run dies later on an
unrelated-looking FK error against EntityFieldValue.

Replace the literal with an apply-time expression. CodeGen emits the first form (the
offset is the field's schema ordinal, so a batch keeps its order); the second is
fine for a hand-written correction of a single field:

    (SELECT COALESCE(MAX([Sequence]), 0)
       FROM [\${flyway:defaultSchema}].[EntityField]
      WHERE [EntityID] = '<entity-id>') + <schema-ordinal>

    (SELECT COALESCE(MAX([Sequence]), 0) + 1
       FROM [\${flyway:defaultSchema}].[EntityField]
      WHERE [EntityID] = '<entity-id>')

Background: migrations/CLAUDE.md, and MJ#3670.
EOF
        exit 1
    fi

    echo "${GREEN}✓ no literal EntityField sequences in changed migrations${NC}"
}

main "$@"
