/**
 * OpenApp repository scaffolder (`mj app create`) and Schema Consistency CI generator.
 *
 * Generates the standard OpenApp repository layout — including `.github/workflows/schema-consistency.yml`
 * and `.github/scripts/check-schema-consistency.mjs` — so every newly created OpenApp enforces:
 *   1. Foreign key index coverage (`MC4`): every `FOREIGN KEY ([Col])` in migrations and in the
 *      physical schema has its `IDX_AUTO_MJ_FKEY_{Table}_{Column}` index (or a composite index with
 *      the FK column as the leading key).
 *   2. Metadata & catalog consistency (`MC1`–`MC4`):
 *      - Base tables in the OpenApp schema are registered in `Entity` and `EntityField`
 *      - `MC1`: every generated `BaseView` exists in `sys.objects`
 *      - `MC2`: every generated `spCreate` / `spUpdate` / `spDelete` exists in `sys.objects`
 *      - `MC3`: column-level value-list `CHECK` constraints match `EntityFieldValue` rows
 *      - `MC4`: every FK column in `sys.foreign_key_columns` and `EntityField.RelatedEntityID`
 *        is covered by an index in `sys.indexes` / `sys.index_columns`
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ValidateSchemaName } from '../install/schema-manager.js';

export const SCHEMA_CONSISTENCY_WORKFLOW_PATH = '.github/workflows/schema-consistency.yml';
export const SCHEMA_CONSISTENCY_SCRIPT_PATH = '.github/scripts/check-schema-consistency.mjs';

export interface SchemaConsistencyTemplateOptions {
    /** Database schema name owned by the OpenApp (e.g. `acme_crm` or `__mj_BizAppsCommon`). */
    SchemaName: string;
    /** Relative path to the SQL migrations directory (defaults to `'migrations'`). */
    MigrationsDirectory?: string;
    /** MJ core schema name (defaults to `'__mj'`). */
    CoreSchemaName?: string;
}

export interface AppScaffoldOptions {
    /** Target directory where the OpenApp repository is scaffolded. */
    RepoRoot: string;
    /** Lowercase hyphenated app name (`mj-app.json` `name`, e.g. `'acme-crm'`). */
    AppName: string;
    /** Human-readable display name (e.g. `'Acme CRM'`). */
    DisplayName: string;
    /** Short description (10-500 chars). */
    Description: string;
    /** Database schema name owned by the OpenApp (e.g. `'acme_crm'`). */
    SchemaName: string;
    /** Publisher name for `mj-app.json`. */
    PublisherName: string;
    /** GitHub repository URL for `mj-app.json`. */
    RepositoryUrl: string;
    /** Compatible MJ semver range (defaults to `'>=6.0.0 <7.0.0'`). */
    MJVersionRange?: string;
    /** Relative path to migrations directory (defaults to `'migrations'`). */
    MigrationsDirectory?: string;
    /** Allow `__`-prefixed schema names outside `__mj_<AppName>`. */
    AllowDoubleUnderscoreSchema?: boolean;
    /** Overwrite existing files if they already exist (defaults to `false`). */
    Overwrite?: boolean;
    /** Compute scaffold actions without writing to disk. */
    DryRun?: boolean;
}

export interface ScaffoldedFile {
    /** Relative path from `RepoRoot`. */
    RelativePath: string;
    /** Action taken for this file. */
    Status: 'created' | 'updated' | 'skipped';
    /** Generated file content. */
    Content: string;
}

export interface AppScaffoldResult {
    Success: boolean;
    ErrorMessage?: string;
    Files: ScaffoldedFile[];
}

export interface MigrationSqlInput {
    File: string;
    Sql: string;
}

export interface DeclaredForeignKeyColumn {
    Table: string;
    Column: string;
    File: string;
}

export interface MissingForeignKeyIndex {
    Table: string;
    Column: string;
    ExpectedIndex: string;
    File: string;
}

export interface ForeignKeyIndexScanResult {
    ForeignKeys: DeclaredForeignKeyColumn[];
    Missing: MissingForeignKeyIndex[];
}

/**
 * CodeGen's standard FK index name: `IDX_AUTO_MJ_FKEY_{Table}_{Column}`, truncated to 128 characters.
 */
export function ExpectedForeignKeyIndexName(table: string, column: string): string {
    const raw = `IDX_AUTO_MJ_FKEY_${table}_${column}`;
    return raw.length > 128 ? raw.slice(0, 128) : raw;
}

/**
 * Blank SQL comments (`-- ...` and `/* ... * /`) and single-quoted string literals (`'...'`)
 * while preserving line breaks and bracketed identifiers `[...]`.
 */
