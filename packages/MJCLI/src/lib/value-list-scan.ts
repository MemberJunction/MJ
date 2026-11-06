/**
 * The scan behind `mj doctor value-lists`: rows whose `List` field holds a value outside the
 * field's value list.
 *
 * Since 6.1, `BaseEntity.Validate()` refuses a save when a field whose `ValueListType` is `List`
 * holds a value that is not one of its `EntityFieldValue` rows. On 5.x only the database decided,
 * and not every such field has a CHECK constraint, so a database upgraded from 5.x can hold rows
 * that saved fine before and are refused on their next save. This scan finds them in advance.
 *
 * Membership is decided by `EntityFieldInfo.ValueIsPermittedByValueList`, the same rule the save
 * path applies, and only fields the save path validates are read (see {@link ValueListFields}), so
 * the scan reports what a save would refuse.
 */
import { EntityFieldValueListType, type DatabaseProviderBase, type EntityFieldInfo, type EntityInfo, type UserInfo } from '@memberjunction/core';
import type { MJEntityFieldEntity } from '@memberjunction/core-entities';

/** The provider surface the scan reads through: dialect quoting and raw SQL. */
export type ValueListScanProvider = Pick<DatabaseProviderBase, 'ExecuteSQL' | 'QuoteIdentifier' | 'QuoteSchemaAndView'>;

/** The provider surface `--fix` writes through. */
export type ValueListFixProvider = Pick<DatabaseProviderBase, 'GetEntityObject'>;

/** How many distinct offending values a report lists per field. */
export const MAX_LISTED_VALUES = 20;

/** One field's result. Only fields with offending rows, or that could not be read, are reported. */
export interface ValueListFieldReport {
    Entity: string;
    Field: string;
    /** Rows whose value is outside the list. */
    RowsOutsideList: number;
    /** How many distinct values are outside the list. */
    DistinctValuesOutsideList: number;
    /** Up to {@link MAX_LISTED_VALUES} of those values, most frequent first. */
    Values: Array<{ Value: string; Rows: number }>;
    /** Whether the column carries a CHECK constraint; null when the catalog could not be read. */
    HasCheckConstraint: boolean | null;
    /** Set when the field's table could not be read. */
    Error?: string;
}

/** The whole scan. */
export interface ValueListScanReport {
    FieldsScanned: number;
    /** `List` fields skipped because they have no values (a separate, already-reported metadata fault). */
    FieldsWithoutValues: number;
    Findings: ValueListFieldReport[];
}

/** One `Entity.Field` named for `--fix`. */
export interface ValueListFixTarget {
    Entity: string;
    Field: string;
}

/** The result of one `--fix` target. */
export interface ValueListFixResult extends ValueListFixTarget {
    Fixed: boolean;
    Message: string;
}

/** A distinct value and how many rows hold it. */
interface DistinctValueRow {
    Value: string | number | Date | null;
    ValueCount: number;
}

/** A column that carries a CHECK constraint, as the catalog names it. */
interface CheckColumnRow {
    SchemaName: string;
    TableName: string;
    ColumnName: string;
}

const columnKey = (schema: string, table: string, column: string): string => `${schema}.${table}.${column}`.toLowerCase();

/**
 * The `List` fields the scan reads: columns of entities that have a base table, that the save path
 * validates. `EntityField.Validate()` skips a field that is read-only (`AllowUpdateAPI` off, the
 * primary key, a special date field), virtual, or auto-increment (`SkipValidation`), so a value
 * outside the list there never fails a save and is not reported.
 */
export function ValueListFields(entities: readonly EntityInfo[], entityNames?: readonly string[]): Array<{ Entity: EntityInfo; Field: EntityFieldInfo }> {
    const wanted = entityNames?.length ? new Set(entityNames.map((n) => n.trim().toLowerCase())) : null;
    const fields: Array<{ Entity: EntityInfo; Field: EntityFieldInfo }> = [];
    for (const entity of entities) {
        if (wanted && !wanted.has(entity.Name.toLowerCase())) continue;
        if (!entity.BaseTable || !entity.SchemaName) continue;
        for (const field of entity.Fields) {
            if (field.ValueListTypeEnum !== EntityFieldValueListType.List) continue;
            if (field.ReadOnly || field.SkipValidation) continue;
            fields.push({ Entity: entity, Field: field });
        }
    }
    return fields;
}

/** The names in `entityNames` that match no entity (case-insensitive), as given. */
export function UnknownEntityNames(entities: readonly EntityInfo[], entityNames?: readonly string[]): string[] {
    if (!entityNames?.length) return [];
    const known = new Set(entities.map((e) => e.Name.toLowerCase()));
    return entityNames.filter((n) => !known.has(n.trim().toLowerCase()));
}

