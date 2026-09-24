#!/usr/bin/env node
/**
 * BigSchemaDemo SQL generator.
 *
 * Emits drop / schema / table / FK / seed scripts for a MemberJunction-shaped
 * brownfield: many schemas, 100–150 tables each, FKs inside a schema and a
 * handful of FKs across schemas. Deterministic. No npm dependencies.
 *
 *   node generate.mjs                  # standard (24 × 120)
 *   node generate.mjs --profile smoke  # 3 × 12  (committed under sql/smoke/)
 *   node generate.mjs --profile large  # 36 × 150
 *
 * Output lands in ./sql/<profile>/ so recreate.sh can apply it with sqlcmd.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const ALL_DOMAINS = [
  'crm', 'billing', 'inventory', 'fulfillment', 'hr', 'payroll',
  'learning', 'events', 'marketing', 'support', 'analytics', 'identity',
  'catalog', 'pricing', 'contracts', 'compliance', 'facilities', 'assets',
  'projects', 'quality', 'logistics', 'partners', 'content', 'notifications',
  'treasury', 'claims', 'underwriting', 'actuarial', 'servicing', 'collections',
  'onboarding', 'scheduling', 'fleet', 'warehouse', 'returns', 'warranty',
];

const STATUSES = ['Active', 'Pending', 'Closed', 'Hold'];

function parseArgs(argv) {
  const args = { profile: 'standard', out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--profile' && argv[i + 1]) {
      args.profile = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--out' && argv[i + 1]) {
      args.out = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

function loadProfile(name) {
  const file = path.join(HERE, 'profiles', `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Unknown profile "${name}". Expected ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function schemaName(domain) {
  return `bsd_${domain}`;
}

function bracket(ident) {
  return `[${ident.replace(/]/g, ']]')}]`;
}

function qn(schema, table) {
  return `${bracket(schema)}.${bracket(table)}`;
}

/**
 * Valid UUID v4-shaped identifier that is a pure function of
 * (schemaIndex, tableIndex, rowIndex). Same generator + profile = same IDs,
 * so the demo can be dropped and recreated without leftover FKs.
 */
function deterministicId(schemaIndex, tableIndex, rowIndex) {
  const ss = schemaIndex.toString(16).padStart(2, '0');
  const ttt = tableIndex.toString(16).padStart(3, '0');
  const rrrr = rowIndex.toString(16).padStart(4, '0');
  return `B5D00000-0000-4000-80${ss}-00000${ttt}${rrrr}`.toUpperCase();
}

function planTableMix(tableCount, hasBridge) {
  const lookups = Math.min(8, Math.max(2, Math.floor(tableCount * 0.07)));
  const bridge = hasBridge ? 1 : 0;
  const reserved = 1 + lookups + bridge;
  const rest = Math.max(0, tableCount - reserved);
  const children = Math.max(1, Math.floor(rest * 0.70));
  let grand = Math.floor(rest * 0.18);
  let xref = rest - children - grand;
  if (xref < 1 && rest - children >= 1) {
    xref = 1;
    grand = rest - children - xref;
  }
  const used = 1 + lookups + children + grand + xref + bridge;
  const extraChildren = Math.max(0, tableCount - used);
  return {
    lookups,
    children: children + extraChildren,
    grand: Math.max(0, grand),
    xref: Math.max(0, xref),
    bridge,
  };
}

function buildCatalog(profile) {
  const domains = ALL_DOMAINS.slice(0, profile.schemaCount);
  return domains.map((domain, schemaIndex) => {
    const schema = schemaName(domain);
    const hasBridge = schemaIndex > 0;
    const mix = planTableMix(profile.tablesPerSchema, hasBridge);
    const tables = [];
    let tableIndex = 0;

    const push = (spec) => {
      tables.push({ ...spec, tableIndex, schemaIndex, schema, domain });
      tableIndex += 1;
    };

    const prefix = domain.charAt(0).toUpperCase() + domain.slice(1);
    push({ kind: 'hub', name: `${prefix}Hub` });
    for (let i = 1; i <= mix.lookups; i += 1) {
      push({ kind: 'lookup', name: `${prefix}Lookup_${String(i).padStart(2, '0')}` });
    }
    for (let i = 1; i <= mix.children; i += 1) {
      push({ kind: 'child', name: `${prefix}Child_${String(i).padStart(3, '0')}` });
    }
    for (let i = 1; i <= mix.grand; i += 1) {
      push({ kind: 'grandchild', name: `${prefix}Grandchild_${String(i).padStart(3, '0')}` });
    }
    for (let i = 1; i <= mix.xref; i += 1) {
      push({ kind: 'xref', name: `${prefix}XRef_${String(i).padStart(2, '0')}` });
    }
    if (mix.bridge === 1) {
      const remoteDomain = domains[schemaIndex - 1];
      const remotePrefix = remoteDomain.charAt(0).toUpperCase() + remoteDomain.slice(1);
      push({
        kind: 'bridge',
        name: `${prefix}Bridge`,
        remoteSchema: schemaName(remoteDomain),
        remoteDomain,
        remoteHubName: `${remotePrefix}Hub`,
      });
    }

    if (tables.length !== profile.tablesPerSchema) {
      throw new Error(
        `${schema}: planned ${tables.length} tables, profile asked for ${profile.tablesPerSchema}`,
      );
    }
    return { schema, domain, schemaIndex, tables, previousSchema: hasBridge ? schemaName(domains[schemaIndex - 1]) : null };
  });
}

