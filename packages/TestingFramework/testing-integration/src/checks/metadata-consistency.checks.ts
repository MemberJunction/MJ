/**
 * metadata-consistency.checks.ts — the 'metadata-consistency' bundle (MC1–MC8): a READ-ONLY audit
 * that compares MJ's entity metadata against the PHYSICAL database catalog.
 *
 * Zero fixtures, zero mutation, zero model calls — every check is a pure SELECT against
 * `sys.*` / the MJ metadata cache. There is no lifecycle registered for this bundle because
 * there is nothing to create or tear down.
 *
 * ── TRANSPORT: SERVER (documented exception) ────────────────────────────────────────────────
 * The repo doctrine is CLIENT-FIRST (drive capability over the GraphQL wire). This bundle takes
 * the documented server-transport exception — "raw `sys.*`/`information_schema` audits" — because
 * the physical catalog has NO client surface: `sys.objects`, `sys.check_constraints`,
 * `sys.indexes`, and `sys.columns` are not reachable through `GraphQLDataProvider`. The catalog
 * suggests eventually exposing this as a typed Remote Operation so it becomes wire-testable and
 * agent-invocable; that is a separate decision and is deliberately NOT built here.
 *
 * ── PLATFORM ────────────────────────────────────────────────────────────────────────────────
 * The catalog queries are SQL Server dialect. The bundle uses `ctx.Pool` (mssql), which the
 * PostgreSQL bootstrap leaves undefined — on PG every check skips-as-pass with a logged note
 * rather than failing on a dialect it cannot speak.
 *
 * ── CHECKS ──────────────────────────────────────────────────────────────────────────────────
 *   MC1 every non-virtual entity with BaseViewGenerated=1 has its BaseView in sys.objects
 *   MC2 every entity with Allow*API + sp*Generated has its spCreate/spUpdate/spDelete present
 *   MC3 every column-level CHECK constraint that parses as a value list == its EntityFieldValue rows
 *   MC4 every FK column has its IDX_AUTO_MJ_FKEY_{Table}_{Column} index (name truncated to 128)
 *   MC5 field Sequences are gapless from 1, duplicate-free, and match base-view column order
 *   MC6 every physical core-schema field carries a non-empty Description (MS_Description)
 *   MC8 SchemaInfo coverage + casing agreement with the physical catalog
 *
 * MC7 (DriverClass ↔ ClassFactory resolution) is intentionally NOT implemented — see the bundle
 * README note in the final report; a check that cannot distinguish "unresolvable DriverClass" from
 * "provider package not loaded in this process" would be noise, not a gate.
 *
 * Each check sweeps ALL entities, aggregates offenders, and reports a COUNT plus a bounded sample.
 */
