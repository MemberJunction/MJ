/**
 * SchemaEvolution — diff engine comparing desired vs existing table state.
 * Produces incremental ALTER TABLE SQL for schema changes.
 * Generic: works with TableDefinition + ExistingTableInfo (no integration-engine dependency).
 */
import type {
    ColumnDefinition,
    ColumnModification,
    DatabasePlatform,
    ExistingTableInfo,
    SchemaDiff,
    SchemaEvolutionInput,
    TableDefinition,
} from './interfaces.js';
import { DDLGenerator } from './DDLGenerator.js';

/**
 * Computes schema diffs and generates ALTER TABLE migration SQL.
 */
export class SchemaEvolution {
    private readonly ddl = new DDLGenerator();

    /**
     * Diff the desired table definition against the existing table state.
     * Returns added, modified, and removed columns.
     *
     * Standard system columns (managed by CodeGen) are excluded from the diff.
     */
    DiffSchema(desired: TableDefinition, existing: ExistingTableInfo): SchemaDiff {
        const existingByName = new Map(
            existing.Columns.map(c => [c.Name.toLowerCase(), c])
        );

        const allDesiredColumns: ColumnDefinition[] = [
            ...desired.Columns,
            ...(desired.AdditionalColumns ?? []),
        ];

        const added: ColumnDefinition[] = [];
        const modified: ColumnModification[] = [];
        const removed: string[] = [];

        // Columns that CodeGen manages — ignore in diff
        const systemColumns = new Set([
            'id', '__mj_createdat', '__mj_updatedat',
        ]);

        // Find added and modified columns
        for (const col of allDesiredColumns) {
            const lowerName = col.Name.toLowerCase();
            if (systemColumns.has(lowerName)) continue;

            const existingCol = existingByName.get(lowerName);
            if (!existingCol) {
                added.push(col);
            } else if (this.hasColumnChanged(existingCol, col)) {
                modified.push({
                    ColumnName: col.Name,
                    OldType: existingCol.SqlType,
                    NewType: col.RawSqlType ?? col.Type,
                    OldNullable: existingCol.IsNullable,
                    NewNullable: col.IsNullable,
                });
            }
        }

        // Find removed columns
        const desiredNames = new Set(allDesiredColumns.map(c => c.Name.toLowerCase()));
        for (const existingCol of existing.Columns) {
            const lowerName = existingCol.Name.toLowerCase();
            if (systemColumns.has(lowerName)) continue;
            if (!desiredNames.has(lowerName)) {
                removed.push(existingCol.Name);
            }
        }

        return { AddedColumns: added, ModifiedColumns: modified, RemovedColumns: removed };
    }

    /**
     * Generate ALTER TABLE SQL for a SchemaDiff.
     *
     * Removed columns are intentionally NOT emitted as `DROP COLUMN` (non-destructive design).
     * Instead they are surfaced as warning comments that the pipeline executor MUST detect
     * and report to the user — otherwise the user sees "success" while their requested drop
     * was silently skipped (the original A5 false-success bug).
     *
     * If the user's intent contains ONLY column removals (no adds, no modifications), this
     * method throws so the pipeline fails fast instead of running a no-op statement and
     * reporting success.
     */
    GenerateEvolutionMigration(
        diff: SchemaDiff,
        schemaName: string,
        tableName: string,
        platform: DatabasePlatform
    ): string {
        const hasActiveOps = diff.AddedColumns.length > 0 || diff.ModifiedColumns.length > 0;

        if (!hasActiveOps && diff.RemovedColumns.length > 0) {
            throw new Error(
                `Cannot apply migration: only removal of column(s) [${diff.RemovedColumns.join(', ')}] was requested, ` +
                `but Database Designer does not perform destructive DROP COLUMN operations. ` +
                `To remove a column, drop it manually after verifying no dependencies, then re-run schema sync. ` +
                `If you intended to keep these columns, add them back to the desired schema and resubmit.`
            );
        }

        const statements: string[] = [];

        for (const col of diff.AddedColumns) {
            statements.push(this.ddl.GenerateAlterTableAddColumn(schemaName, tableName, col, platform));
        }

        for (const mod of diff.ModifiedColumns) {
            statements.push(this.ddl.GenerateAlterTableAlterColumn(schemaName, tableName, mod, platform));
        }

        for (const colName of diff.RemovedColumns) {
            statements.push(
                `-- ⚠️  WARNING — DROP NOT EXECUTED: Column [${colName}] was requested to be removed but ` +
                `Database Designer does not perform destructive DROP COLUMN. ` +
                `Drop manually after verifying no dependencies. (Pipeline executor: surface this warning to the user.)`
            );
        }

        return statements.join('\n\n');
    }

    /**
     * Convenience: diff + generate ALTER TABLE in one call.
     */
    GenerateFromEvolutionInput(input: SchemaEvolutionInput, platform: DatabasePlatform): string {
        const diff = this.DiffSchema(input.Desired, input.ExistingTable);
        return this.GenerateEvolutionMigration(
            diff,
            input.Desired.SchemaName,
            input.Desired.TableName,
            platform
        );
    }

    private hasColumnChanged(
        existing: { SqlType: string; IsNullable: boolean },
        desired: ColumnDefinition
    ): boolean {
        const desiredType = desired.RawSqlType ?? desired.Type;
        const normalizedExisting = existing.SqlType.toLowerCase().replace(/\s+/g, '');
        const normalizedDesired = desiredType.toLowerCase().replace(/\s+/g, '');
        if (normalizedExisting !== normalizedDesired) return true;
        if (existing.IsNullable !== desired.IsNullable) return true;
        return false;
    }
}
