#!/bin/bash
# Database Setup Entrypoint — One-Shot Init Container
#
# Two modes:
#   • Bacpac mode (BACPAC_FILE set): import a real MJ database via SqlPackage,
#     optionally upgrade it (migrate + codegen) to the current build, push the
#     Computer Use prompts. The user supplies their own suite via the
#     test-runner's EXTRA_METADATA_DIRS. See scripts/import-bacpac.cjs.
#   • Standard mode (default): build the DB from scratch, as below.
#
# Standard mode runs sequentially, then exits. Steps must run in order because
# each one assumes the previous one has succeeded:
#
#   1. Bootstrap database — CREATE DATABASE + install AssociationDB demo data
#         AssociationDB must be installed BEFORE migrations because the
#         repeatable Flyway migration R__RefreshMetadata.sql regenerates
#         views/procs for ALL entities in __mj metadata. On a reused database,
#         that includes AssociationDB tables — if they don't exist yet, the
#         migration fails with "Invalid object name".
#   2. Run Flyway migrations (`mj migrate`)
#   3. Run CodeGen (`mj codegen`)
#   4. Push application metadata (the baseline migration only seeds 2 of ~20)
#   5. Push prompt metadata (refreshes Computer Use controller/judge templates
#      if their .template.md files have changed)
#
# Inline JavaScript steps live in scripts/*.cjs — see scripts/lib/db.cjs for
# the shared mssql connection helper.
#
# Exits 0 on success, non-zero on any failure.
set -e

SCRIPTS=/app/docker/regression/scripts

echo ""
echo "  MJ Database Setup"
echo "  ─────────────────────────────────────────"
echo ""

DB_NAME="${DB_DATABASE:-MemberJunction_Test}"

if [ -n "${BACPAC_FILE:-}" ]; then
    # ─── Bacpac mode ─────────────────────────────────────────────────────────
    # Import a real MJ database instead of building from scratch. The user
    # supplies their own test suite (EXTRA_METADATA_DIRS, pushed by the
    # test-runner), so we skip AssociationDB + the standard app/test seeding.
    echo "Step 1: Importing bacpac (BACPAC_FILE=$BACPAC_FILE)..."
    node "$SCRIPTS/import-bacpac.cjs"
    echo ""

    if [ "${BACPAC_UPGRADE:-true}" != "false" ]; then
        # Skyway baselineOnMigrate + the imported flyway_schema_history means
        # migrate applies only versions newer than the bacpac's state, bringing
        # the schema up to the current MJ build that Explorer/MJAPI expect.
        echo "Step 2: Upgrading imported DB — running MJ migrations..."
        npx mj migrate
        echo "  ✓ Migrations complete"
        echo ""

        echo "Step 3: Running CodeGen (regenerate views/procs/metadata to match current code)..."
        npx mj codegen
        echo "  ✓ CodeGen complete"
        echo ""
    else
        echo "Step 2-3: Upgrade disabled (BACPAC_UPGRADE=false) — using imported DB as-is"
        echo ""
    fi

    # Computer Use controller/judge prompts must exist in the tested DB for the
    # test engine to run. Non-fatal: an as-is current-version bacpac may already
    # carry them.
    echo "Step 4: Syncing prompts metadata (Computer Use controller/judge templates)..."
    npx mj sync push --dir=metadata --include="prompts" 2>&1 || {
        echo "  WARNING: Prompts metadata sync failed — Computer Use prompts may be stale/missing"
    }
    echo ""

    echo "  ═══════════════════════════════════════════"
    echo "  Database setup complete (bacpac mode)!"
    echo "  Database: $DB_NAME (imported from $BACPAC_FILE)"
    echo "  Upgrade:  ${BACPAC_UPGRADE:-true}"
    echo "  ═══════════════════════════════════════════"
    echo ""
    exit 0
fi

# ─── Standard mode (build from scratch) ──────────────────────────────────────
# Step 1: CREATE DATABASE + install AssociationDB demo schema + data
echo "Step 1: Bootstrapping database (CREATE + AssociationDB)..."
node "$SCRIPTS/bootstrap-db.cjs"
echo ""

# Step 2: MJ Flyway migrations
echo "Step 2: Running MJ migrations..."
npx mj migrate
echo "  ✓ Migrations complete"
echo ""

# Step 3: CodeGen — generates entity classes, views, stored procedures, and
# the matching EntityField metadata rows in a single pass.
# CodeGen handles the __mj_CreatedAt/__mj_UpdatedAt/__mj_DeletedAt EntityField
# rows itself via ensureSpecialDateEntityFieldsExist (see CodeGenLib's
# manage-metadata.ts) — no post-codegen patching is required.
echo "Step 3: Running CodeGen..."
npx mj codegen
echo "  ✓ CodeGen complete"
echo ""

# Step 4: Sync application metadata (baseline migration only seeds 2 of ~20 apps)
echo "Step 4: Syncing application metadata..."
npx mj sync push --dir=metadata --include="applications" 2>&1 || {
    echo "  WARNING: Application metadata sync failed — apps may be limited"
}
echo "  ✓ Application metadata sync complete"
echo ""

# Step 5: Sync prompts metadata
# Migration-seeded prompt records become stale as soon as a .template.md file
# changes. Re-pushing here ensures the regression run uses the current
# templates (e.g., new Computer Use action types).
echo "Step 5: Syncing prompts metadata (refreshes Computer Use controller/judge templates)..."
npx mj sync push --dir=metadata --include="prompts" 2>&1 || {
    echo "  WARNING: Prompts metadata sync failed — Computer Use prompts may be stale"
}
echo "  ✓ Prompts metadata sync complete"
echo ""

echo "  ═══════════════════════════════════════════"
echo "  Database setup complete!"
echo "  Database: $DB_NAME"
echo "  Schema: __mj (MJ core) + AssociationDemo (demo data)"
echo "  ═══════════════════════════════════════════"
echo ""