/** One `SELECT <col>, COUNT(*) … GROUP BY <col>` over the field's base table, in the provider's dialect. */
export function DistinctValuesSQL(provider: ValueListScanProvider, entity: EntityInfo, field: EntityFieldInfo): string {
    const column = provider.QuoteIdentifier(field.Name);
    return (
        `SELECT ${column} AS ${provider.QuoteIdentifier('Value')}, COUNT(*) AS ${provider.QuoteIdentifier('ValueCount')} ` +
        `FROM ${provider.QuoteSchemaAndView(entity.SchemaName, entity.BaseTable)} ` +
        `WHERE ${column} IS NOT NULL GROUP BY ${column}`
    );
}

/**
 * The columns that carry a CHECK constraint, read from INFORMATION_SCHEMA (the same views on SQL
 * Server and PostgreSQL). Null when the catalog cannot be read, so the report says "unknown"
 * rather than "no".
 *
 * An empty result is also treated as unreadable. PostgreSQL's `constraint_column_usage` lists only
 * tables the connected role owns, so a role with only `SELECT` gets no rows rather than an error,
 * and every MJ database has CHECK constraints on its own core tables, so "none at all" means the
 * catalog was not visible.
 */
export async function CheckConstrainedColumns(provider: ValueListScanProvider, user?: UserInfo): Promise<Set<string> | null> {
    const q = (name: string): string => provider.QuoteIdentifier(name);
    const sql =
        `SELECT ccu.TABLE_SCHEMA AS ${q('SchemaName')}, ccu.TABLE_NAME AS ${q('TableName')}, ccu.COLUMN_NAME AS ${q('ColumnName')} ` +
        `FROM INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu ` +
        `INNER JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc ` +
        `ON cc.CONSTRAINT_SCHEMA = ccu.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME`;
    try {
        const rows = await provider.ExecuteSQL<CheckColumnRow>(sql, undefined, { description: 'Value-list scan: CHECK-constrained columns', ignoreLogging: true }, user);
        if (rows.length === 0) return null;
        return new Set(rows.map((r) => columnKey(r.SchemaName, r.TableName, r.ColumnName)));
    } catch {
        return null;
    }
}

/** Classify one field's distinct values with the product's own rule; null when nothing is outside the list. */
export function ClassifyDistinctValues(entity: EntityInfo, field: EntityFieldInfo, rows: readonly DistinctValueRow[], hasCheck: boolean | null): ValueListFieldReport | null {
    const outside = rows
        .filter((r) => r.Value !== null && r.Value !== undefined && !field.ValueIsPermittedByValueList(r.Value))
        .map((r) => ({ Value: r.Value instanceof Date ? r.Value.toISOString() : String(r.Value), Rows: Number(r.ValueCount) }))
        .sort((a, b) => b.Rows - a.Rows || a.Value.localeCompare(b.Value));
    if (outside.length === 0) return null;
    return {
        Entity: entity.Name,
        Field: field.Name,
        RowsOutsideList: outside.reduce((sum, v) => sum + v.Rows, 0),
        DistinctValuesOutsideList: outside.length,
        Values: outside.slice(0, MAX_LISTED_VALUES),
        HasCheckConstraint: hasCheck,
    };
}

