import { CodeGenConnection, BaseViewExclusionsPermitted } from '../Database/codeGenDatabaseProvider';
import { logError, logStatus } from "./status_logging";
import { configInfo, DbPlatform, MjCoreSchema } from "../Config/config";


export type IntegrityCheckResult = {
    Name: string;
    Success: boolean;
    Message: string;
}

export type RunIntegrityCheck = {
    Name: string;
    Enabled: boolean;
    Run: (pool: CodeGenConnection) => Promise<IntegrityCheckResult>;
}

/**
 * What a set of integrity-check results means. Three outcomes, not two: an empty result array is
 * its own case and must never be collapsed into 'passed'.
 *
 * `RunIntegrityChecks(pool, true)` runs only the checks whose `Enabled` is true, so it returns `[]`
 * when the checks are configured off. Reporting that as a pass is the same defect as discarding the
 * results entirely — a green tick over nothing measured — and it is the likelier one, because
 * turning a check off is the obvious way to quiet it.
 */
export type IntegrityCheckOutcome =
    | { Kind: 'none-ran' }
    | { Kind: 'passed'; Count: number }
    | { Kind: 'failed'; Failures: IntegrityCheckResult[] };

/**
 * Returns a quoted identifier appropriate for the current database platform.
 * SQL Server uses [brackets], PostgreSQL uses "double quotes".
 */
function qi(name: string): string {
    if (DbPlatform() === 'postgresql') {
        return '"' + name + '"';
    }
    return '[' + name + ']';
}

/** One row of the EntityField scan the sequence check reads. */
type EntityFieldSequenceRow = {
    ID: string;
    Entity: string;
    SchemaName: string;
    BaseView: string;
    EntityID: string;
    Name: string;
    Sequence: number;
};

/** One column of a base view as the database catalog reports it. */
type CatalogColumnRow = {
    TableSchema: string;
    TableName: string;
    ColumnName: string;
    Ordinal: number | string;
};

function catalogKey(schema: string, objectName: string): string {
    return `${schema.trim().toLowerCase()}.${objectName.trim().toLowerCase()}`;
}