import type { EntityInfo, EntityFieldInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { RunView } from '@memberjunction/core';
import type sql from 'mssql';
import { Assert } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import type { NamedCheck, IntegrationCheckContext } from '../check';

/**
 * MC6 ratchet ceiling — the number of core-schema columns that today carry no MS_Description.
 *
 * These predate the repo's "always add sp_addextendedproperty for every new column" rule, so MC6
 * gates on "this number must not GROW" rather than "must be zero": new drift fails the build while
 * legacy debt is burned down separately. RATCHET DOWN as descriptions land — never up. Raising it
 * to make a build pass defeats the check; add the description instead.
 *
 * Measured 2026-07-19 against MJ_5_48_0 (PK/FK columns excluded — CodeGen owns those per
 * migrations/CLAUDE.md).
 */
const MC6_DEBT_CEILING = 270;

// ── shared row shapes for the catalog queries ───────────────────────────────────────────────

interface QualifiedObjectRow {
    SchemaName: string;
    ObjectName: string;
}

interface CheckConstraintRow {
    SchemaName: string;
    TableName: string;
    ColumnName: string;
    Definition: string | null;
}

interface QualifiedIndexRow {
    SchemaName: string;
    TableName: string;
    IndexName: string;
}

interface ViewColumnRow {
    SchemaName: string;
    ViewName: string;
    ColumnName: string;
    ColumnId: number;
}

interface PhysicalSchemaRow {
    SchemaName: string;
}

interface SchemaInfoRow {
    SchemaName: string;
    CanonicalSchemaName: string | null;
}

/** How many offenders to print in a failure message (the COUNT carries the rest). */
const SAMPLE_SIZE = 8;

// ── small shared helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve the mssql pool, or null when this run is on a transport that has none (PostgreSQL).
 * Callers treat null as skip-as-pass — never as a silent success on SQL Server.
 */
function poolOrSkip(ctx: IntegrationCheckContext, checkId: string): sql.ConnectionPool | null {
    if (!ctx.Pool) {
        console.log(`      → ${checkId} skipped: no mssql pool on this transport (PostgreSQL / client bootstrap)`);
        return null;
    }
    return ctx.Pool;
}

/** Run a typed catalog query against the pool. */
async function catalogQuery<T>(pool: sql.ConnectionPool, statement: string): Promise<T[]> {
    const result = await pool.request().query<T>(statement);
    return result.recordset ?? [];
}

/** Case-insensitive composite key for `schema.object` (SQL Server identifiers are case-insensitive). */
function objectKey(schemaName: string, objectName: string): string {
    return `${schemaName}.${objectName}`.toLowerCase();
}

/** Case-insensitive composite key for `schema.table.index`. */
function indexKey(schemaName: string, tableName: string, name: string): string {
    return `${schemaName}.${tableName}.${name}`.toLowerCase();
}

/** Bounded, readable offender sample appended to a failure message. */
function sample(offenders: string[]): string {
    const shown = offenders.slice(0, SAMPLE_SIZE).join(' | ');
    return offenders.length > SAMPLE_SIZE ? `${shown} | …+${offenders.length - SAMPLE_SIZE} more` : shown;
}

/** Entities backed by a real physical object (the only ones a physical audit can speak about). */
function physicalEntities(provider: IMetadataProvider): EntityInfo[] {
    return provider.Entities.filter(e => !e.VirtualEntity && !!e.SchemaName && !!e.BaseTable);
}

/** Assert zero offenders, folding the count + a sample into the message. */
function assertNoOffenders(offenders: string[], checkId: string, what: string, scanned: number): void {
    Assert(offenders.length === 0, `${checkId}: ${offenders.length} ${what}: ${sample(offenders)}`);
    console.log(`      → ${checkId}: 0 offenders across ${scanned} scanned`);
}

// ── catalog fetchers ────────────────────────────────────────────────────────────────────────

/** Every view in the database, as a case-insensitive `schema.view` set. */
async function fetchViewNames(pool: sql.ConnectionPool): Promise<Set<string>> {
    const rows = await catalogQuery<QualifiedObjectRow>(pool, `
        SELECT s.name AS SchemaName, o.name AS ObjectName
        FROM sys.objects o
        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE o.type = 'V'`);
    return new Set(rows.map(r => objectKey(r.SchemaName, r.ObjectName)));
}

/** Every stored procedure in the database, as a case-insensitive `schema.proc` set. */
async function fetchProcedureNames(pool: sql.ConnectionPool): Promise<Set<string>> {
    const rows = await catalogQuery<QualifiedObjectRow>(pool, `
        SELECT s.name AS SchemaName, o.name AS ObjectName
        FROM sys.objects o
        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE o.type IN ('P', 'PC')`);
    return new Set(rows.map(r => objectKey(r.SchemaName, r.ObjectName)));
}

/** Every named index on a user table, as a case-insensitive `schema.table.index` set. */
async function fetchIndexNames(pool: sql.ConnectionPool): Promise<Set<string>> {
    const rows = await catalogQuery<QualifiedIndexRow>(pool, `
        SELECT s.name AS SchemaName, t.name AS TableName, i.name AS IndexName
        FROM sys.indexes i
        INNER JOIN sys.tables t ON i.object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        WHERE i.name IS NOT NULL`);
    return new Set(rows.map(r => indexKey(r.SchemaName, r.TableName, r.IndexName)));
}

/** Physical view columns in ordinal order, keyed by `schema.view`. */
async function fetchViewColumnOrder(pool: sql.ConnectionPool): Promise<Map<string, string[]>> {
    const rows = await catalogQuery<ViewColumnRow>(pool, `
        SELECT s.name AS SchemaName, v.name AS ViewName, c.name AS ColumnName, c.column_id AS ColumnId
        FROM sys.views v
        INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
        INNER JOIN sys.columns c ON c.object_id = v.object_id
        ORDER BY s.name, v.name, c.column_id`);
    const map = new Map<string, string[]>();
    for (const r of rows) {
        const key = objectKey(r.SchemaName, r.ViewName);
        const list = map.get(key);
        if (list) {
            list.push(r.ColumnName);
        } else {
            map.set(key, [r.ColumnName]);
        }
    }
    return map;
}

/** Column-scoped CHECK constraints (`parent_column_id > 0`) with their definitions. */
async function fetchColumnCheckConstraints(pool: sql.ConnectionPool): Promise<CheckConstraintRow[]> {
    return catalogQuery<CheckConstraintRow>(pool, `
        SELECT s.name AS SchemaName, t.name AS TableName, c.name AS ColumnName, cc.definition AS Definition
        FROM sys.check_constraints cc
        INNER JOIN sys.tables t ON cc.parent_object_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        INNER JOIN sys.columns c ON c.object_id = t.object_id AND c.column_id = cc.parent_column_id
        WHERE cc.parent_column_id > 0`);
}

/** MS_Description extended properties on table columns, keyed by `schema.table.column`. */
async function fetchColumnDescriptions(pool: sql.ConnectionPool): Promise<Set<string>> {
    const rows = await catalogQuery<{ SchemaName: string; TableName: string; ColumnName: string }>(pool, `
        SELECT s.name AS SchemaName, t.name AS TableName, c.name AS ColumnName
        FROM sys.extended_properties ep
        INNER JOIN sys.tables t ON ep.major_id = t.object_id
        INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
        INNER JOIN sys.columns c ON c.object_id = t.object_id AND c.column_id = ep.minor_id
        WHERE ep.class = 1 AND ep.minor_id > 0 AND ep.name = 'MS_Description'
          AND ep.value IS NOT NULL AND LEN(CONVERT(nvarchar(max), ep.value)) > 0`);
    return new Set(rows.map(r => `${r.SchemaName}.${r.TableName}.${r.ColumnName}`.toLowerCase()));
}

/** Every schema that physically exists, lowercased → its physical (case-preserved) name. */
async function fetchPhysicalSchemas(pool: sql.ConnectionPool): Promise<Map<string, string>> {
    const rows = await catalogQuery<PhysicalSchemaRow>(pool, `SELECT name AS SchemaName FROM sys.schemas`);
    return new Map(rows.map(r => [r.SchemaName.toLowerCase(), r.SchemaName]));
}

// ── MC3: CHECK-constraint value-list parsing (lifted from CodeGenLib manage-metadata) ────────

/**
 * Parse a SQL Server column CHECK constraint into its value list, or null when the constraint is
 * NOT a value list (e.g. a range/`LEN()` predicate). Mirrors CodeGen's `parseCheckConstraintValues`
 * for the SQL Server dialect — CodeGen is what writes `EntityFieldValue` rows from these constraints,
 * so parsing identically is what makes the comparison meaningful.
 */
function parseCheckConstraintValues(definition: string, columnName: string): string[] | null {
    // Normalize N'literal' → 'literal' so one value regex handles both.
    const normalized = definition.replace(/(^|[=(\s])N'([^']*)'/g, "$1'$2'");
    const field = `(?:\\[${escapeForRegex(columnName)}\\]|${escapeForRegex(columnName)})`;

    const nested = new RegExp(`^\\(${field} IS NULL OR \\(${field}='[^']+'(?: OR ${field}='[^']+?')+\\)\\)$`);
    const standard = new RegExp(`^\\(${field}='[^']+'(?: OR ${field}='[^']+?')+(?: OR ${field} IS NULL)?\\)$`);
    if (!nested.test(normalized) && !standard.test(normalized)) {
        return null;
    }

    const valueRegex = new RegExp(`${field}='([^']+)'`, 'g');
    const values: string[] = [];
    let match = valueRegex.exec(normalized);
    while (match !== null) {
        if (match[1]) {
            values.push(match[1]);
        }
        match = valueRegex.exec(normalized);
    }
    return values.length > 0 ? values : null;
}

/** Escape regex metacharacters in an identifier so it can be embedded in a pattern. */
function escapeForRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Alphabetized, de-duplicated join — the canonical comparable form for a value list. */
function normalizeValueList(values: string[]): string {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b)).join(',');
}

