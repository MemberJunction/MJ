#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - Metadata Sync Script
# Pushes metadata from local ./metadata directory to the running container instance
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "Pushing metadata changes to MemberJunction database..."
docker compose exec -T mj mj sync push --dir /work/metadata

echo "Metadata sync complete!"
