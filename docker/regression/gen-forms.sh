#!/bin/bash
# Generate Angular entity-form components for the regression docker stack.
#
# Runs the form-generator compose service (codegen against a temp DB) and
# writes the resulting *.form.component.ts files to:
#   docker/regression/.docker-generated/MJExplorer-forms/
#
# The explorer build picks them up via COPY in Dockerfile.explorer.
#
# Always tears down the temporary stack (sqlserver + volumes) before exiting,
# even on failure, so the next `mj test regression up` starts from a clean DB.
set -u

cd "$(dirname "$0")/../.."

COMPOSE="docker compose -f docker/regression/docker-compose.test.yml --env-file docker/regression/.env.test"

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