// ── MC2 helpers ─────────────────────────────────────────────────────────────────────────────

/** The CRUD procedures an entity's metadata claims CodeGen generated, as `[label, procName]`. */
function expectedProcedures(entity: EntityInfo): Array<[string, string]> {
    const expected: Array<[string, string]> = [];
    if (entity.AllowCreateAPI && entity.spCreateGenerated) {
        expected.push(['spCreate', entity.spCreate || `spCreate${entity.BaseTableCodeName}`]);
    }
    if (entity.AllowUpdateAPI && entity.spUpdateGenerated) {
        expected.push(['spUpdate', entity.spUpdate || `spUpdate${entity.BaseTableCodeName}`]);
    }
    if (entity.AllowDeleteAPI && entity.spDeleteGenerated) {
        expected.push(['spDelete', entity.spDelete || `spDelete${entity.BaseTableCodeName}`]);
    }
    return expected;
}

// ── MC4 helpers ─────────────────────────────────────────────────────────────────────────────

/** CodeGen's FK index name for a field: `IDX_AUTO_MJ_FKEY_{Table}_{Column}`, truncated to 128. */
function foreignKeyIndexName(entity: EntityInfo, field: EntityFieldInfo): string {
    const name = `IDX_AUTO_MJ_FKEY_${entity.BaseTableCodeName}_${field.CodeName}`;
    return name.length > 128 ? name.substring(0, 128) : name;
}