function escapeLiteral(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * This class has methods that can check various aspects of a MemberJunction installation's integrity. Code Gen will
 * run the various integrity checks based on configuration options that can be set in the master configuration file.
 */
export class SystemIntegrityBase {
    private static _integrityChecks: RunIntegrityCheck[] = [
        {
            Name: 'CheckEntityFieldSequences',
            Enabled: configInfo.integrityChecks?.enabled && configInfo.integrityChecks.entityFieldsSequenceCheck,
            Run: SystemIntegrityBase.CheckEntityFieldSequences
        }
    ];

    /**
     * Runs integrity checks on the system. If onlyEnabled is true, then only checks that are enabled in the configuration
     * will be run. If false, all checks will be run.
     * @param pool
     */
    public static async RunIntegrityChecks(pool: CodeGenConnection, onlyEnabled: boolean, logResults: boolean = true): Promise<IntegrityCheckResult[]> {
        let results: IntegrityCheckResult[] = [];
        try {
            const runPromises = [];
            for (const check of SystemIntegrityBase._integrityChecks) {
                if (!onlyEnabled || check.Enabled) {
                    runPromises.push(check.Run(pool));
                }
            }
            // async parallel run all the checks and then push the results into the results array
            const runResults = await Promise.all(runPromises);
            runResults.forEach(r => results.push(r));

            if (logResults) {
                // log the results to the console
                logStatus("Integrity check results:");
                for (const result of results) {
                    if (result.Success) {
                        logStatus(`   Integrity check successful: ${result.Name}`);
                    }
                    else {
                        logError(`   Integrity check FAILED: ${result.Name} - ${result.Message}`);
                    }
                }
            }
            return results;
        }
        catch (e) {
            const message = `Error running integrity checks: ${e}`;
            logError(message);
            results.push ({ Success: false, Message: message, Name: "_" });
            return results;
        }
    }


    /**
     * For a given entity, fields should be in sequence starting from 1. There should be no duplicate sequences within a given
     * entity. Invalidation of this could cause downstream issues with the system in particular with execution of Create/Update operations.
     *
     * @param pool
     * @returns
     */
    public static async CheckEntityFieldSequences(pool: CodeGenConnection): Promise<IntegrityCheckResult> {
        return SystemIntegrityBase.CheckEntityFieldSequencesInternal(pool, "");
    }

    /**
     * Checks the sequence of fields for a single entity. This is useful when you want to check a single entity at a time.
     * @param pool
     * @param entityName
     * @returns
     */
    public static async CheckSinleEntityFieldSequences(pool: CodeGenConnection, entityName: string): Promise<IntegrityCheckResult> {
        return SystemIntegrityBase.CheckEntityFieldSequencesInternal(pool, `WHERE ${qi('Entity')}='${entityName}'`);
    }

    /**
     * Checks every in-scope entity on its own, so one failing entity does not hide the next one
     * (#4737). For each entity the EntityField sequences must run 1..N with no duplicates, and the
     * fields must line up with the base view's columns as the database catalog reports them. The
     * catalog is read instead of a sample row so a view with no rows is still checked.
     *
     * Scope follows the run's schema configuration: `excludeSchemas` is skipped, and when
     * `includeSchemas` is set only those schemas are checked.
     */
    protected static async CheckEntityFieldSequencesInternal(pool: CodeGenConnection, filter: string): Promise<IntegrityCheckResult> {
        try {
            const schema = MjCoreSchema();
            const sSQL = `SELECT ${qi('ID')}, ${qi('Entity')}, ${qi('SchemaName')}, ${qi('BaseView')}, ${qi('EntityID')}, ${qi('Name')}, ${qi('Sequence')} FROM ${qi(schema)}.${qi('vwEntityFields')} ${filter} ORDER BY ${qi('Entity')}, ${qi('Sequence')}`;
            const resultResult = await pool.query(sSQL);
            const result = (resultResult.recordset ?? []) as EntityFieldSequenceRow[];
            if (result.length === 0) {
                throw new Error("No entity fields found");
            }

            const inScope = result.filter(r => SystemIntegrityBase.IsSchemaInScope(r.SchemaName));
            const byEntity = new Map<string, EntityFieldSequenceRow[]>();
            for (const row of inScope) {
                const key = String(row.EntityID);
                let fields = byEntity.get(key);
                if (!fields) {
                    fields = [];
                    byEntity.set(key, fields);
                }
                fields.push(row);
            }

            const viewSchemas = [...new Set(inScope.map(r => r.SchemaName).filter(s => !!s))];
            const catalog = await SystemIntegrityBase.LoadCatalogColumns(pool, viewSchemas);
            const excludedViewFields = SystemIntegrityBase.ExcludedBaseViewFields();

            const messages: string[] = [];
            for (const fields of byEntity.values()) {
                const entityMessage = SystemIntegrityBase.CheckSingleEntity(fields, catalog, excludedViewFields);
                if (entityMessage) {
                    messages.push(entityMessage);
                }
            }

            return { Success: messages.length === 0, Message: messages.join(''), Name: 'entityFieldsSequenceCheck' };
        }
        catch (e) {
            const message = `Error checking entity field sequences: ${e}`;
            logError(message);
            return { Success: false, Message: message, Name: 'entityFieldsSequenceCheck' };
        }
    }

    /**
     * True when the schema is checked: not in `excludeSchemas`, and in `includeSchemas` when that
     * list is set. Compared case-insensitively.
     */
    protected static IsSchemaInScope(schemaName: string | null | undefined): boolean {
        const target = String(schemaName ?? '').trim().toLowerCase();
        const excluded = (configInfo.excludeSchemas ?? []).map(s => s.trim().toLowerCase());
        if (excluded.includes(target)) {
            return false;
        }
        const included = (configInfo.includeSchemas ?? []).map(s => s.trim().toLowerCase());
        if (included.length > 0 && !included.includes(target)) {
            return false;
        }
        return true;
    }

    /**
     * Reads the column order of every view and table in the given schemas from
     * INFORMATION_SCHEMA.COLUMNS, which both SQL Server and PostgreSQL provide.
     * @returns `schema.object` (lower case) → column names in ordinal order
     */
    protected static async LoadCatalogColumns(pool: CodeGenConnection, schemas: string[]): Promise<Map<string, string[]>> {
        const columns = new Map<string, string[]>();
        if (schemas.length === 0) {
            return columns;
        }
        const schemaList = schemas.map(s => `'${escapeLiteral(s)}'`).join(', ');
        const sql = `SELECT TABLE_SCHEMA AS "TableSchema", TABLE_NAME AS "TableName", COLUMN_NAME AS "ColumnName", ORDINAL_POSITION AS "Ordinal"
                     FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA IN (${schemaList})
                     ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`;
        const rows = ((await pool.query(sql)).recordset ?? []) as CatalogColumnRow[];
        const ordered = [...rows].sort((a, b) => Number(a.Ordinal) - Number(b.Ordinal));
        for (const row of ordered) {
            const key = catalogKey(row.TableSchema, row.TableName);
            let list = columns.get(key);
            if (!list) {
                list = [];
                columns.set(key, list);
            }
            list.push(row.ColumnName);
        }
        return columns;
    }

    /**
     * Base-view column exclusions (`baseViewExcludedFields`) keep an EntityField whose column the
     * view leaves out on purpose, so those fields are skipped in the column comparison. Entries are
     * `Entity.Field` or a bare `Field` (any entity). Empty unless exclusions are permitted.
     */
    protected static ExcludedBaseViewFields(): { qualified: Set<string>; bare: Set<string> } {
        const qualified = new Set<string>();
        const bare = new Set<string>();
        if (!BaseViewExclusionsPermitted()) {
            return { qualified, bare };
        }
        for (const raw of configInfo.baseViewExcludedFields ?? []) {
            const entry = raw.trim();
            const lastDot = entry.lastIndexOf('.');
            if (lastDot > 0 && lastDot < entry.length - 1) {
                qualified.add(`${entry.slice(0, lastDot).trim().toLowerCase()}.${entry.slice(lastDot + 1).trim().toLowerCase()}`);
            } else if (entry.length > 0) {
                bare.add(entry.toLowerCase());
            }
        }
        return { qualified, bare };
    }

    /**
     * Checks one entity's fields (already ordered by Sequence).
     * @returns an empty string when the entity passes, otherwise the failure text
     */
    protected static CheckSingleEntity(
        fields: EntityFieldSequenceRow[],
        catalog: Map<string, string[]>,
        excludedViewFields: { qualified: Set<string>; bare: Set<string> }
    ): string {
        const entity = fields[0].Entity;

        const seen = new Map<number, number>();
        for (const f of fields) {
            seen.set(f.Sequence, (seen.get(f.Sequence) ?? 0) + 1);
        }
        const duplicates = fields.filter(f => (seen.get(f.Sequence) ?? 0) > 1);
        if (duplicates.length > 0) {
            return `Entity ${entity} has duplicate Entity Field sequences:\n` +
                duplicates.map(d => `      * ${d.Name} (${d.Sequence})`).join("\n") + "\n";
        }

        let message = '';
        fields.forEach((field, index) => {
            if (field.Sequence !== index + 1) {
                message += `Entity ${entity} has a missing sequence number. Expected ${index + 1}, but found ${field.Sequence} for field ${field.Name}\n`;
            }
        });
        if (message) {
            return message;
        }

        // The metadata sequence must match the physical column order of the base view; the
        // spCreate/spUpdate result capture depends on it.
        const schemaName = fields[0].SchemaName;
        const baseView = fields[0].BaseView;
        if (!schemaName || !baseView) {
            return '';
        }
        const columns = catalog.get(catalogKey(schemaName, baseView));
        if (!columns || columns.length === 0) {
            return `Entity ${entity} has no base view ${qi(schemaName)}.${qi(baseView)} in the database catalog\n`;
        }
        const entityKey = entity.trim().toLowerCase();
        const comparable = fields.filter(f => {
            const name = f.Name.toLowerCase();
            return !excludedViewFields.bare.has(name) && !excludedViewFields.qualified.has(`${entityKey}.${name}`);
        });
        for (let i = 0; i < comparable.length; i++) {
            if (columns[i] !== comparable[i].Name) {
                return `Entity ${entity} has a mismatch between the metadata sequence and the physical column order in the base view ${qi(schemaName)}.${qi(baseView)} for position ${i + 1}. Expected ${comparable[i].Name} but found ${columns[i]}\n`;
            }
        }
        return '';
    }

    /**
     * Classifies the output of {@link RunIntegrityChecks}. Pure: it decides, it does not report.
     *
     * This lives here rather than inline in the caller so the decision can be tested without
     * standing up the CodeGen pipeline. The case that needs the test is `none-ran`: it is
     * indistinguishable from a pass by every signal except the array's length, so a caller that
     * forgets it looks correct and is not.
     */
    public static ClassifyResults(results: IntegrityCheckResult[]): IntegrityCheckOutcome {
        if (results.length === 0) {
            return { Kind: 'none-ran' };
        }
        const failures = results.filter((r) => !r.Success);
        return failures.length > 0
            ? { Kind: 'failed', Failures: failures }
            : { Kind: 'passed', Count: results.length };
    }
}
