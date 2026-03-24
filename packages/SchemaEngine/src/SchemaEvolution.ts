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
     * Removed columns are commented (no physical DROP — non-destructive).
     */
    GenerateEvolutionMigration(
        diff: SchemaDiff,
        schemaName: string,
        tableName: string,
        platform: DatabasePlatform
    ): string {
        const statements: string[] = [];

        for (const col of diff.AddedColumns) {
            statements.push(this.ddl.GenerateAlterTableAddColumn(schemaName, tableName, col, platform));
        }

        for (const mod of diff.ModifiedColumns) {
            statements.push(this.ddl.GenerateAlterTableAlterColumn(schemaName, tableName, mod, platform));
        }

        for (const colName of diff.RemovedColumns) {
            statements.push(
                `-- DEPRECATED: Column [${colName}] no longer in desired schema. ` +
                `Remove manually after confirming no dependencies.`
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