/** Physical FK columns on an entity — CodeGen indexes exactly these (`RelatedEntity` non-empty). */
function indexableForeignKeys(entity: EntityInfo): EntityFieldInfo[] {
    return entity.Fields.filter(f => !!f.RelatedEntity && f.RelatedEntity.length > 0 && !f.IsVirtual);
}

// ── MC5 helpers ─────────────────────────────────────────────────────────────────────────────

/** Metadata-side sequence integrity for one entity: duplicate-free and gapless from 1. */
function sequenceIntegrityOffenses(entity: EntityInfo): string[] {
    const fields = [...entity.Fields].sort((a, b) => a.Sequence - b.Sequence);
    const offenses: string[] = [];
    const seen = new Map<number, string>();
    for (const f of fields) {
        const prior = seen.get(f.Sequence);
        if (prior) {
            offenses.push(`${entity.Name}: duplicate Sequence ${f.Sequence} (${prior}, ${f.Name})`);
        } else {
            seen.set(f.Sequence, f.Name);
        }
    }
    if (offenses.length > 0) {
        return offenses; // gap analysis is meaningless while duplicates exist
    }
    fields.forEach((f, i) => {
        if (f.Sequence !== i + 1) {
            offenses.push(`${entity.Name}: expected Sequence ${i + 1} but found ${f.Sequence} for ${f.Name}`);
        }
    });
    return offenses;
}

/** Positional agreement between metadata Sequence order and the base view's physical column order. */
function viewOrderOffenses(entity: EntityInfo, viewColumns: string[]): string[] {
    const fields = [...entity.Fields].sort((a, b) => a.Sequence - b.Sequence);
    const offenses: string[] = [];
    for (let i = 0; i < fields.length; i++) {
        const physical = viewColumns[i];
        if (physical === undefined) {
            offenses.push(`${entity.Name}: metadata has ${fields.length} fields but ${entity.BaseView} has ${viewColumns.length} columns`);
            break;
        }
        if (physical.toLowerCase() !== fields[i].Name.toLowerCase()) {
            offenses.push(`${entity.Name}: position ${i + 1} expected ${fields[i].Name} but view has ${physical}`);
        }
    }
    return offenses;
}

