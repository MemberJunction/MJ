/**
 * Backfill of `SchemaInfo.CanonicalSchemaName`, the case-stable schema name that `vwEntities` and
 * the GraphQL type-name path prefer over the physical `SchemaName` (which PostgreSQL folds to
 * lowercase). CodeGen runs this right after `spUpdateSchemaInfoFromDatabase` (issue #5641).
 *
 * Sources, in order:
 * 1. the installed Open App record (`OpenApp.SchemaName`, the manifest's casing);
 * 2. the `canonicalSchemaNames` map in mj.config.cjs, for schemas that are not Open Apps.
 *
 * A non-NULL value is never overwritten, matching is case-insensitive, and a declared name must
 * differ from the physical name only in case (it declares casing, not a different schema).
 */
import type { SQLDialect } from '@memberjunction/sql-dialect';

/** A `SchemaInfo` row whose `CanonicalSchemaName` is NULL. */
export interface CanonicalSchemaCandidate {
    ID: string;
    SchemaName: string;
}

/** Where a backfilled value came from. */
export type CanonicalSchemaSource = 'OpenApp' | 'Config';

/** One `SchemaInfo` row to update. */
export interface CanonicalSchemaAssignment {
    ID: string;
    SchemaName: string;
    CanonicalSchemaName: string;
    Source: CanonicalSchemaSource;
}

/** Result of {@link ResolveCanonicalSchemaNames}. */
export interface CanonicalSchemaResolution {
    Assignments: CanonicalSchemaAssignment[];
    /** Declared entries that were ignored, with the reason, for a warning in the CodeGen log. */
    Ignored: string[];
}

/**
 * Decides which NULL `CanonicalSchemaName` rows to fill and with what. Pure; no I/O.
 * @param candidates SchemaInfo rows with a NULL CanonicalSchemaName
 * @param openAppSchemaNames non-NULL `OpenApp.SchemaName` values
 * @param declared the `canonicalSchemaNames` config map (key: schema name in any case; value: canonical casing)
 * @param excludedSchemas schemas CodeGen does not process this run; their rows are left alone
 */
export function ResolveCanonicalSchemaNames(
    candidates: ReadonlyArray<CanonicalSchemaCandidate>,
    openAppSchemaNames: ReadonlyArray<string>,
    declared: Readonly<Record<string, string>> | undefined,
    excludedSchemas: ReadonlyArray<string>,
): CanonicalSchemaResolution {
    const fold = (s: string) => s.trim().toLowerCase();
    const excluded = new Set(excludedSchemas.map(fold));

    const fromApps = new Map<string, string>();
    for (const name of openAppSchemaNames) {
        if (name?.trim() && !fromApps.has(fold(name))) fromApps.set(fold(name), name.trim());
    }

    const ignored: string[] = [];
    const fromConfig = new Map<string, string>();
    for (const [key, value] of Object.entries(declared ?? {})) {
        if (!value?.trim() || fold(key) !== fold(value)) {
            ignored.push(`canonicalSchemaNames['${key}'] = '${value}': the value must be the same name as the key, differing only in case`);
            continue;
        }
        fromConfig.set(fold(key), value.trim());
    }

    const assignments: CanonicalSchemaAssignment[] = [];
    for (const row of candidates) {
        const key = fold(row.SchemaName);
        if (excluded.has(key)) continue;
        const app = fromApps.get(key);
        if (app) {
            assignments.push({ ID: row.ID, SchemaName: row.SchemaName, CanonicalSchemaName: app, Source: 'OpenApp' });
            continue;
        }
        const configured = fromConfig.get(key);
        if (configured) {
            assignments.push({ ID: row.ID, SchemaName: row.SchemaName, CanonicalSchemaName: configured, Source: 'Config' });
        }
    }
    return { Assignments: assignments, Ignored: ignored };
}

/** SQL selecting the SchemaInfo rows with a NULL CanonicalSchemaName. */
export function BuildCanonicalSchemaCandidatesSQL(dialect: SQLDialect, coreSchema: string): string {
    const q = (n: string) => dialect.QuoteIdentifier(n);
    return `SELECT ${q('ID')}, ${q('SchemaName')} FROM ${dialect.QuoteSchema(coreSchema, 'SchemaInfo')} WHERE ${q('CanonicalSchemaName')} IS NULL`;
}

/** SQL selecting the installed Open Apps' schema names. */
export function BuildOpenAppSchemaNamesSQL(dialect: SQLDialect, coreSchema: string): string {
    const q = (n: string) => dialect.QuoteIdentifier(n);
    return `SELECT ${q('SchemaName')} FROM ${dialect.QuoteSchema(coreSchema, 'OpenApp')} WHERE ${q('SchemaName')} IS NOT NULL`;
}

/**
 * One UPDATE per assignment, keyed on the row ID and still guarded on NULL so a value written in
 * between is never overwritten.
 */
export function BuildCanonicalSchemaUpdateSQL(dialect: SQLDialect, coreSchema: string, assignment: CanonicalSchemaAssignment): string {
    const q = (n: string) => dialect.QuoteIdentifier(n);
    return (
        `UPDATE ${dialect.QuoteSchema(coreSchema, 'SchemaInfo')} ` +
        `SET ${q('CanonicalSchemaName')} = ${dialect.QuoteStringLiteral(assignment.CanonicalSchemaName)} ` +
        `WHERE ${q('ID')} = ${dialect.QuoteStringLiteral(assignment.ID)} AND ${q('CanonicalSchemaName')} IS NULL`
    );
}