function emitHeader(title) {
  return [
    '/*',
    ` * BigSchemaDemo — ${title}`,
    ' * AUTO-GENERATED by generate.mjs. Do not edit by hand.',
    ' * Regenerated with: node Demos/BigSchemaDemo/generate.mjs --profile <name>',
    ' */',
    'SET NOCOUNT ON;',
    'SET XACT_ABORT ON;',
    '',
  ].join('\n');
}

function emitDrop(catalog) {
  const lines = [emitHeader('drop demo schemas')];
  // Drop in reverse so cross-schema FKs from later schemas release first.
  for (const entry of [...catalog].reverse()) {
    lines.push(`IF EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'${entry.schema}')`);
    lines.push('BEGIN');
    lines.push(`    DECLARE @sql_${entry.schemaIndex} NVARCHAR(MAX) = N'';`);
    lines.push(`    SELECT @sql_${entry.schemaIndex} = @sql_${entry.schemaIndex} + N'ALTER TABLE '`);
    lines.push(`        + QUOTENAME(OBJECT_SCHEMA_NAME(parent_object_id)) + N'.' + QUOTENAME(OBJECT_NAME(parent_object_id))`);
    lines.push(`        + N' DROP CONSTRAINT ' + QUOTENAME(name) + N';'`);
    lines.push(`    FROM sys.foreign_keys`);
    lines.push(`    WHERE OBJECT_SCHEMA_NAME(parent_object_id) = N'${entry.schema}'`);
    lines.push(`       OR OBJECT_SCHEMA_NAME(referenced_object_id) = N'${entry.schema}';`);
    lines.push(`    SELECT @sql_${entry.schemaIndex} = @sql_${entry.schemaIndex} + N'DROP PROCEDURE ' + QUOTENAME(s.name) + N'.' + QUOTENAME(p.name) + N';'`);
    lines.push(`    FROM sys.procedures p INNER JOIN sys.schemas s ON s.schema_id = p.schema_id WHERE s.name = N'${entry.schema}';`);
    lines.push(`    SELECT @sql_${entry.schemaIndex} = @sql_${entry.schemaIndex} + N'DROP VIEW ' + QUOTENAME(s.name) + N'.' + QUOTENAME(v.name) + N';'`);
    lines.push(`    FROM sys.views v INNER JOIN sys.schemas s ON s.schema_id = v.schema_id WHERE s.name = N'${entry.schema}';`);
    lines.push(`    SELECT @sql_${entry.schemaIndex} = @sql_${entry.schemaIndex} + N'DROP FUNCTION ' + QUOTENAME(s.name) + N'.' + QUOTENAME(o.name) + N';'`);
    lines.push(`    FROM sys.objects o INNER JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE s.name = N'${entry.schema}' AND o.type IN ('FN','IF','TF');`);
    lines.push(`    IF LEN(@sql_${entry.schemaIndex}) > 0 EXEC sys.sp_executesql @sql_${entry.schemaIndex};`);
    lines.push(`    DECLARE @tbl_${entry.schemaIndex} NVARCHAR(MAX) = N'';`);
    lines.push(`    SELECT @tbl_${entry.schemaIndex} = @tbl_${entry.schemaIndex} + N'DROP TABLE ' + QUOTENAME(s.name) + N'.' + QUOTENAME(t.name) + N';'`);
    lines.push(`    FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id = t.schema_id`);
    lines.push(`    WHERE s.name = N'${entry.schema}';`);
    lines.push(`    IF LEN(@tbl_${entry.schemaIndex}) > 0 EXEC sys.sp_executesql @tbl_${entry.schemaIndex};`);
    lines.push(`    DROP SCHEMA ${bracket(entry.schema)};`);
    lines.push('END;');
    lines.push('GO');
    lines.push('');
  }
  return lines.join('\n');
}

function emitSchemas(catalog) {
  const lines = [emitHeader('create demo schemas')];
  for (const entry of catalog) {
    lines.push(`IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'${entry.schema}')`);
    lines.push(`    EXEC('CREATE SCHEMA ${bracket(entry.schema)}');`);
    lines.push('GO');
  }
  return lines.join('\n');
}