// ── MC6 helpers ─────────────────────────────────────────────────────────────────────────────

/**
 * Fields a physical description audit can legitimately demand. Four exclusions, each matching a
 * documented rule rather than a convenience:
 *   - virtual/computed fields have no base-table column to carry an extended property;
 *   - `__mj_` system columns are added by CodeGen, not by an authored migration;
 *   - PRIMARY KEYS and FOREIGN KEYS are explicitly exempted by the repo's migration rule
 *     ("always add sp_addextendedproperty for every new column **except primary keys and foreign
 *     keys which CodeGen handles**" — migrations/CLAUDE.md). Demanding descriptions on them made
 *     this check report ~1000 "offenders" that are in fact correct-by-policy, which would have
 *     forced the gate to be ignored — the classic way an audit becomes decorative.
 */
function describableFields(entity: EntityInfo): EntityFieldInfo[] {
    return entity.Fields.filter(f =>
        !f.IsVirtual
        && !f.Name.startsWith('__mj_')
        && !f.IsPrimaryKey
        && !(f.RelatedEntity && f.RelatedEntity.length > 0));
}

// ── the checks ──────────────────────────────────────────────────────────────────────────────

const MC1: NamedCheck = {
    Id: 'metadata-consistency.MC1',
    Name: 'MC1: every generated BaseView exists in sys.objects',
    Fn: async (ctx: IntegrationCheckContext) => {
        const pool = poolOrSkip(ctx, 'MC1');
        if (!pool) {
            return;
        }
        const views = await fetchViewNames(pool);
        const candidates = ctx.Provider.Entities.filter(e => !e.VirtualEntity && e.BaseViewGenerated && !!e.BaseView && !!e.SchemaName);
        const offenders = candidates
            .filter(e => !views.has(objectKey(e.SchemaName, e.BaseView)))
            .map(e => `${e.Name} → ${e.SchemaName}.${e.BaseView}`);
        assertNoOffenders(offenders, 'MC1', 'generated base views missing from sys.objects', candidates.length);
    }
};

const MC2: NamedCheck = {
    Id: 'metadata-consistency.MC2',
    Name: 'MC2: every generated spCreate/spUpdate/spDelete exists in sys.objects',
    Fn: async (ctx: IntegrationCheckContext) => {
        const pool = poolOrSkip(ctx, 'MC2');
        if (!pool) {
            return;
        }
        const procs = await fetchProcedureNames(pool);
        const offenders: string[] = [];
        let scanned = 0;
        for (const entity of physicalEntities(ctx.Provider)) {
            for (const [label, procName] of expectedProcedures(entity)) {
                scanned++;
                if (!procs.has(objectKey(entity.SchemaName, procName))) {
                    offenders.push(`${entity.Name} ${label} → ${entity.SchemaName}.${procName}`);
                }
            }
        }
        assertNoOffenders(offenders, 'MC2', 'generated CRUD procedures missing from sys.objects', scanned);
    }
};

const MC3: NamedCheck = {
    Id: 'metadata-consistency.MC3',
    Name: 'MC3: CHECK-constraint value lists match their EntityFieldValue rows',
    Fn: async (ctx: IntegrationCheckContext) => {
        const pool = poolOrSkip(ctx, 'MC3');
        if (!pool) {
            return;
        }
        const constraints = await fetchColumnCheckConstraints(pool);
        const byTable = new Map<string, EntityInfo>();
        for (const e of physicalEntities(ctx.Provider)) {
            byTable.set(objectKey(e.SchemaName, e.BaseTable), e);
        }

        const offenders: string[] = [];
        let compared = 0;
        for (const row of constraints) {
            if (!row.Definition) {
                continue;
            }
            const entity = byTable.get(objectKey(row.SchemaName, row.TableName));
            const field = entity?.FieldByName(row.ColumnName);
            if (!entity || !field) {
                continue; // table/column outside MJ metadata — not this audit's business
            }
            const physical = parseCheckConstraintValues(row.Definition, row.ColumnName);
            if (!physical) {
                continue; // not a value-list constraint (range/length/etc.)
            }
            compared++;
            const expected = normalizeValueList(physical);
            const actual = normalizeValueList(field.EntityFieldValues.map(v => v.Value));
            if (expected !== actual) {
                offenders.push(`${entity.Name}.${field.Name}: CHECK=[${expected}] metadata=[${actual}]`);
            }
        }
        assertNoOffenders(offenders, 'MC3', 'value-list CHECK constraints out of sync with EntityFieldValue', compared);
    }
};

