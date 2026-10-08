#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - capabilities catalog
#
# Usage: ./scripts/generate-capabilities.sh
#
# Writes CAPABILITIES.md: the Open Apps installed (including the sample data),
# and the entities, actions and agents in the local database, so the coding
# agent uses real names instead of guessing. Run it once setup is ready
# (.mj-status.json says "ready") and again after installing an Open App.
# ==============================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
OUTPUT_FILE="$DIR/CAPABILITIES.md"

if [ -f "$DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env"
  set +a
fi
DB_PASSWORD="${DB_PASSWORD:-TestPassword123!}"
DB_DATABASE="${DB_DATABASE:-MemberJunction}"

echo "Generating CAPABILITIES.md from the database..."

SQL_QUERY="
SET NOCOUNT ON;
-- sqlcmd shows at most 256 characters of a value, so descriptions are cut to 160 to keep each row whole.
PRINT '# System Capabilities Catalog';
PRINT '';
PRINT 'The Open Apps, entities, actions and agents in this MemberJunction instance.';
PRINT 'Use these exact names when authoring agent steps, action bindings and prompt templates.';
PRINT '';
PRINT '## 1. Installed Open Apps';
PRINT 'An app whose Status is not Active did not finish installing; its data may be missing.';
PRINT '';
PRINT '| App | Version | Status | Schema |';
PRINT '|---|---|---|---|';
SELECT '| ' + COALESCE(DisplayName, Name) + ' | ' + Version + ' | ' + Status + ' | ' + COALESCE(SchemaName, '') + ' |'
FROM [__mj].[vwOpenApps]
ORDER BY Name ASC;

PRINT '';
PRINT '## 2. Entities';
PRINT '| Entity Name | Description |';
PRINT '|---|---|';
SELECT '| \`' + Name + '\` | ' + LEFT(REPLACE(REPLACE(COALESCE(Description, 'No description'), CHAR(13), ' '), CHAR(10), ' '), 160) + ' |'
FROM [__mj].[vwEntities]
WHERE VirtualEntity = 0
ORDER BY Name ASC;

PRINT '';
PRINT '## 3. Actions (tools)';
PRINT '| Action Name | Description |';
PRINT '|---|---|';
SELECT '| \`' + Name + '\` | ' + LEFT(REPLACE(REPLACE(COALESCE(Description, 'No description'), CHAR(13), ' '), CHAR(10), ' '), 160) + ' |'
FROM [__mj].[vwActions]
ORDER BY Name ASC;

PRINT '';
PRINT '## 4. Agents (usable as sub-agents)';
PRINT '| Agent Name | Type | Description |';
PRINT '|---|---|---|';
SELECT '| \`' + COALESCE(Name, '') + '\` | ' + COALESCE(Type, '') + ' | ' + LEFT(REPLACE(REPLACE(COALESCE(Description, 'No description'), CHAR(13), ' '), CHAR(10), ' '), 160) + ' |'
FROM [__mj].[vwAIAgents]
ORDER BY Name ASC;
"

TEMP_FILE="$(mktemp)"
trap 'rm -f "$TEMP_FILE"' EXIT
if docker compose exec -T -e SQLCMDPASSWORD="$DB_PASSWORD" sqlserver /opt/mssql-tools18/bin/sqlcmd \
    -S localhost -U sa -d "$DB_DATABASE" -C -No -b -W -w 65535 -h -1 \
    -Q "$SQL_QUERY" > "$TEMP_FILE" 2>&1; then
  mv "$TEMP_FILE" "$OUTPUT_FILE"
  echo "Capabilities catalog updated: $OUTPUT_FILE"
else
  echo "Could not read the catalog from the database:" >&2
  cat "$TEMP_FILE" >&2
  echo "Is setup finished? Check .mj-status.json (it should say \"ready\"), or run: docker compose ps" >&2
  exit 1
fi