function tableColumns(table) {
  const cols = [
    '    ID UNIQUEIDENTIFIER NOT NULL',
    '    ,Name NVARCHAR(200) NOT NULL',
    '    ,Code NVARCHAR(40) NOT NULL',
    '    ,Status NVARCHAR(40) NOT NULL',
    '    ,Amount DECIMAL(18, 2) NOT NULL CONSTRAINT ' + bracket(`DF_${table.schema}_${table.name}_Amount`) + ' DEFAULT (0)',
    '    ,Notes NVARCHAR(400) NULL',
  ];
  if (table.kind === 'child' || table.kind === 'xref') {
    cols.push('    ,HubID UNIQUEIDENTIFIER NOT NULL');
    cols.push('    ,LookupID UNIQUEIDENTIFIER NULL');
  }
  if (table.kind === 'grandchild') {
    cols.push('    ,ChildID UNIQUEIDENTIFIER NOT NULL');
  }
  if (table.kind === 'bridge') {
    cols.push('    ,LocalHubID UNIQUEIDENTIFIER NOT NULL');
    cols.push('    ,RemoteHubID UNIQUEIDENTIFIER NOT NULL');
  }
  return cols;
}

function emitTables(catalog) {
  const lines = [emitHeader('create demo tables')];
  for (const entry of catalog) {
    for (const table of entry.tables) {
      lines.push(`IF OBJECT_ID(N'${entry.schema}.${table.name}', N'U') IS NULL`);
      lines.push(`CREATE TABLE ${qn(entry.schema, table.name)} (`);
      lines.push(tableColumns(table).join('\n'));
      lines.push(`    ,CONSTRAINT ${bracket(`PK_${entry.schema}_${table.name}`)} PRIMARY KEY CLUSTERED (ID)`);
      lines.push(');');
      lines.push('GO');
      lines.push('');
    }
  }
  return lines.join('\n');
}

function firstOfKind(entry, kind) {
  return entry.tables.find((t) => t.kind === kind);
}

