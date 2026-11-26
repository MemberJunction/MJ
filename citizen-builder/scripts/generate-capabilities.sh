#!/bin/bash
# ==============================================================================
# Citizen Agent Builder - Capabilities Catalog Generator
# Queries the local MemberJunction database and outputs an updated CAPABILITIES.md
# so the local coding agent has an exact catalog of entities, views, fields,
# actions, and sub-agents. Works both inside the `mj` container and on the host.
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="$DIR/CAPABILITIES.md"
STDOUT_MODE=false
if [ "${1:-}" = "--stdout" ]; then
  STDOUT_MODE=true
fi

if [ -f "$DIR/.env" ]; then
  set -a
  source "$DIR/.env"
  set +a
fi

DB_HOST="${DB_HOST:-sqlserver}"
DB_PORT="${DB_PORT:-1433}"
DB_DATABASE="${DB_DATABASE:-MemberJunction}"
DB_USERNAME="${DB_USERNAME:-sa}"
DB_PASSWORD="${DB_PASSWORD:-TestPassword123!}"

generate_inside_container() {
  local target_file="/work/CAPABILITIES.md"
  if [ ! -d "/work" ]; then
    target_file="$OUTPUT_FILE"
  fi

  local content
  content="$(node -e "
    const resolveMssql = () => {
      for (const candidate of [
        '/workspace/node_modules/mssql',
        '/workspace/apps/MJAPI/node_modules/mssql',
        '/workspace/packages/MJAPI/node_modules/mssql',
      ]) {
        try { return require(candidate); } catch {}
      }
      throw new Error('Could not locate mssql module in /workspace');
    };
    const sql = resolveMssql();
    const clean = (val, fallback = 'No description') => {
      const text = (val === null || val === undefined || String(val).trim() === '') ? fallback : String(val);
      return text.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\\\|').trim();
    };
    (async () => {
      const pool = await sql.connect({
        server: process.env.DB_HOST || 'sqlserver',
        port: Number(process.env.DB_PORT || 1433),
        database: process.env.DB_DATABASE || 'MemberJunction',
        user: process.env.DB_USERNAME || 'sa',
        password: process.env.DB_PASSWORD || 'TestPassword123!',
        options: {
          encrypt: true,
          trustServerCertificate: true,
        },
      });
      try {
        const [entitiesRes, fieldsRes, actionsRes, agentsRes] = await Promise.all([
          pool.request().query(\`
            SELECT ID, Name, SchemaName, BaseView, Description
            FROM [__mj].[vwEntities]
            WHERE VirtualEntity = 0
            ORDER BY Name ASC
          \`),
          pool.request().query(\`
            SELECT EntityID, Name, Type
            FROM [__mj].[vwEntityFields]
            WHERE Name NOT LIKE '__mj[_]%'
            ORDER BY EntityID ASC, Sequence ASC, Name ASC
          \`),
          pool.request().query(\`
            SELECT Name, Description
            FROM [__mj].[vwActions]
            ORDER BY Name ASC
          \`),
          pool.request().query(\`
            SELECT Name, Type, Description
            FROM [__mj].[vwAIAgents]
            ORDER BY Name ASC
          \`),
        ]);

        const fieldsByEntity = new Map();
        for (const f of fieldsRes.recordset) {
          const list = fieldsByEntity.get(f.EntityID) || [];
          list.push(f.Name + ' (' + f.Type + ')');
          fieldsByEntity.set(f.EntityID, list);
        }

        const lines = [];
        lines.push('# System Capabilities Catalog');
        lines.push('');
        lines.push('This catalog reflects the real entities, views, fields, actions, and agents available in this MemberJunction instance.');
        lines.push('Use these exact names when authoring agent steps, action bindings, `Run Ad-hoc Query` SQL, and prompt templates.');
        lines.push('');
        lines.push('## 1. Available Entities');
        lines.push('| Entity Name | View | Description | Fields |');
        lines.push('|---|---|---|---|');
        for (const e of entitiesRes.recordset) {
          const viewRef = '[' + e.SchemaName + '].[' + e.BaseView + ']';
          const fields = fieldsByEntity.get(e.ID) || [];
          const fieldsStr = clean(fields.join(', '), 'None');
          lines.push('| \`' + clean(e.Name, '') + '\` | \`' + viewRef + '\` | ' + clean(e.Description) + ' | ' + fieldsStr + ' |');
        }
        lines.push('');
        lines.push('## 2. Available Actions (Tools)');
        lines.push('| Action Name | Description |');
        lines.push('|---|---|');
        for (const a of actionsRes.recordset) {
          lines.push('| \`' + clean(a.Name, '') + '\` | ' + clean(a.Description) + ' |');
        }
        lines.push('');
        lines.push('## 3. Available Sub-Agents');
        lines.push('| Agent Name | Type | Description |');
        lines.push('|---|---|---|');
        for (const ag of agentsRes.recordset) {
          lines.push('| \`' + clean(ag.Name, '') + '\` | ' + clean(ag.Type, '') + ' | ' + clean(ag.Description) + ' |');
        }
        lines.push('');
        process.stdout.write(lines.join('\n'));
      } finally {
        await pool.close();
      }
    })().catch((err) => {
      console.error('Capabilities query failed:', err);
      process.exit(1);
    });
  ")"

  if [ "$STDOUT_MODE" = true ]; then
    printf '%s\n' "$content"
  else
    printf '%s\n' "$content" > "$target_file"
    echo "Capabilities catalog updated at: $target_file"
  fi
}

if [ -d "/workspace/node_modules/mssql" ] || [ -d "/workspace/apps/MJAPI/node_modules/mssql" ] || [ -d "/workspace/packages/MJAPI/node_modules/mssql" ]; then
  generate_inside_container
  exit 0
fi

# Running on the host: delegate into the running `mj` container
cd "$DIR"
echo "Generating CAPABILITIES.md from database catalog..."

if docker compose ps --status running --format "{{.Service}}" 2>/dev/null | grep -qx "mj"; then
  if grep -q "CAPABILITIES.md" "$DIR/docker-compose.yml" 2>/dev/null; then
    docker compose exec -T -w /workspace mj bash /work/scripts/generate-capabilities.sh
  else
    TMP_FILE="${OUTPUT_FILE}.tmp"
    docker compose exec -T -w /workspace mj bash /work/scripts/generate-capabilities.sh --stdout > "$TMP_FILE"
    mv "$TMP_FILE" "$OUTPUT_FILE"
  fi
  echo "Capabilities catalog updated at: $OUTPUT_FILE"
else
  echo "Notice: MemberJunction container ('mj') is not running; creating baseline CAPABILITIES.md"
  cat << 'EOF' > "$OUTPUT_FILE"
# System Capabilities Catalog

*This catalog is automatically populated once your local database is booted and bootstrapped.*

## Available Core Actions
* `Send Email` - Send notification or transactional emails
* `Create Record` - Insert a new record into any permitted entity
* `Update Record` - Update an existing record by ID
* `Run Ad-hoc Query` - Execute a dynamic read-only query against entity views
* `Run Stored Query` - Execute a saved query by name or ID
* `Get Record` - Fetch a record by primary key

Start the stack with `docker compose up -d` and re-run `./scripts/generate-capabilities.sh` to populate the complete catalog from your installed Open App.
EOF
  echo "Capabilities catalog updated at: $OUTPUT_FILE"
fi
