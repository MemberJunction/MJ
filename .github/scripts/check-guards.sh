#!/usr/bin/env bash
# check:guards — the repo-wide source scanners, run locally the way CI runs them.
#
#   UUIDCompliance + MultiProviderCompliance
#     + FieldSecurityEgressCompliance
#     + PlatformStringCompliance              (packages/MJGlobal; the "Source guards" job)
#   PrimaryKeyCompliance                      (packages/MJCore; runs in CI only when a PR touches MJCore)
#   check:manifest-registrations              (an entity subclass missing from the committed manifests)
#   check-turbo-root-inputs                   (a test reads repo-root data its turbo.json does not declare)
#
# All of them read source text off disk: no build, no database. Each is run even if an earlier one
# fails, so one invocation reports every violation. Exits non-zero if any scanner fails.
#
# The MJGlobal scanners use the shared vitest config on purpose (MJGlobal's own config excludes
# them), and --passWithNoTests=false so a renamed test file fails loudly instead of passing with zero tests.
set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1

status=0

pnpm --filter @memberjunction/global exec vitest run \
  --config ../../vitest.shared.ts --passWithNoTests=false \
  src/__tests__/UUIDCompliance.test.ts \
  src/__tests__/MultiProviderCompliance.test.ts \
  src/__tests__/FieldSecurityEgressCompliance.test.ts \
  src/__tests__/PlatformStringCompliance.test.ts || status=1

# MJCore's own config: the shared one finds no project from inside MJCore, and MJCore's config
# does not exclude this scanner.
pnpm --filter @memberjunction/core exec vitest run --passWithNoTests=false \
  src/__tests__/PrimaryKeyCompliance.test.ts || status=1

# Entity manifest completeness. Here rather than only in CI because the pre-push hook runs this
# script: a `@RegisterClass(BaseEntity, …)` subclass missing from the committed manifests is caught
# before the PR exists. Pure file reads, like its neighbours above.
node .github/scripts/check-manifest-registrations.mjs || status=1

# Repo-root data a package's tests read must be in that package's turbo test inputs, or the
# cached pass replays after the data changes. Pure file reads.
node .github/scripts/check-turbo-root-inputs.mjs || status=1

if [ "$status" -ne 0 ]; then
  echo ""
  echo "check:guards failed. The rules behind each scanner:"
  echo "  UUID comparisons / nested scans -> .claude/rules/typescript-style.md (COMPARE UUIDs WITH THE @memberjunction/global HELPERS)"
  echo "  global Metadata provider        -> .claude/rules/data-access.md (Don't Reach for the Global Metadata Provider)"
  echo "  primary-key assumptions         -> .claude/rules/data-access.md (Primary keys: never assume a column named ID)"
  echo "  entity serialization at egress  -> guides/FIELD_LEVEL_SECURITY_GUIDE.md (Building on field-level security)"
  echo "  platform-name branch (SQL path) -> read the fact from the dialect's facets (@memberjunction/sql-dialect)"
  echo "  entity class not in a manifest  -> regenerate with the pnpm run mj:manifest:* script the failure names"
  echo "  root data not a turbo input     -> add \$TURBO_ROOT\$/<dir>/** to the package turbo.json (see the script header)"
fi

exit "$status"