function emitForeignKeys(catalog) {
  const lines = [emitHeader('create demo foreign keys')];
  for (const entry of catalog) {
    const hub = firstOfKind(entry, 'hub');
    const lookup = firstOfKind(entry, 'lookup');
    const child = firstOfKind(entry, 'child');
    for (const table of entry.tables) {
      if (table.kind === 'child' || table.kind === 'xref') {
        lines.push(`ALTER TABLE ${qn(entry.schema, table.name)} ADD CONSTRAINT ${bracket(`FK_${entry.schema}_${table.name}_Hub`)}`);
        lines.push(`    FOREIGN KEY (HubID) REFERENCES ${qn(entry.schema, hub.name)} (ID);`);
        lines.push('GO');
        if (lookup) {
          lines.push(`ALTER TABLE ${qn(entry.schema, table.name)} ADD CONSTRAINT ${bracket(`FK_${entry.schema}_${table.name}_Lookup`)}`);
          lines.push(`    FOREIGN KEY (LookupID) REFERENCES ${qn(entry.schema, lookup.name)} (ID);`);
          lines.push('GO');
        }
      }
      if (table.kind === 'grandchild' && child) {
        lines.push(`ALTER TABLE ${qn(entry.schema, table.name)} ADD CONSTRAINT ${bracket(`FK_${entry.schema}_${table.name}_Child`)}`);
        lines.push(`    FOREIGN KEY (ChildID) REFERENCES ${qn(entry.schema, child.name)} (ID);`);
        lines.push('GO');
      }
      if (table.kind === 'bridge') {
        lines.push(`ALTER TABLE ${qn(entry.schema, table.name)} ADD CONSTRAINT ${bracket(`FK_${entry.schema}_${table.name}_LocalHub`)}`);
        lines.push(`    FOREIGN KEY (LocalHubID) REFERENCES ${qn(entry.schema, hub.name)} (ID);`);
        lines.push('GO');
        lines.push(`ALTER TABLE ${qn(entry.schema, table.name)} ADD CONSTRAINT ${bracket(`FK_${entry.schema}_${table.name}_RemoteHub`)}`);
        lines.push(`    FOREIGN KEY (RemoteHubID) REFERENCES ${qn(table.remoteSchema, table.remoteHubName)} (ID);`);
        lines.push('GO');
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function sqlStr(value) {
  return `N'${String(value).replace(/'/g, "''")}'`;
}

function insertRows(table, rows) {
  if (rows.length === 0) return '';
  const colSet = new Set(['ID', 'Name', 'Code', 'Status', 'Amount', 'Notes']);
  if (table.kind === 'child' || table.kind === 'xref') {
    colSet.add('HubID');
    colSet.add('LookupID');
  }
  if (table.kind === 'grandchild') colSet.add('ChildID');
  if (table.kind === 'bridge') {
    colSet.add('LocalHubID');
    colSet.add('RemoteHubID');
  }
  const cols = [...colSet];
  const values = rows.map((row) => {
    const cells = cols.map((col) => {
      const value = row[col];
      if (value == null) return 'NULL';
      if (typeof value === 'number') return String(value);
      if (col === 'ID' || col.endsWith('ID')) return `'${value}'`;
      return sqlStr(value);
    });
    return `    (${cells.join(', ')})`;
  });
  return [
    `INSERT INTO ${qn(table.schema, table.name)} (${cols.map(bracket).join(', ')})`,
    'VALUES',
    values.join(',\n') + ';',
    'GO',
    '',
  ].join('\n');
}

function emitSeed(catalog, profile) {
  const lines = [emitHeader('seed logical demo data')];
  const seed = profile.seed;
  for (const entry of catalog) {
    const hub = firstOfKind(entry, 'hub');
    const lookup = firstOfKind(entry, 'lookup');
    const child = firstOfKind(entry, 'child');
    const previous = catalog[entry.schemaIndex - 1];

    for (const table of entry.tables) {
      const rows = [];
      const countFor = {
        hub: seed.hubRows,
        lookup: seed.lookupRows,
        child: seed.childRows,
        grandchild: seed.grandchildRows,
        xref: seed.xrefRows,
        bridge: seed.bridgeRows,
      }[table.kind];

      for (let r = 1; r <= countFor; r += 1) {
        const row = {
          ID: deterministicId(entry.schemaIndex, table.tableIndex, r),
          Name: `${entry.domain} ${table.name} ${r}`,
          Code: `${entry.domain.slice(0, 3).toUpperCase()}-${table.name}-${r}`,
          Status: STATUSES[(r - 1) % STATUSES.length],
          Amount: (r * 10) + (table.tableIndex % 7),
          Notes: `${table.kind} row ${r} in ${entry.schema}`,
        };
        if (table.kind === 'child' || table.kind === 'xref') {
          const hubRow = ((r - 1) % seed.hubRows) + 1;
          const lookupRow = ((r - 1) % seed.lookupRows) + 1;
          row.HubID = deterministicId(entry.schemaIndex, hub.tableIndex, hubRow);
          row.LookupID = lookup
            ? deterministicId(entry.schemaIndex, lookup.tableIndex, lookupRow)
            : null;
        }
        if (table.kind === 'grandchild') {
          const childRow = ((r - 1) % seed.childRows) + 1;
          row.ChildID = deterministicId(entry.schemaIndex, child.tableIndex, childRow);
        }
        if (table.kind === 'bridge' && previous) {
          const localRow = ((r - 1) % seed.hubRows) + 1;
          const remoteRow = (r % seed.hubRows) + 1;
          row.LocalHubID = deterministicId(entry.schemaIndex, hub.tableIndex, localRow);
          row.RemoteHubID = deterministicId(previous.schemaIndex, 0, remoteRow);
        }
        rows.push(row);
      }
      lines.push(insertRows(table, rows));
    }
  }
  return lines.join('\n');
}

function writeProfile(profile, outOverride) {
  const catalog = buildCatalog(profile);
  const outDir = outOverride
    ? path.resolve(outOverride)
    : path.join(HERE, 'sql', profile.name);
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    '00_drop.sql': emitDrop(catalog),
    '01_schemas.sql': emitSchemas(catalog),
    '02_tables.sql': emitTables(catalog),
    '03_fks.sql': emitForeignKeys(catalog),
    '04_seed.sql': emitSeed(catalog, profile),
  };
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(outDir, name), body.endsWith('\n') ? body : `${body}\n`);
  }
  const summary = {
    profile: profile.name,
    schemas: catalog.length,
    tables: catalog.reduce((n, e) => n + e.tables.length, 0),
    foreignKeysApprox: catalog.reduce((n, e) => {
      return n + e.tables.filter((t) => t.kind === 'child' || t.kind === 'xref').length * 2
        + e.tables.filter((t) => t.kind === 'grandchild').length
        + e.tables.filter((t) => t.kind === 'bridge').length * 2;
    }, 0),
    domains: catalog.map((e) => e.schema),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return { summary, outDir };
}

const args = parseArgs(process.argv.slice(2));
const profile = loadProfile(args.profile);
const { summary, outDir } = writeProfile(profile, args.out);
console.log(`BigSchemaDemo generated profile=${summary.profile} schemas=${summary.schemas} tables=${summary.tables} fks~=${summary.foreignKeysApprox}`);
console.log(`  output: ${outDir}`);
