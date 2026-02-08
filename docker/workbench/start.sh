#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Check for .env file
if [ ! -f .env ]; then
    echo "No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo ""
    echo ">>> Edit .env if you need to set ANTHROPIC_API_KEY, then re-run this script."
    echo ">>> (Leave blank if using Claude Max OAuth login.)"
    exit 1
fi

# Source .env
source .env

# Create workspace dir if missing
mkdir -p workspace

# Build and start
echo "Starting sql-claude and claude-dev containers..."
docker compose up -d --build

echo ""
echo "Waiting for SQL Server to be healthy..."
docker compose exec sql-claude bash -c 'until /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null; do sleep 2; done'
echo "SQL Server is ready."

echo ""
echo "=== Claude Dev Workbench Ready ==="
echo ""
echo "  Connect to Claude Code:"
echo "    docker exec -it claude-dev zsh"
echo "    cc    (alias for claude --dangerously-skip-permissions)"
echo ""
echo "  Connect to SQL directly:"
echo "    docker exec -it claude-dev sqlcmd -S sql-claude -U sa -P '\$SA_PASSWORD' -C"
echo ""
echo "  From host (e.g. Azure Data Studio):"
echo "    Server: localhost,1444"
echo "    User: sa"
echo "    Password: \$SA_PASSWORD"
echo ""
echo "  Stop everything:"
echo "    docker compose down"
echo ""