export function StripSqlCommentsAndStrings(source: string): string {
    const chunks: string[] = [];
    let i = 0;
    const n = source.length;
    const stateOpeners = /[-/'[]/g;

    const mask = (start: number, end: number): string => {
        const nl = source.indexOf('\n', start);
        if (nl === -1 || nl >= end) {
            return ' '.repeat(end - start);
        }
        return source.slice(start, end).replace(/[^\n]/g, ' ');
    };

    while (i < n) {
        stateOpeners.lastIndex = i;
        const opener = stateOpeners.exec(source);
        if (opener === null) {
            chunks.push(source.slice(i));
            break;
        }
        if (opener.index > i) {
            chunks.push(source.slice(i, opener.index));
        }
        i = opener.index;

        const two = source.slice(i, i + 2);
        if (two === '--') {
            const end = source.indexOf('\n', i);
            const stop = end === -1 ? n : end;
            chunks.push(mask(i, stop));
            i = stop;
            continue;
        }

        if (two === '/*') {
            let depth = 1;
            let j = i + 2;
            while (j < n && depth > 0) {
                const open = source.indexOf('/*', j);
                const close = source.indexOf('*/', j);
                if (close === -1) {
                    j = n;
                    break;
                }
                if (open !== -1 && open < close) {
                    depth++;
                    j = open + 2;
                } else {
                    depth--;
                    j = close + 2;
                }
            }
            chunks.push(mask(i, j));
            i = j;
            continue;
        }

        if (source[i] === "'") {
            let j = i + 1;
            for (;;) {
                const quote = source.indexOf("'", j);
                if (quote === -1) {
                    j = n;
                    break;
                }
                if (source[quote + 1] === "'") {
                    j = quote + 2;
                    continue;
                }
                j = quote + 1;
                break;
            }
            chunks.push(mask(i, j));
            i = j;
            continue;
        }

        if (source[i] === '[') {
            let j = i + 1;
            for (;;) {
                const bracket = source.indexOf(']', j);
                if (bracket === -1) {
                    j = n;
                    break;
                }
                if (source[bracket + 1] === ']') {
                    j = bracket + 2;
                    continue;
                }
                j = bracket + 1;
                break;
            }
            chunks.push(source.slice(i, j));
            i = j;
            continue;
        }

        chunks.push(source[i]);
        i++;
    }

    return chunks.join('');
}

function extractBalancedParens(text: string, openParenIndex: number): string {
    let depth = 0;
    for (let i = openParenIndex; i < text.length; i++) {
        const ch = text[i];
        if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth--;
            if (depth === 0) {
                return text.slice(openParenIndex + 1, i);
            }
        }
    }
    return text.slice(openParenIndex + 1);
}

/**
 * Statically scans an ordered list of SQL migrations for `FOREIGN KEY ([Col])` declarations
 * (in both `CREATE TABLE` and `ALTER TABLE`) and verifies that each FK column is covered by
 * either its `IDX_AUTO_MJ_FKEY_{Table}_{Column}` index or an index on `Table` whose leading
 * key column is `Column` (when `allowLeadingColumnIndex` is true; defaults to `false` so
 * `IDX_AUTO_MJ_FKEY_*` naming is enforced by default to match `MC4`).
 */
