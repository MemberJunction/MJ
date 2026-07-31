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

        # Two passes: pass 2 reconciles special-date EntityField metadata for any
        # entities newly registered by pass 1 (see standard-mode note below).
        echo "Step 3: Running CodeGen (pass 1/2 — regenerate views/procs/metadata to match current code)..."
        npx mj codegen
        echo "  ✓ CodeGen pass 1 complete"
        echo "Step 3b: Running CodeGen (pass 2/2 — reconcile special-date EntityField metadata)..."
        npx mj codegen
        echo "  ✓ CodeGen pass 2 complete"
        echo ""
    else
        echo "Step 2-3: Upgrade disabled (BACPAC_UPGRADE=false) — using imported DB as-is"
        echo ""
    fi

    # Computer Use controller/judge prompts must exist in the tested DB for the
    # test engine to run. Non-fatal: an as-is current-version bacpac may already
    # carry them.
    echo "Step 4: Syncing prompts metadata (Computer Use controller/judge templates)..."
    npx mj sync push --dir=metadata --include="prompts" --no-write-back 2>&1 || {
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
# DR-B1: the schema+demo state (Steps 1-3) is a deterministic function of
# (migrations, AssociationDB SQL, MJ build version). If a native SQL Server
# backup keyed by that content hash already exists in the snapshot volume, RESTORE
# it (seconds) instead of re-paying CREATE + AssociationDB + migrate + codegen×2
# (~4-6 min). A miss (or any restore problem) falls through to a full rebuild,
# which then re-snapshots. Metadata (apps/prompts/…) is pushed at RUNTIME below,
# so snapshots never stale on metadata edits (DR-B5).
if node "$SCRIPTS/db-snapshot.cjs" restore; then
    echo "  ✓ Schema restored from snapshot — skipped bootstrap/migrate/codegen"
    echo ""
else
    echo "  No usable snapshot — building schema from scratch..."
    echo ""

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
    # the matching EntityField metadata rows.
    #
    # TWO PASSES ARE REQUIRED for a freshly-bootstrapped schema (AssociationDemo).
    # The FIRST pass registers the new entities, adds the
    # __mj_CreatedAt/__mj_UpdatedAt/__mj_DeletedAt columns to the tables, and
    # generates the views + CRUD procs — but does NOT populate the special-date
    # EntityField metadata rows for those brand-new entities in the same pass.
    # The SECOND pass reconciles them (the __mj columns now physically exist, so the
    # special-date field sync picks them up).
    #
    # Without pass 2, every WRITE (create/edit/delete) against the demo entities
    # fails at runtime ("Field __mj_CreatedAt does not exist on <Entity>") even
    # though the tables/views/procs are correct and all READS succeed — because the
    # server builds its save path from EntityField metadata, which was missing the
    # system fields for all 58 AssociationDemo entities. Reads passed, writes failed.
    echo "Step 3: Running CodeGen (pass 1/2 — schema, entities, views, procs)..."
    npx mj codegen
    echo "  ✓ CodeGen pass 1 complete"
    echo "Step 3b: Running CodeGen (pass 2/2 — reconcile special-date EntityField metadata for new entities)..."
    npx mj codegen
    echo "  ✓ CodeGen pass 2 complete"
    echo ""

    # DR-B1: snapshot the schema-only state (pre-metadata) for the next lifecycle.
    echo "Step 3c: Saving schema snapshot for future runs..."
    node "$SCRIPTS/db-snapshot.cjs" backup
    echo ""
fi

# Derive ExtendedType for email/URL columns, immediately after CodeGen and BEFORE
# anything that reads it. CodeGen normally assigns ExtendedType through an
# LLM-assisted metadata pass, which cannot run in this stack (no AI credentials), so
# every email/URL column is left NULL.
#
# Ordering is the whole point of doing it here: `LinkType` is baked into the
# GENERATED form HTML at codegen time, not read at runtime, so seeding this after
# form generation has no effect on rendering. Anything that regenerates the Angular
# forms (`--profile gen-forms`) must run AFTER this to pick the values up.
echo "Step 3d: Seeding ExtendedType for email/URL fields..."
node "$SCRIPTS/seed-extended-field-types.cjs" 2>&1
echo ""

# Step 4: Sync application metadata (baseline migration only seeds 2 of ~20 apps)
echo "Step 4: Syncing application metadata..."
npx mj sync push --dir=metadata --include="applications" --no-write-back 2>&1 || {
    echo "  WARNING: Application metadata sync failed — apps may be limited"
}
echo "  ✓ Application metadata sync complete"
echo ""

# Step 5: Sync prompts metadata
# Migration-seeded prompt records become stale as soon as a .template.md file
# changes. Re-pushing here ensures the regression run uses the current
# templates (e.g., new Computer Use action types).
echo "Step 5: Syncing prompts metadata (refreshes Computer Use controller/judge templates)..."
npx mj sync push --dir=metadata --include="prompts" --no-write-back 2>&1 || {
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