const MC4: NamedCheck = {
    Id: 'metadata-consistency.MC4',
    Name: 'MC4: every FK column has its IDX_AUTO_MJ_FKEY index',
    Fn: async (ctx: IntegrationCheckContext) => {
        const pool = poolOrSkip(ctx, 'MC4');
        if (!pool) {
            return;
        }
        const indexes = await fetchIndexNames(pool);
        const offenders: string[] = [];
        let scanned = 0;
        for (const entity of physicalEntities(ctx.Provider)) {
            for (const field of indexableForeignKeys(entity)) {
                scanned++;
                const name = foreignKeyIndexName(entity, field);
                if (!indexes.has(indexKey(entity.SchemaName, entity.BaseTable, name))) {
                    offenders.push(`${entity.Name}.${field.Name} → ${name}`);
                }
            }
        }
        assertNoOffenders(offenders, 'MC4', 'FK columns missing their IDX_AUTO_MJ_FKEY index', scanned);
    }
};

const MC5: NamedCheck = {
    Id: 'metadata-consistency.MC5',
    Name: 'MC5: field sequences are gapless from 1 and match base-view column order',
    Fn: async (ctx: IntegrationCheckContext) => {
        const pool = poolOrSkip(ctx, 'MC5');
        if (!pool) {
            return;
        }
        const viewColumns = await fetchViewColumnOrder(pool);
        const offenders: string[] = [];
        let scanned = 0;
        for (const entity of ctx.Provider.Entities) {
            if (entity.Fields.length === 0) {
                continue;
            }
            scanned++;
            const sequenceOffenses = sequenceIntegrityOffenses(entity);
            offenders.push(...sequenceOffenses);
            if (sequenceOffenses.length > 0 || entity.VirtualEntity || !entity.BaseView || !entity.SchemaName) {
                continue; // order comparison is only meaningful on a sound sequence + a real view
            }
            const columns = viewColumns.get(objectKey(entity.SchemaName, entity.BaseView));
            if (columns) {
                offenders.push(...viewOrderOffenses(entity, columns));
            }
        }
        assertNoOffenders(offenders, 'MC5', 'field-sequence / base-view column-order offenses', scanned);
    }
};

const MC6: NamedCheck = {
    Id: 'metadata-consistency.MC6',
    Name: 'MC6: every core-schema physical field carries an MS_Description',
    Fn: async (ctx: IntegrationCheckContext) => {
        const pool = poolOrSkip(ctx, 'MC6');
        if (!pool) {
            return;
        }
        // Scoped to the CORE schema: MJ owns those migrations and mandates sp_addextendedproperty
        // for every new column, so this is a green-able gate. Non-core (customer/app) schemas are
        // reported as coverage information, never gated on — MJ does not author their migrations.
        const coreSchema = (ctx.Schema ?? '__mj').toLowerCase();
        const described = await fetchColumnDescriptions(pool);
        const offenders: string[] = [];
        let scanned = 0;
        let nonCoreMissing = 0;
        for (const entity of physicalEntities(ctx.Provider)) {
            const isCore = entity.SchemaName.toLowerCase() === coreSchema;
            for (const field of describableFields(entity)) {
                const hasMetadataDescription = !!field.Description && field.Description.trim().length > 0;
                const hasPhysicalDescription = described.has(`${entity.SchemaName}.${entity.BaseTable}.${field.Name}`.toLowerCase());
                if (!isCore) {
                    if (!hasMetadataDescription && !hasPhysicalDescription) {
                        nonCoreMissing++;
                    }
                    continue;
                }
                scanned++;
                if (!hasMetadataDescription && !hasPhysicalDescription) {
                    offenders.push(`${entity.Name}.${field.Name}`);
                }
            }
        }
        console.log(`      → MC6: ${nonCoreMissing} undescribed fields outside '${coreSchema}' (informational, not gated)`);
        console.log(`      → MC6: ${offenders.length}/${scanned} core-schema fields undescribed (ratchet ceiling ${MC6_DEBT_CEILING})`);

        // RATCHET, not an absolute gate. 270 core columns predate the "describe every new column"
        // migration rule, so demanding zero would make this permanently red — and a permanently red
        // check is one everybody learns to ignore. Instead we lock TODAY's count as a ceiling:
        // adding a new undescribed column fails the build, while the existing debt is burned down
        // separately. Lower MC6_DEBT_CEILING as descriptions land; it must never be raised.
        Assert(offenders.length <= MC6_DEBT_CEILING,
            `MC6: undescribed core-schema fields ROSE to ${offenders.length} (ceiling ${MC6_DEBT_CEILING}). ` +
            `New columns must carry sp_addextendedproperty. Newest offenders: ${offenders.slice(0, 8).join(' | ')}`);
    }
};