export function ScanMigrationForeignKeyIndexes(
    migrations: ReadonlyArray<MigrationSqlInput>,
    options?: { allowLeadingColumnIndex?: boolean }
): ForeignKeyIndexScanResult {
    const foreignKeys = new Map<string, DeclaredForeignKeyColumn>();
    const indexNames = new Set<string>();
    const leadingIndexedColumns = new Set<string>();
    const allowLeading = options?.allowLeadingColumnIndex ?? false;

    const schemaPrefix = String.raw`(?:\[[^\]]+\]|\$\{flyway:defaultSchema\}|[A-Za-z0-9_]+)`;
    const createTableRe = new RegExp(
        String.raw`\bCREATE\s+TABLE\s+(?:${schemaPrefix}\.)?\[?([A-Za-z0-9_]+)\]?\s*\(`,
        'gi'
    );
    const tableFkRe = /\bFOREIGN\s+KEY\s*\(\s*\[?([A-Za-z0-9_]+)\]?\s*\)\s*REFERENCES\b/gi;
    const alterFkRe = new RegExp(
        String.raw`\bALTER\s+TABLE\s+(?:${schemaPrefix}\.)?\[?([A-Za-z0-9_]+)\]?\s+(?:WITH\s+(?:CHECK|NOCHECK)\s+)?ADD\s+(?:CONSTRAINT\s+\[?[A-Za-z0-9_]+\]?\s+)?FOREIGN\s+KEY\s*\(\s*\[?([A-Za-z0-9_]+)\]?\s*\)\s*REFERENCES\b`,
        'gi'
    );
    const dropColumnRe = new RegExp(
        String.raw`\bALTER\s+TABLE\s+(?:${schemaPrefix}\.)?\[?([A-Za-z0-9_]+)\]?\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?\[?([A-Za-z0-9_]+)\]?`,
        'gi'
    );
    const createIndexRe = new RegExp(
        String.raw`\bCREATE\s+(?:UNIQUE\s+)?(?:NONCLUSTERED\s+|CLUSTERED\s+)?INDEX\s+\[?([A-Za-z0-9_]+)\]?\s+ON\s+(?:${schemaPrefix}\.)?\[?([A-Za-z0-9_]+)\]?\s*\(\s*\[?([A-Za-z0-9_]+)\]?`,
        'gi'
    );

    for (const { File, Sql } of migrations) {
        const masked = StripSqlCommentsAndStrings(Sql);

        let match: RegExpExecArray | null;
        createTableRe.lastIndex = 0;
        while ((match = createTableRe.exec(masked)) !== null) {
            const table = match[1];
            const openParen = match.index + match[0].length - 1;
            const body = extractBalancedParens(masked, openParen);
            let fkMatch: RegExpExecArray | null;
            tableFkRe.lastIndex = 0;
            while ((fkMatch = tableFkRe.exec(body)) !== null) {
                const column = fkMatch[1];
                const key = `${table}.${column}`.toLowerCase();
                if (!foreignKeys.has(key)) {
                    foreignKeys.set(key, { Table: table, Column: column, File });
                }
            }
        }

        alterFkRe.lastIndex = 0;
        while ((match = alterFkRe.exec(masked)) !== null) {
            const table = match[1];
            const column = match[2];
            const key = `${table}.${column}`.toLowerCase();
            if (!foreignKeys.has(key)) {
                foreignKeys.set(key, { Table: table, Column: column, File });
            }
        }

        dropColumnRe.lastIndex = 0;
        while ((match = dropColumnRe.exec(masked)) !== null) {
            const table = match[1];
            const column = match[2];
            foreignKeys.delete(`${table}.${column}`.toLowerCase());
        }

        createIndexRe.lastIndex = 0;
        while ((match = createIndexRe.exec(masked)) !== null) {
            const indexName = match[1];
            const table = match[2];
            const leadingCol = match[3];
            indexNames.add(`${table}.${indexName}`.toLowerCase());
            leadingIndexedColumns.add(`${table}.${leadingCol}`.toLowerCase());
        }
    }

    const missing: MissingForeignKeyIndex[] = [];
    for (const fk of foreignKeys.values()) {
        const expectedIndex = ExpectedForeignKeyIndexName(fk.Table, fk.Column);
        const hasExactName = indexNames.has(`${fk.Table}.${expectedIndex}`.toLowerCase());
        const hasLeadingCol = allowLeading && leadingIndexedColumns.has(`${fk.Table}.${fk.Column}`.toLowerCase());
        if (!hasExactName && !hasLeadingCol) {
            missing.push({
                Table: fk.Table,
                Column: fk.Column,
                ExpectedIndex: expectedIndex,
                File: fk.File,
            });
        }
    }

    missing.sort((a, b) => `${a.Table}.${a.Column}`.localeCompare(`${b.Table}.${b.Column}`));

    return {
        ForeignKeys: [...foreignKeys.values()],
        Missing: missing,
    };
}

/**
 * Generates the `.github/workflows/schema-consistency.yml` workflow for an OpenApp repository.
 *
 * The generated workflow runs two jobs:
 *   1. `fk-indexes`: fast static check verifying every `FOREIGN KEY ([Col])` in migrations
 *      has a corresponding `IDX_AUTO_MJ_FKEY_{Table}_{Column}` index.
 *   2. `catalog-consistency`: clean-room SQL Server job verifying `MC1`–`MC4` against the built
 *      database schema (`Entity` and `EntityField` registration, generated `BaseView` and CRUD
 *      procedures in `sys.objects`, `CHECK` constraint value-list parity, and physical FK index
 *      coverage in `sys.foreign_key_columns` / `sys.index_columns`).
 */
