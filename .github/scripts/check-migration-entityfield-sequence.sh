#!/bin/bash
#
# check-migration-entityfield-sequence.sh
#
# A migration must not INSERT an EntityField row with a LITERAL Sequence value.
# The detector, its rationale, and its self-test live in the sibling .mjs; this
# wrapper keeps the historical entrypoint (CI, docs, muscle memory) working.
#
#   check-migration-entityfield-sequence.sh                 # BASE_REF (default origin/next)...HEAD
#   check-migration-entityfield-sequence.sh <base> <head>   # explicit tree-ish pair (CI)
#   check-migration-entityfield-sequence.sh --all           # every committed migration
#   check-migration-entityfield-sequence.sh --self-test     # the detector's own fixtures
#
exec node "$(dirname "$0")/check-migration-entityfield-sequence.mjs" "$@"
