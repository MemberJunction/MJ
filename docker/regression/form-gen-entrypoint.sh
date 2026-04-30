#!/bin/bash
# Form Generator Entrypoint — One-Shot CodeGen Container
#
# Runs the same DB bring-up as db-setup (create DB, install AssociationDB,
# run Flyway migrations) and then runs `mj codegen` to generate Angular
# entity-form components into a host bind-mount.
#
# The compose file mounts:
#   ./.docker-generated/MJExplorer-forms → /app/packages/MJExplorer/src/app/generated
#
# So codegen's `Angular` output (configured in mj.config.cjs to write to
# ./packages/MJExplorer/src/app/generated) ends up on the host where the
# explorer build's `COPY` can overlay it.
#
# This service runs OUTSIDE the regular regression run (compose profile:
# gen-forms). After it exits the stack is torn down with `down -v`, so the
# populated DB does not leak into the regression run.
set -e

SCRIPTS=/app/docker/regression/scripts

echo ""
echo "  MJ Form Generator (codegen for entity forms)"
echo "  ─────────────────────────────────────────"
echo ""

# Step 1: CREATE DATABASE + install AssociationDB schema.
# We only need the AssociationDB schema (so codegen sees the tables); skip the
# row-count verify and accept >50% batch errors because the form-generator
# container tears down before the data ever matters.
echo "Step 1: Bootstrapping database (CREATE + AssociationDB schema)..."
SKIP_VERIFY=true FORCE_FAIL_THRESHOLD=disabled node "$SCRIPTS/bootstrap-db.cjs"
echo ""

echo "Step 2: Running MJ migrations..."
npx mj migrate
echo "  ✓ Migrations complete"
echo ""

# Codegen writes Angular entity-form components into
# ./packages/MJExplorer/src/app/generated/, which is bind-mounted to
# ./.docker-generated/MJExplorer-forms/ on the host. That's the whole point
# of this container.
echo "Step 3: Running CodeGen to generate Angular entity forms..."
npx mj codegen
echo "  ✓ CodeGen complete"
echo ""

# Sanity check: confirm forms were written to the bind-mount.
GENERATED_DIR="/app/packages/MJExplorer/src/app/generated"
ENTITY_COUNT=$(find "$GENERATED_DIR" -mindepth 1 -maxdepth 2 -type d 2>/dev/null | wc -l | tr -d ' ')
FILE_COUNT=$(find "$GENERATED_DIR" -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')
echo "  Generated $ENTITY_COUNT entity directories, $FILE_COUNT .ts files in $GENERATED_DIR"

if [ "$FILE_COUNT" -lt 3 ]; then
    echo "  WARNING: codegen produced very few files — verify mj.config.cjs Angular output paths"
fi

echo ""
echo "  ═══════════════════════════════════════════"
echo "  Form generation complete!"
echo "  ═══════════════════════════════════════════"
echo ""