export function GenerateSchemaConsistencyWorkflow(options: SchemaConsistencyTemplateOptions): string {
    const schemaName = options.SchemaName;
    const migrationsDir = options.MigrationsDirectory ?? 'migrations';
    const coreSchema = options.CoreSchemaName ?? '__mj';

    return `name: Schema Consistency

# Generated by @memberjunction/open-app-engine.
# Enforces OpenApp database schema and metadata consistency (MC1-MC4):
#   1. Static migration gate: every FOREIGN KEY column declared in ${migrationsDir}/ has its
#      CodeGen-standard IDX_AUTO_MJ_FKEY_{Table}_{Column} index.
#   2. Clean-room catalog gate (MC1-MC4): builds the migration chain against MJ core and verifies
#      that all base tables in ${schemaName} have Entity + EntityField metadata, generated BaseViews
#      (MC1), CRUD stored procedures (MC2), CHECK constraint value-list parity (MC3), and physical
#      foreign key index coverage (MC4).

on:
  workflow_dispatch:
  push:
    branches: [next, main]
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
    branches: [next, main]

permissions:
  contents: read

concurrency:
  group: schema-consistency-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  fk-indexes:
    name: Foreign Key Index Coverage (MC4 Static)
    if: github.event_name != 'pull_request' || github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Verify FK index coverage across migrations
        run: |
          node ./${SCHEMA_CONSISTENCY_SCRIPT_PATH} --self-test
          node ./${SCHEMA_CONSISTENCY_SCRIPT_PATH} --dir ./${migrationsDir}

  catalog-consistency:
    name: Clean-Room Schema & Metadata Consistency (MC1-MC4)
    if: github.event_name != 'pull_request' || github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    timeout-minutes: 30

    services:
      mssql:
        image: mcr.microsoft.com/mssql/server:2022-latest
        env:
          ACCEPT_EULA: 'Y'
          MSSQL_SA_PASSWORD: 'yourStrong(!)Password123'
        ports:
          - 1433:1433
        options: >-
          --health-cmd "/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'yourStrong(!)Password123' -C -Q 'SELECT 1'"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DB_HOST: localhost
      DB_PORT: 1433
      DB_DATABASE: openapp_cleanroom_\${{ github.run_id }}_\${{ github.run_attempt }}
      DB_USERNAME: sa
      DB_PASSWORD: 'yourStrong(!)Password123'
      CODEGEN_DB_USERNAME: sa
      CODEGEN_DB_PASSWORD: 'yourStrong(!)Password123'
      DB_ENCRYPT: 'false'
      DB_TRUST_SERVER_CERTIFICATE: 'true'

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install sqlcmd
        run: |
          if ! command -v sqlcmd &> /dev/null && [ ! -x /opt/mssql-tools18/bin/sqlcmd ]; then
            curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
            curl -fsSL https://packages.microsoft.com/config/ubuntu/\$(lsb_release -rs)/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
            sudo apt-get update -qq
            sudo ACCEPT_EULA=Y apt-get install -y -qq mssql-tools18 unixodbc-dev
            echo "/opt/mssql-tools18/bin" >> \$GITHUB_PATH
          fi

      - name: Resolve MJ core tag from mj-app.json
        id: mj
        run: |
          TAG=\$(node -e "
            const range = require('./mj-app.json').mjVersionRange || '';
            const m = range.match(/>=\\\\s*([0-9][^\\\\s]*)/);
            if (!m) { console.error('Cannot parse mjVersionRange: ' + JSON.stringify(range)); process.exit(1); }
            console.log('v' + m[1]);
          ")
          echo "tag=\$TAG" >> "\$GITHUB_OUTPUT"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile --ignore-scripts

      - name: Create clean-room database
        run: |
          sqlcmd -S "\$DB_HOST,\$DB_PORT" -U "\$DB_USERNAME" -P "\$DB_PASSWORD" -C -b -Q \\
            "CREATE DATABASE [\$DB_DATABASE]; ALTER AUTHORIZATION ON DATABASE::[\$DB_DATABASE] TO [sa];"

      - name: Install MJ core
        run: pnpm exec mj migrate --tag \${{ steps.mj.outputs.tag }} --verbose

      - name: Apply OpenApp migrations
        run: pnpm exec mj migrate --schema ${schemaName} --dir ./${migrationsDir} --verbose

      - name: Verify MC1-MC4 catalog and FK index consistency
        run: |
          node ./${SCHEMA_CONSISTENCY_SCRIPT_PATH} --live --schema ${schemaName} --core-schema ${coreSchema} --database "\$DB_DATABASE"
`;
}

/**
 * Generates `.github/scripts/check-schema-consistency.mjs`, the zero-dependency Node.js verification
 * script paired with `.github/workflows/schema-consistency.yml`.
 */
