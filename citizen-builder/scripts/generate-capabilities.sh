#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - Capabilities Catalog Generator
# Queries the local MemberJunction database and outputs an updated CAPABILITIES.md
# so the local coding agent has an exact catalog of entities, actions, and agents.
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="$DIR/CAPABILITIES.md"

if [ -f "$DIR/.env" ]; then
  set -a
  source "$DIR/.env"
  set +a
fi

DB_PASSWORD="${DB_PASSWORD:-TestPassword123!}"

echo "Generating CAPABILITIES.md from database catalog..."

SQL_QUERY="
SET NOCOUNT ON;
PRINT '# System Capabilities Catalog';
PRINT '';
PRINT 'This catalog reflects the real entities, actions, and agents available in this MemberJunction instance.';
PRINT 'Use these exact names when authoring agent steps, action bindings, and prompt templates.';
PRINT '';
PRINT '## 1. Available Entities';
PRINT '| Entity Name | Description |';
PRINT '|---|---|';
SELECT '| \`' + Name + '\` | ' + REPLACE(REPLACE(COALESCE(Description, 'No description'), CHAR(13), ' '), CHAR(10), ' ') + ' |'
FROM [__mj].[vwEntities]
WHERE VirtualEntity = 0
ORDER BY Name ASC;

PRINT '';
PRINT '## 2. Available Actions (Tools)';
PRINT '| Action Name | Description |';
PRINT '|---|---|';
SELECT '| \`' + Name + '\` | ' + REPLACE(REPLACE(COALESCE(Description, 'No description'), CHAR(13), ' '), CHAR(10), ' ') + ' |'
FROM [__mj].[vwActions]
ORDER BY Name ASC;

PRINT '';
PRINT '## 3. Available Sub-Agents';
PRINT '| Agent Name | Type | Description |';
PRINT '|---|---|---|';
SELECT '| \`' + Name + '\` | ' + Type + ' | ' + REPLACE(REPLACE(COALESCE(Description, 'No description'), CHAR(13), ' '), CHAR(10), ' ') + ' |'
FROM [__mj].[vwAIAgents]
ORDER BY Name ASC;
"

docker compose exec -T sqlserver /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$DB_PASSWORD" -d MemberJunction -C -No -W -w 200 \
  -Q "$SQL_QUERY" > "$OUTPUT_FILE" 2>/dev/null || {
    echo "Notice: Database not yet initialized; creating baseline CAPABILITIES.md"
    cat << 'EOF' > "$OUTPUT_FILE"
# System Capabilities Catalog

*This catalog is automatically populated once your local database is booted and bootstrapped.*

## Available Core Actions
* `Send Email` - Send notification or transactional emails
* `Create Record` - Insert a new record into any permitted entity
* `Update Record` - Update an existing record by ID
* `Run Query` - Execute a dynamic query against entities
* `Get Record` - Fetch a record by primary key

Run `./scripts/bootstrap.sh` to populate the complete catalog from your installed Open App.
EOF
}

echo "Capabilities catalog updated at: $OUTPUT_FILE"