/** Scan every `List` field (or those of the named entities) for rows outside the field's list. */
export async function ScanValueLists(
    provider: ValueListScanProvider,
    entities: readonly EntityInfo[],
    options: { EntityNames?: readonly string[]; User?: UserInfo } = {},
): Promise<ValueListScanReport> {
    const checkColumns = await CheckConstrainedColumns(provider, options.User);
    const report: ValueListScanReport = { FieldsScanned: 0, FieldsWithoutValues: 0, Findings: [] };
    for (const { Entity: entity, Field: field } of ValueListFields(entities, options.EntityNames)) {
        if (!field.EntityFieldValues?.length) {
            report.FieldsWithoutValues++;
            continue;
        }
        report.FieldsScanned++;
        const hasCheck = checkColumns ? checkColumns.has(columnKey(entity.SchemaName, entity.BaseTable, field.Name)) : null;
        try {
            const rows = await provider.ExecuteSQL<DistinctValueRow>(
                DistinctValuesSQL(provider, entity, field),
                undefined,
                { description: `Value-list scan: ${entity.Name}.${field.Name}`, ignoreLogging: true },
                options.User,
            );
            const finding = ClassifyDistinctValues(entity, field, rows, hasCheck);
            if (finding) report.Findings.push(finding);
        } catch (error: unknown) {
            report.Findings.push({
                Entity: entity.Name,
                Field: field.Name,
                RowsOutsideList: 0,
                DistinctValuesOutsideList: 0,
                Values: [],
                HasCheckConstraint: hasCheck,
                Error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return report;
}

/**
 * Parse `--fix` values: each is one or more comma-separated `Entity.Field` names. The field is the
 * part after the LAST dot, since entity names hold spaces and colons (`MJ: AI Agents.Status`).
 */
export function ParseFixTargets(values: readonly string[]): ValueListFixTarget[] {
    const targets: ValueListFixTarget[] = [];
    for (const value of values) {
        for (const part of value.split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            const dot = trimmed.lastIndexOf('.');
            if (dot <= 0 || dot === trimmed.length - 1) {
                throw new Error(`"${trimmed}" is not Entity.Field (for example "MJ: AI Agents.Status").`);
            }
            targets.push({ Entity: trimmed.slice(0, dot).trim(), Field: trimmed.slice(dot + 1).trim() });
        }
    }
    return targets;
}

/**
 * Set each named field's `ValueListType` to `ListOrUserEntry` through the `MJ: Entity Fields`
 * entity, so Record Changes logs who changed it. The list stays as suggestions in the UI and the
 * save-time rule stops applying. Only the named fields change.
 *
 * A field whose column carries a CHECK constraint is skipped: CodeGen sets such a field back to
 * `List` on its next run, and the database refuses the values anyway, so the change would not
 * last. Fix the data or the constraint instead. When the CHECK constraints could not be read
 * (`checkColumns` is null), nothing is changed, since that guard cannot be applied.
 */
export async function ApplyValueListFixes(
    provider: ValueListFixProvider,
    entities: readonly EntityInfo[],
    targets: readonly ValueListFixTarget[],
    checkColumns: Set<string> | null,
    user?: UserInfo,
): Promise<ValueListFixResult[]> {
    const results: ValueListFixResult[] = [];
    for (const target of targets) {
        const entity = entities.find((e) => e.Name.toLowerCase() === target.Entity.toLowerCase());
        const field = entity?.Fields.find((f) => f.Name.toLowerCase() === target.Field.toLowerCase());
        if (!entity || !field) {
            results.push({ ...target, Fixed: false, Message: 'no such entity field' });
            continue;
        }
        if (field.ValueListTypeEnum !== EntityFieldValueListType.List) {
            results.push({ ...target, Fixed: false, Message: `ValueListType is already ${field.ValueListType}` });
            continue;
        }
        if (checkColumns === null) {
            results.push({
                ...target,
                Fixed: false,
                Message: 'the CHECK constraints could not be read (does this login own the tables?), so whether CodeGen would set the field back to List is unknown',
            });
            continue;
        }
        if (checkColumns.has(columnKey(entity.SchemaName, entity.BaseTable, field.Name))) {
            results.push({
                ...target,
                Fixed: false,
                Message: 'the column has a CHECK constraint, and CodeGen sets such a field back to List; fix the rows or the constraint instead',
            });
            continue;
        }
        const record = await provider.GetEntityObject<MJEntityFieldEntity>('MJ: Entity Fields', user);
        if (!(await record.Load(field.ID))) {
            results.push({ ...target, Fixed: false, Message: 'could not load the entity field record' });
            continue;
        }
        record.ValueListType = 'ListOrUserEntry';
        if (await record.Save()) {
            results.push({ ...target, Fixed: true, Message: 'ValueListType set to ListOrUserEntry' });
        } else {
            results.push({ ...target, Fixed: false, Message: record.LatestResult?.CompleteMessage ?? 'save failed' });
        }
    }
    return results;
}

/** Plain-text report lines. */
export function FormatValueListScan(report: ValueListScanReport): string[] {
    const lines: string[] = [];
    for (const f of report.Findings) {
        const check = f.HasCheckConstraint === null ? 'CHECK unknown' : f.HasCheckConstraint ? 'has CHECK' : 'no CHECK';
        if (f.Error) {
            lines.push(`${f.Entity}.${f.Field}: could not be read (${f.Error})`);
            continue;
        }
        lines.push(`${f.Entity}.${f.Field}: ${f.RowsOutsideList} row(s), ${f.DistinctValuesOutsideList} distinct value(s) outside the list (${check})`);
        for (const v of f.Values) lines.push(`    ${JSON.stringify(v.Value)}  ${v.Rows} row(s)`);
        if (f.DistinctValuesOutsideList > f.Values.length) lines.push(`    … ${f.DistinctValuesOutsideList - f.Values.length} more`);
    }
    const withRows = report.Findings.filter((f) => !f.Error).length;
    lines.push(
        `${report.FieldsScanned} List field(s) scanned; ${withRows} hold values outside their list` +
            (report.FieldsWithoutValues ? `; ${report.FieldsWithoutValues} skipped with no values` : '') +
            '.',
    );
    if (withRows > 0) {
        lines.push('Saving any of these rows fails validation. Correct the rows, or let the field accept other values with');
        lines.push('  mj doctor value-lists --fix "<Entity>.<Field>"   (sets ValueListType to ListOrUserEntry)');
    }
    return lines;
}

/**
 * How `mj doctor value-lists` ends the process. The database provider can leave handles open after
 * its pool is released, so the command exits explicitly, like the other database commands.
 */
export const ValueListScanExit = {
    Exit(code: number): never {
        process.exit(code);
    },
};