export function GenerateSchemaConsistencyScript(options: SchemaConsistencyTemplateOptions): string {
    const defaultSchema = options.SchemaName;
    const defaultMigrationsDir = options.MigrationsDirectory ?? './migrations';
    const defaultCoreSchema = options.CoreSchemaName ?? '__mj';

    return `#!/usr/bin/env node
/**
 * check-schema-consistency.mjs
 *
 * Generated by @memberjunction/open-app-engine.
 * Verifies OpenApp schema consistency in two modes:
 *   1. Static mode (default): scans SQL migrations in --dir for FOREIGN KEY columns and asserts
 *      each has an IDX_AUTO_MJ_FKEY_{Table}_{Column} index (MC4).
 *   2. Live catalog mode (--live): queries SQL Server sys.* and MJ metadata for MC1-MC4:
 *      - Every base table in the OpenApp schema has an Entity row and matching EntityField rows
 *      - MC1: every generated BaseView exists in sys.objects
 *      - MC2: every generated spCreate/spUpdate/spDelete exists in sys.objects
 *      - MC3: column-level CHECK constraints match EntityField rows
 *      - MC4: every FK column in sys.foreign_key_columns and EntityField has its IDX_AUTO_MJ_FKEY_*
 *             index (or a composite index with the FK column as leading key)
 */

import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SQLCMD_CANDIDATES = [
    'sqlcmd',
    '/opt/mssql-tools18/bin/sqlcmd',
    '/opt/mssql-tools/bin/sqlcmd',
    '/usr/local/bin/sqlcmd',
    '/opt/homebrew/bin/sqlcmd',
];

function argValue(flag) {
    const i = process.argv.indexOf(flag);
    return i === -1 ? undefined : process.argv[i + 1];
}

export function expectedFkIndexName(table, column) {
    const raw = \`IDX_AUTO_MJ_FKEY_\${table}_\${column}\`;
    return raw.length > 128 ? raw.slice(0, 128) : raw;
}

export function stripSqlComments(source) {
    const chunks = [];
    let i = 0;
    const n = source.length;
    const stateOpeners = /[-/'[]/g;

    const mask = (start, end) => {
        const nl = source.indexOf('\\n', start);
        if (nl === -1 || nl >= end) return ' '.repeat(end - start);
        return source.slice(start, end).replace(/[^\\n]/g, ' ');
    };

    while (i < n) {
        stateOpeners.lastIndex = i;
        const opener = stateOpeners.exec(source);
        if (opener === null) {
            chunks.push(source.slice(i));
            break;
        }
        if (opener.index > i) chunks.push(source.slice(i, opener.index));
        i = opener.index;

        const two = source.slice(i, i + 2);
        if (two === '--') {
            const end = source.indexOf('\\n', i);
            const stop = end === -1 ? n : end;
            chunks.push(mask(i, stop));
            i = stop;
            continue;
        }
        if (two === '/*') {
            let depth = 1;
            let j = i + 2;
            while (j < n && depth > 0) {
                const open = source.indexOf('/*', j);
                const close = source.indexOf('*/', j);
                if (close === -1) { j = n; break; }
                if (open !== -1 && open < close) { depth++; j = open + 2; }
                else { depth--; j = close + 2; }
            }
            chunks.push(mask(i, j));
            i = j;
            continue;
        }
        if (source[i] === "'") {
            let j = i + 1;
            for (;;) {
                const quote = source.indexOf("'", j);
                if (quote === -1) { j = n; break; }
                if (source[quote + 1] === "'") { j = quote + 2; continue; }
                j = quote + 1;
                break;
            }
            chunks.push(mask(i, j));
            i = j;
            continue;
        }
        if (source[i] === '[') {
            let j = i + 1;
            for (;;) {
                const bracket = source.indexOf(']', j);
                if (bracket === -1) { j = n; break; }
                if (source[bracket + 1] === ']') { j = bracket + 2; continue; }
                j = bracket + 1;
                break;
            }
            chunks.push(source.slice(i, j));
            i = j;
            continue;
        }
        chunks.push(source[i]);
        i++;
    }
    return chunks.join('');
}

function extractParenBody(text, openParenIndex) {
    let depth = 0;
    for (let i = openParenIndex; i < text.length; i++) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')') {
            depth--;
            if (depth === 0) return text.slice(openParenIndex + 1, i);
        }
    }
    return text.slice(openParenIndex + 1);
}

export function scanMigrationFkIndexes(migrations) {
    const foreignKeys = new Map();
    const indexes = new Set();

    const schemaPrefix = String.raw\`(?:\\[[^\\]]+\\]|\\$\\{flyway:defaultSchema\\}|[A-Za-z0-9_]+)\`;
    const createTableRe = new RegExp(String.raw\`\\bCREATE\\s+TABLE\\s+(?:\${schemaPrefix}\\.)?\\[?([A-Za-z0-9_]+)\\]?\\s*\\(\`, 'gi');
    const tableFkRe = /\\bFOREIGN\\s+KEY\\s*\\(\\s*\\[?([A-Za-z0-9_]+)\\]?\\s*\\)\\s*REFERENCES\\b/gi;
    const alterFkRe = new RegExp(String.raw\`\\bALTER\\s+TABLE\\s+(?:\${schemaPrefix}\\.)?\\[?([A-Za-z0-9_]+)\\]?\\s+(?:WITH\\s+(?:CHECK|NOCHECK)\\s+)?ADD\\s+(?:CONSTRAINT\\s+\\[?[A-Za-z0-9_]+\\]?\\s+)?FOREIGN\\s+KEY\\s*\\(\\s*\\[?([A-Za-z0-9_]+)\\]?\\s*\\)\\s*REFERENCES\\b\`, 'gi');
    const dropColumnRe = new RegExp(String.raw\`\\bALTER\\s+TABLE\\s+(?:\${schemaPrefix}\\.)?\\[?([A-Za-z0-9_]+)\\]?\\s+DROP\\s+COLUMN\\s+(?:IF\\s+EXISTS\\s+)?\\[?([A-Za-z0-9_]+)\\]?\`, 'gi');
    const createIndexRe = new RegExp(String.raw\`\\bCREATE\\s+(?:UNIQUE\\s+)?(?:NONCLUSTERED\\s+|CLUSTERED\\s+)?INDEX\\s+\\[?([A-Za-z0-9_]+)\\]?\\s+ON\\s+(?:\${schemaPrefix}\\.)?\\[?([A-Za-z0-9_]+)\\]?\\s*\\(\`, 'gi');

    for (const { file, sql } of migrations) {
        const masked = stripSqlComments(sql);
        let match;
        createTableRe.lastIndex = 0;
        while ((match = createTableRe.exec(masked)) !== null) {
            const table = match[1];
            const body = extractParenBody(masked, match.index + match[0].length - 1);
            let fkMatch;
            tableFkRe.lastIndex = 0;
            while ((fkMatch = tableFkRe.exec(body)) !== null) {
                const column = fkMatch[1];
                const key = \`\${table}.\${column}\`.toLowerCase();
                if (!foreignKeys.has(key)) foreignKeys.set(key, { table, column, file });
            }
        }
        alterFkRe.lastIndex = 0;
        while ((match = alterFkRe.exec(masked)) !== null) {
            const table = match[1];
            const column = match[2];
            const key = \`\${table}.\${column}\`.toLowerCase();
            if (!foreignKeys.has(key)) foreignKeys.set(key, { table, column, file });
        }
        dropColumnRe.lastIndex = 0;
        while ((match = dropColumnRe.exec(masked)) !== null) {
            foreignKeys.delete(\`\${match[1]}.\${match[2]}\`.toLowerCase());
        }
        createIndexRe.lastIndex = 0;
        while ((match = createIndexRe.exec(masked)) !== null) {
            indexes.add(\`\${match[2]}.\${match[1]}\`.toLowerCase());
        }
    }

    const missing = [];
    for (const { table, column, file } of foreignKeys.values()) {
        const expectedIndex = expectedFkIndexName(table, column);
        if (!indexes.has(\`\${table}.\${expectedIndex}\`.toLowerCase())) {
            missing.push({ table, column, expectedIndex, file });
        }
    }
    missing.sort((a, b) => \`\${a.table}.\${a.column}\`.localeCompare(\`\${b.table}.\${b.column}\`));
    return { foreignKeys, indexes, missing };
}

function findSqlcmd() {
    for (const candidate of SQLCMD_CANDIDATES) {
        try {
            execSync(\`\${candidate} -?\`, { stdio: 'ignore' });
            return candidate;
        } catch {
            // continue
        }
    }
    return null;
}

function runLiveCatalogChecks({ database, appSchema, coreSchema }) {
    const sqlcmd = findSqlcmd();
    if (!sqlcmd) {
        console.error('::error::sqlcmd not found in PATH or standard locations.');
        process.exit(2);
    }
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '1433';
    const user = process.env.DB_USERNAME || 'sa';
    const password = process.env.DB_PASSWORD || '';

    const queryRows = (sql) => {
        const out = execFileSync(
            sqlcmd,
            ['-S', \`\${host},\${port}\`, '-U', user, '-P', password, '-d', database, '-C', '-b', '-h', '-1', '-W', '-s', '|', '-Q', \`SET NOCOUNT ON; \${sql}\`],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        return out
            .split('\\n')
            .map((l) => l.trimEnd())
            .filter((l) => l.length > 0 && !/^-+(\\|-+)*$/.test(l))
            .map((l) => l.split('|').map((c) => c.trim()));
    };

    const escLit = (s) => \`N'\${s.replace(/'/g, "''")}'\`;
    const escId = (s) => \`[\${s.replace(/]/g, ']]')}]\`;
    const findings = [];

    // Unregistered physical base tables (excluding flyway_schema_history)
    const unregisteredTables = queryRows(\`
        SELECT t.name
        FROM sys.tables t
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        LEFT JOIN \${escId(coreSchema)}.Entity e ON e.SchemaName = s.name AND e.BaseTable = t.name
        WHERE s.name = \${escLit(appSchema)} AND t.name <> N'flyway_schema_history' AND e.ID IS NULL
        ORDER BY t.name;
    \`);
    for (const [table] of unregisteredTables) {
        findings.push(\`[ENTITY] \${appSchema}.\${table}: base table has no Entity metadata record\`);
    }

    // MC1: every generated BaseView exists in sys.objects
    const missingViews = queryRows(\`
        SELECT e.BaseTable, e.BaseView
        FROM \${escId(coreSchema)}.Entity e
        LEFT JOIN sys.schemas s ON s.name = e.SchemaName
        LEFT JOIN sys.objects o ON o.schema_id = s.schema_id AND o.name = e.BaseView AND o.type = 'V'
        WHERE e.SchemaName = \${escLit(appSchema)} AND e.VirtualEntity = 0 AND e.BaseViewGenerated = 1 AND o.object_id IS NULL
        ORDER BY e.BaseTable;
    \`);
    for (const [table, view] of missingViews) {
        findings.push(\`[MC1] \${appSchema}.\${table}: generated BaseView \${view} missing from sys.objects\`);
    }

    // Missing EntityField rows for base-view columns
    const missingFields = queryRows(\`
        SELECT e.BaseTable, c.COLUMN_NAME
        FROM \${escId(coreSchema)}.Entity e
        JOIN INFORMATION_SCHEMA.COLUMNS c ON c.TABLE_SCHEMA = e.SchemaName AND c.TABLE_NAME = e.BaseView
        LEFT JOIN \${escId(coreSchema)}.EntityField ef ON ef.EntityID = e.ID AND ef.Name = c.COLUMN_NAME
        WHERE e.SchemaName = \${escLit(appSchema)} AND ef.ID IS NULL
        ORDER BY e.BaseTable, c.ORDINAL_POSITION;
    \`);
    for (const [table, col] of missingFields) {
        findings.push(\`[ENTITY_FIELD] \${appSchema}.\${table}: base view column \${col} has no EntityField metadata row\`);
    }

    // MC4: every physical FK column in sys.foreign_key_columns has its IDX_AUTO_MJ_FKEY_* index (or leading-column index)
    const missingFkIndexes = queryRows(\`
        SELECT t.name AS TableName, c.name AS ColumnName
        FROM sys.foreign_key_columns fkc
        JOIN sys.tables t ON fkc.parent_object_id = t.object_id
        JOIN sys.schemas s ON t.schema_id = s.schema_id
        JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
        WHERE s.name = \${escLit(appSchema)}
          AND NOT EXISTS (
              SELECT 1
              FROM sys.indexes i
              JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
              WHERE i.object_id = t.object_id
                AND (i.name = LEFT(N'IDX_AUTO_MJ_FKEY_' + t.name + N'_' + c.name, 128)
                     OR (ic.key_ordinal = 1 AND ic.column_id = c.column_id))
          )
        ORDER BY t.name, c.name;
    \`);
    for (const [table, col] of missingFkIndexes) {
        findings.push(\`[MC4] \${appSchema}.\${table}.\${col}: missing foreign key index \${expectedFkIndexName(table, col)}\`);
    }

    if (findings.length > 0) {
        for (const f of findings) console.error(\`::error::\${f}\`);
        process.exit(1);
    }
    console.log(\`✓ Live MC1-MC4 schema consistency checks passed for \${appSchema} on \${database}\`);
}

function runSelfTest() {
    const dirty = scanMigrationFkIndexes([
        {
            file: 'V1__init.sql',
            sql: \`
                CREATE TABLE [\${defaultSchema}].[Deal] (
                    ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
                    ContactID UNIQUEIDENTIFIER NOT NULL,
                    CONSTRAINT FK_Deal_Contact FOREIGN KEY (ContactID) REFERENCES [\${defaultSchema}].[Contact](ID)
                );
            \`,
        },
    ]);
    if (dirty.missing.length !== 1 || dirty.missing[0].expectedIndex !== 'IDX_AUTO_MJ_FKEY_Deal_ContactID') {
        console.error('::error::Self-test failed: expected missing IDX_AUTO_MJ_FKEY_Deal_ContactID to be detected.');
        process.exit(1);
    }
    const clean = scanMigrationFkIndexes([
        {
            file: 'V1__init.sql',
            sql: \`
                CREATE TABLE [\${defaultSchema}].[Deal] (
                    ID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
                    ContactID UNIQUEIDENTIFIER NOT NULL,
                    CONSTRAINT FK_Deal_Contact FOREIGN KEY (ContactID) REFERENCES [\${defaultSchema}].[Contact](ID)
                );
                CREATE NONCLUSTERED INDEX IDX_AUTO_MJ_FKEY_Deal_ContactID ON [\${defaultSchema}].[Deal] ([ContactID]);
            \`,
        },
    ]);
    if (clean.missing.length !== 0) {
        console.error('::error::Self-test failed: expected clean migration set to pass.');
        process.exit(1);
    }
    console.log('✓ check-schema-consistency self-test passed');
}

function main() {
    if (process.argv.includes('--self-test')) {
        runSelfTest();
        return;
    }
    const appSchema = argValue('--schema') || ${JSON.stringify(defaultSchema)};
    const coreSchema = argValue('--core-schema') || ${JSON.stringify(defaultCoreSchema)};
    const database = argValue('--database') || process.env.DB_DATABASE;

    if (process.argv.includes('--live')) {
        if (!database) {
            console.error('::error::--live requires --database <name> or DB_DATABASE.');
            process.exit(2);
        }
        runLiveCatalogChecks({ database, appSchema, coreSchema });
        return;
    }

    const dirArg = argValue('--dir') || ${JSON.stringify(defaultMigrationsDir)};
    const absDir = resolve(dirArg);
    const files = readdirSync(absDir).filter((f) => f.endsWith('.sql')).sort();
    const migrations = files.map((file) => ({ file, sql: readFileSync(join(absDir, file), 'utf8') }));
    const { foreignKeys, missing } = scanMigrationFkIndexes(migrations);

    if (missing.length > 0) {
        for (const m of missing) {
            console.error(\`::error file=\${join(dirArg, m.file)}::Foreign key \${m.table}.\${m.column} is missing index \${m.expectedIndex}\`);
        }
        process.exit(1);
    }
    console.log(\`✓ All \${foreignKeys.size} foreign key column(s) across \${files.length} migration file(s) have IDX_AUTO_MJ_FKEY_* indexes.\`);
}

function isEntryPoint() {
    if (!process.argv[1]) return false;
    try {
        return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    main();
}
`;
}