const MC8: NamedCheck = {
    Id: 'metadata-consistency.MC8',
    Name: 'MC8: SchemaInfo covers every entity schema with casing-correct names',
    Fn: async (ctx: IntegrationCheckContext) => {
        const pool = poolOrSkip(ctx, 'MC8');
        if (!pool) {
            return;
        }
        const physical = await fetchPhysicalSchemas(pool);
        const registered = await loadSchemaInfo(ctx.User);
        const offenders: string[] = [];
        const schemas = [...new Set(physicalEntities(ctx.Provider).map(e => e.SchemaName))];
        for (const schemaName of schemas) {
            offenders.push(...schemaOffenses(schemaName, physical, registered));
        }
        assertNoOffenders(offenders, 'MC8', 'entity schemas with SchemaInfo coverage/casing problems', schemas.length);
    }
};

/** `MJ: Schema Info` rows keyed by lowercased SchemaName. */
async function loadSchemaInfo(user: UserInfo): Promise<Map<string, SchemaInfoRow>> {
    const result = await new RunView().RunView<SchemaInfoRow>(
        { EntityName: 'MJ: Schema Info', Fields: ['SchemaName', 'CanonicalSchemaName'], ResultType: 'simple' }, user,
    );
    Assert(result.Success, `MC8: could not read MJ: Schema Info — ${result.ErrorMessage}`);
    return new Map((result.Results ?? []).map(r => [r.SchemaName.toLowerCase(), r]));
}

/**
 * The three SchemaInfo invariants for one entity schema:
 *  1. the schema physically exists;
 *  2. a `MJ: Schema Info` row covers it;
 *  3. `CanonicalSchemaName`, WHEN SET, names the same schema (casing override only — never a
 *     different schema). A NULL CanonicalSchemaName is legitimate: it means "fall back to
 *     SchemaName", which is every SQL Server install and the core schema, so presence is NOT
 *     asserted (asserting it would be vacuously red on SQL Server).
 */
function schemaOffenses(
    schemaName: string, physical: Map<string, string>, registered: Map<string, SchemaInfoRow>
): string[] {
    const key = schemaName.toLowerCase();
    const physicalName = physical.get(key);
    if (!physicalName) {
        return [`${schemaName}: referenced by entity metadata but absent from sys.schemas`];
    }
    const offenses: string[] = [];
    if (physicalName !== schemaName) {
        offenses.push(`${schemaName}: metadata casing differs from physical '${physicalName}'`);
    }
    const info = registered.get(key);
    if (!info) {
        offenses.push(`${schemaName}: no MJ: Schema Info row`);
        return offenses;
    }
    const canonical = info.CanonicalSchemaName;
    if (canonical && canonical.toLowerCase() !== key) {
        offenses.push(`${schemaName}: CanonicalSchemaName '${canonical}' names a different schema`);
    }
    return offenses;
}

export const MetadataConsistencyChecks: NamedCheck[] = [MC1, MC2, MC3, MC4, MC5, MC6, MC8];

for (const check of MetadataConsistencyChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
