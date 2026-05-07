#!/bin/bash
# Database Setup Entrypoint — One-Shot Init Container
#
# Runs sequentially, then exits. Steps must run in order because each one
# assumes the previous one has succeeded:
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

DB_NAME="${DB_DATABASE:-MemberJunction_Test}"
echo "  ═══════════════════════════════════════════"
echo "  Database setup complete!"
echo "  Database: $DB_NAME"
echo "  Schema: __mj (MJ core) + AssociationDemo (demo data)"
echo "  ═══════════════════════════════════════════"
echo ""