/**
 * Scaffolds a new OpenApp repository (`mj app create`), writing:
 *   - `mj-app.json`
 *   - `.github/workflows/schema-consistency.yml`
 *   - `.github/scripts/check-schema-consistency.mjs`
 */
export function ScaffoldOpenApp(options: AppScaffoldOptions): AppScaffoldResult {
    const schemaValidation = ValidateSchemaName(options.SchemaName, {
        allowDoubleUnderscore: options.AllowDoubleUnderscoreSchema,
    });
    if (!schemaValidation.Success) {
        return {
            Success: false,
            ErrorMessage: schemaValidation.ErrorMessage,
            Files: [],
        };
    }

    const migrationsDir = options.MigrationsDirectory ?? 'migrations';
    const mjVersionRange = options.MJVersionRange ?? '>=6.0.0 <7.0.0';

    const manifestObj = {
        $schema: 'https://schema.memberjunction.org/mj-app/v1.json',
        manifestVersion: 1,
        name: options.AppName,
        displayName: options.DisplayName,
        description: options.Description,
        version: '0.1.0',
        license: 'MIT',
        publisher: {
            name: options.PublisherName,
        },
        repository: options.RepositoryUrl,
        mjVersionRange,
        schema: {
            name: options.SchemaName,
            createIfNotExists: true,
        },
        migrations: {
            directory: migrationsDir,
            engine: 'skyway',
        },
        packages: {},
    };

    const plannedFiles: Array<{ RelativePath: string; Content: string }> = [
        {
            RelativePath: 'mj-app.json',
            Content: `${JSON.stringify(manifestObj, null, 2)}\n`,
        },
        {
            RelativePath: SCHEMA_CONSISTENCY_WORKFLOW_PATH,
            Content: GenerateSchemaConsistencyWorkflow({
                SchemaName: options.SchemaName,
                MigrationsDirectory: migrationsDir,
            }),
        },
        {
            RelativePath: SCHEMA_CONSISTENCY_SCRIPT_PATH,
            Content: GenerateSchemaConsistencyScript({
                SchemaName: options.SchemaName,
                MigrationsDirectory: migrationsDir,
            }),
        },
    ];

    const files: ScaffoldedFile[] = [];
    for (const item of plannedFiles) {
        const targetPath = join(options.RepoRoot, item.RelativePath);
        const alreadyExists = existsSync(targetPath);
        if (alreadyExists && !options.Overwrite) {
            files.push({
                RelativePath: item.RelativePath,
                Status: 'skipped',
                Content: item.Content,
            });
            continue;
        }

        if (!options.DryRun) {
            mkdirSync(dirname(targetPath), { recursive: true });
            writeFileSync(targetPath, item.Content, 'utf8');
        }

        files.push({
            RelativePath: item.RelativePath,
            Status: alreadyExists ? 'updated' : 'created',
            Content: item.Content,
        });
    }

    return {
        Success: true,
        Files: files,
    };
}

/** @deprecated Use {@link ScaffoldOpenApp} instead. */
export const scaffoldOpenApp = ScaffoldOpenApp;
