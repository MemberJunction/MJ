/**
 * SchemaEvolution — diff engine for detecting changes between source and existing schema.
 * Compares source fields against existing table columns, produces incremental DDL.
 */
import type {
    ColumnModification,
    DatabasePlatform,
    ExistingTableInfo,
    SchemaDiff,
    SoftFKEntry,
    SourceObjectInfo,
    TargetColumnConfig,
    TargetTableConfig,
} from './interfaces.js';
import { DDLGenerator } from './DDLGenerator.js';
import { TypeMapper } from './TypeMapper.js';

/**
 * Computes schema diffs and generates ALTER TABLE migration SQL.
 */
export class SchemaEvolution {
    private readonly DDL = new DDLGenerator();
    private readonly Mapper = new TypeMapper();

    /**
     * Diff a source object against an existing target table.
     * Returns added, modified, and removed columns.
     */
    DiffSchema(
        source: SourceObjectInfo,
        targetConfig: TargetTableConfig,
        existing: ExistingTableInfo,
        platform: DatabasePlatform
    ): SchemaDiff {
        const existingNames = new Set(existing.Columns.map(c => c.Name.toLowerCase()));
        const sourceColMap = new Map(targetConfig.Columns.map(c => [c.TargetColumnName.toLowerCase(), c]));

        // Standard columns to ignore in the diff (managed by Schema Builder / CodeGen)
        const standardCols = new Set(['id', 'sourcerecordid', 'sourcejson', 'syncstatus', 'lastsyncedat',
                                       '__mj_createdat', '__mj_updatedat']);

        const added: TargetColumnConfig[] = [];
        const modified: ColumnModification[] = [];
        const removed: string[] = [];

        // Find added and modified columns
        for (const col of targetConfig.Columns) {
            const lowerName = col.TargetColumnName.toLowerCase();
            if (standardCols.has(lowerName)) continue;

            if (!existingNames.has(lowerName)) {
                added.push(col);
            } else {
                const existingCol = existing.Columns.find(c => c.Name.toLowerCase() === lowerName);
                if (existingCol && this.HasColumnChanged(existingCol, col)) {
                    modified.push({
                        ColumnName: col.TargetColumnName,
                        OldType: existingCol.SqlType,
                        NewType: col.TargetSqlType,
                        OldNullable: existingCol.IsNullable,
                        NewNullable: col.IsNullable,
                    });
                }
            }
        }

        // Find removed columns (in existing but not in source config)
        for (const existingCol of existing.Columns) {
            const lowerName = existingCol.Name.toLowerCase();
            if (standardCols.has(lowerName)) continue;
            if (!sourceColMap.has(lowerName)) {
                removed.push(existingCol.Name);
            }
        }

        return { AddedColumns: added, ModifiedColumns: modified, RemovedColumns: removed };
    }

    /**
     * Generate ALTER TABLE SQL for a schema diff.
     */
    GenerateEvolutionMigration(
        diff: SchemaDiff,
        schemaName: string,
        tableName: string,
        platform: DatabasePlatform
    ): string {
        const statements: string[] = [];

        for (const col of diff.AddedColumns) {
            statements.push(this.DDL.GenerateAlterTableAddColumn(schemaName, tableName, col, platform));
        }

        for (const mod of diff.ModifiedColumns) {
            statements.push(this.DDL.GenerateAlterTableAlterColumn(schemaName, tableName, mod, platform));
        }

        for (const colName of diff.RemovedColumns) {
            statements.push(`-- DEPRECATED: Column [${colName}] no longer exists in source. Consider removing after grace period.`);
        }

        return statements.join('\n\n');
    }

    /**
     * Identify new soft FK entries from a diff (for added FK columns).
     */
    GenerateEvolutionSoftFKUpdates(
        diff: SchemaDiff,
        targetConfig: TargetTableConfig
    ): SoftFKEntry[] {
        // New FK entries come from added columns that have corresponding soft FK definitions
        const addedNames = new Set(diff.AddedColumns.map(c => c.TargetColumnName));
        return targetConfig.SoftForeignKeys.filter(fk => addedNames.has(fk.FieldName));
    }

    private HasColumnChanged(existing: { SqlType: string; IsNullable: boolean }, target: TargetColumnConfig): boolean {
        // Normalize types for comparison (case-insensitive, strip whitespace)
        const normalizedExisting = existing.SqlType.toLowerCase().replace(/\s+/g, '');
        const normalizedTarget = target.TargetSqlType.toLowerCase().replace(/\s+/g, '');

        if (normalizedExisting !== normalizedTarget) return true;
        if (existing.IsNullable !== target.IsNullable) return true;
        return false;
    }
}
