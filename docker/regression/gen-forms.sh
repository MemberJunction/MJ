#!/bin/bash
# Generate Angular entity-form components for the regression docker stack.
#
# Runs the form-generator compose service (codegen against a temp DB) and
# writes the resulting *.form.component.ts files to:
#   docker/regression/.docker-generated/MJExplorer-forms/
#
# The explorer build picks them up via COPY in Dockerfile.explorer.
#
# ISOLATION (DR-C5 follow-up): this runs under its OWN compose project
# (`mj-regression-genforms`) plus the gen-forms overlay that re-points the SQL
# Server volumes to throwaway names. That matters because the final `down -v`
# removes named volumes — on the shared `mj-regression` project it wiped the real
# stack's DB + DR-B1 snapshot (the base volumes are pinned to explicit names, so
# a distinct project alone would NOT protect them). Isolated, `down -v` can only
# remove gen-forms's own throwaway containers + volumes; the real stack (if
# running) is untouched. The generated forms live on a host bind-mount, so they
# survive the teardown. We always tear down, even on failure, so no throwaway
# DB/volume leaks between runs.
set -u

cd "$(dirname "$0")/../.."

GENFORMS_PROJECT="mj-regression-genforms"
COMPOSE="docker compose -p $GENFORMS_PROJECT -f docker/regression/docker-compose.test.yml -f docker/regression/docker-compose.gen-forms.yml --env-file docker/regression/.env.test"

echo "▶ Generating entity forms via form-generator service..."
$COMPOSE --profile gen-forms run --build --rm form-generator
RUN_STATUS=$?

echo "▶ Tearing down temporary stack..."
$COMPOSE down -v

if [ $RUN_STATUS -ne 0 ]; then
    echo "✗ Form generation failed (exit $RUN_STATUS)"
    exit $RUN_STATUS
fi

echo "✓ Form generation complete"
