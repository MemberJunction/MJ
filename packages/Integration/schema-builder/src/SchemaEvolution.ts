/**
 * SchemaEvolution — diff engine for detecting changes between source and existing schema.
 * Compares source fields against existing table columns, produces incremental DDL.
 */
import { GetDialect } from '@memberjunction/sql-dialect';
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
import { DDLGenerator, ValidateIdentifier } from './DDLGenerator.js';
import { TypeMapper } from './TypeMapper.js';

/**
 * Computes schema diffs and generates ALTER TABLE migration SQL.
 */
export class SchemaEvolution {
    private readonly DDL = new DDLGenerator();
    private readonly mapper = new TypeMapper();

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
                                       '__mj_createdat', '__mj_updatedat',
                                       '__mj_integration_syncstatus', '__mj_integration_lastsyncedat',
                                       '__mj_integration_lastsyncedsnapshot', '__mj_integration_syncmessage',
                                       '__mj_integration_contenthash', '__mj_integration_customoverflow',
                                       '__mj_integration_externalversion', '__mj_integration_lastseenmodifiedvalue',
                                       '__mj_integration_lastreconciledat', '__mj_integration_lastwriterdirection',
                                       '__mj_integration_istombstoned', '__mj_integration_deleteddetectedat']);

        const added: TargetColumnConfig[] = [];
        const modified: ColumnModification[] = [];
        const removed: string[] = [];
        const warnings: string[] = [];

        // Build set of PK column names — changes are warned but not executed
        const pkNames = new Set(
            (targetConfig.PrimaryKeyFields ?? []).map(f => f.toLowerCase())
        );

        // Find added and modified columns
        for (const col of targetConfig.Columns) {
            const lowerName = col.TargetColumnName.toLowerCase();
            if (standardCols.has(lowerName)) continue;

            // PK columns: detect changes but only warn, never alter
            if (pkNames.has(lowerName)) {
                if (existingNames.has(lowerName)) {
                    const existingCol = existing.Columns.find(c => c.Name.toLowerCase() === lowerName);
                    if (existingCol && this.hasColumnChanged(existingCol, col)) {
                        warnings.push(`PK column '${col.TargetColumnName}' type changed from ${existingCol.SqlType} to ${col.TargetSqlType} — skipped (requires manual constraint drop/recreate)`);
                    }
                }
                continue;
            }

            if (!existingNames.has(lowerName)) {
                added.push(col);
            } else {
                const existingCol = existing.Columns.find(c => c.Name.toLowerCase() === lowerName);
                if (existingCol && this.hasColumnChanged(existingCol, col)) {
                    const existingFamily = this.sqlTypeFamily(existingCol.SqlType);
                    const targetFamily = this.sqlTypeFamily(col.TargetSqlType);
                    if (existingFamily !== targetFamily) {
                        warnings.push(
                            `Column '${col.TargetColumnName}' type family changed from ${existingCol.SqlType} to ${col.TargetSqlType} — skipped on existing table to prevent data conversion errors or precision loss`
                        );
                        continue;
                    }
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

        // Ensure the standard __mj_integration_* columns exist on EXISTING tables. The diff above
        // skips standard columns (they're in `standardCols`), so a table created before a standard
        // column was introduced would never get it. ALTER-add any that are missing — otherwise the
        // engine's writes to a missing column silently no-op (hasField guard).
        added.push(...this.ensureStandardColumns(existing, platform));

        const addedIndexes = this.computeAddedIndexes(source, targetConfig, existing, modified);

        return {
            AddedColumns: added,
            ModifiedColumns: modified,
            RemovedColumns: removed,
            Warnings: warnings,
            AddedIndexes: addedIndexes,
        };
    }

    private computeAddedIndexes(
        source: SourceObjectInfo,
        targetConfig: TargetTableConfig,
        existing: ExistingTableInfo,
        modified: ColumnModification[]
    ): Array<{ IndexName: string; Columns: string[] }> {
        const existingIndexSet = new Set((existing.Indexes ?? []).map(i => i.toLowerCase()));
        const existingColByName = new Map(existing.Columns.map(c => [c.Name.toLowerCase(), c]));
        const targetColByName = new Map(targetConfig.Columns.map(c => [c.TargetColumnName.toLowerCase(), c]));
        const indexedTuples = new Set<string>();
        const result: Array<{ IndexName: string; Columns: string[] }> = [];

        const isColumnIndexable = (colName: string): boolean => {
            const lower = colName.toLowerCase();
            const mod = modified.find(m => m.ColumnName.toLowerCase() === lower);
            if (mod) {
                return !/\(\s*max\s*\)|^(ntext|text)$/i.test(mod.NewType.trim());
            }
            const ex = existingColByName.get(lower);
            if (ex) {
                if (ex.MaxLength === -1) return false;
                return !/\(\s*max\s*\)|^(ntext|text)$/i.test(ex.SqlType.trim());
            }
            return targetColByName.has(lower);
        };

        const addCandidate = (indexName: string, columns: string[]): void => {
            if (columns.length === 0) return;
            const tupleKey = columns.map(c => c.toLowerCase()).join(',');
            if (indexedTuples.has(tupleKey)) return;
            if (existingIndexSet.has(indexName.toLowerCase())) return;
            if (!columns.every(isColumnIndexable)) return;
            indexedTuples.add(tupleKey);
            result.push({ IndexName: indexName, Columns: columns });
        };

        if (targetConfig.PrimaryKeyFields && targetConfig.PrimaryKeyFields.length > 0) {
            addCandidate(
                `IX_${targetConfig.SchemaName}_${targetConfig.TableName}_PK`,
                targetConfig.PrimaryKeyFields
            );
        }

        for (const fk of targetConfig.SoftForeignKeys ?? []) {
            addCandidate(
                `IX_${targetConfig.SchemaName}_${targetConfig.TableName}_FK_${fk.FieldName}`,
                [fk.FieldName]
            );
        }

        for (const cols of targetConfig.OrganicKeyFields ?? []) {
            if (cols.length > 0) {
                addCandidate(
                    `IX_${targetConfig.SchemaName}_${targetConfig.TableName}_OK_${cols.join('_')}`,
                    cols
                );
            }
        }

        for (const field of source.Fields ?? []) {
            if (field.IsUniqueKey && !field.IsPrimaryKey) {
                const targetCol = targetConfig.Columns.find(c => c.SourceFieldName === field.Name);
                if (targetCol) {
                    addCandidate(
                        `IX_${targetConfig.SchemaName}_${targetConfig.TableName}_OK_${targetCol.TargetColumnName}`,
                        [targetCol.TargetColumnName]
                    );
                }
            }
        }

        return result;
    }

    /**
     * Returns the standard __mj_integration_* columns MISSING from an existing mirror table,
     * as ALTER-ADD configs. New tables get these in CREATE TABLE (DDLGenerator.StandardColumns);
     * existing tables created before a column was added get it ALTER-ed in here.
     */
    private ensureStandardColumns(existing: ExistingTableInfo, platform: DatabasePlatform): TargetColumnConfig[] {
        const have = new Set(existing.Columns.map(c => c.Name.toLowerCase()));
        const isSql = platform === 'sqlserver';
        const std: TargetColumnConfig[] = [
            { SourceFieldName: '__mj_integration_SyncStatus', TargetColumnName: '__mj_integration_SyncStatus', TargetSqlType: isSql ? 'NVARCHAR(50)' : 'VARCHAR(50)', IsNullable: false, MaxLength: 50, Precision: null, Scale: null, DefaultValue: "'Active'" },
            { SourceFieldName: '__mj_integration_LastSyncedAt', TargetColumnName: '__mj_integration_LastSyncedAt', TargetSqlType: isSql ? 'DATETIMEOFFSET' : 'TIMESTAMPTZ', IsNullable: true, MaxLength: null, Precision: null, Scale: null, DefaultValue: null },
            { SourceFieldName: '__mj_integration_LastSyncedSnapshot', TargetColumnName: '__mj_integration_LastSyncedSnapshot', TargetSqlType: isSql ? 'NVARCHAR(MAX)' : 'TEXT', IsNullable: true, MaxLength: null, Precision: null, Scale: null, DefaultValue: null },
            { SourceFieldName: '__mj_integration_SyncMessage', TargetColumnName: '__mj_integration_SyncMessage', TargetSqlType: isSql ? 'NVARCHAR(MAX)' : 'TEXT', IsNullable: true, MaxLength: null, Precision: null, Scale: null, DefaultValue: null },
            { SourceFieldName: '__mj_integration_ContentHash', TargetColumnName: '__mj_integration_ContentHash', TargetSqlType: isSql ? 'NVARCHAR(64)' : 'VARCHAR(64)', IsNullable: true, MaxLength: 64, Precision: null, Scale: null, DefaultValue: null },
            { SourceFieldName: '__mj_integration_CustomOverflow', TargetColumnName: '__mj_integration_CustomOverflow', TargetSqlType: isSql ? 'NVARCHAR(MAX)' : 'TEXT', IsNullable: true, MaxLength: null, Precision: null, Scale: null, DefaultValue: null },
            // Per-record sync ledger (plan §2.5)
            { SourceFieldName: '__mj_integration_ExternalVersion', TargetColumnName: '__mj_integration_ExternalVersion', TargetSqlType: isSql ? 'NVARCHAR(255)' : 'VARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
            { SourceFieldName: '__mj_integration_LastSeenModifiedValue', TargetColumnName: '__mj_integration_LastSeenModifiedValue', TargetSqlType: isSql ? 'NVARCHAR(255)' : 'VARCHAR(255)', IsNullable: true, MaxLength: 255, Precision: null, Scale: null, DefaultValue: null },
            { SourceFieldName: '__mj_integration_LastReconciledAt', TargetColumnName: '__mj_integration_LastReconciledAt', TargetSqlType: isSql ? 'DATETIMEOFFSET' : 'TIMESTAMPTZ', IsNullable: true, MaxLength: null, Precision: null, Scale: null, DefaultValue: null },
            { SourceFieldName: '__mj_integration_LastWriterDirection', TargetColumnName: '__mj_integration_LastWriterDirection', TargetSqlType: isSql ? 'NVARCHAR(10)' : 'VARCHAR(10)', IsNullable: true, MaxLength: 10, Precision: null, Scale: null, DefaultValue: null },
            { SourceFieldName: '__mj_integration_IsTombstoned', TargetColumnName: '__mj_integration_IsTombstoned', TargetSqlType: isSql ? 'BIT' : 'BOOLEAN', IsNullable: false, MaxLength: null, Precision: null, Scale: null, DefaultValue: isSql ? '0' : 'FALSE' },
            { SourceFieldName: '__mj_integration_DeletedDetectedAt', TargetColumnName: '__mj_integration_DeletedDetectedAt', TargetSqlType: isSql ? 'DATETIMEOFFSET' : 'TIMESTAMPTZ', IsNullable: true, MaxLength: null, Precision: null, Scale: null, DefaultValue: null },
        ];
        return std.filter(c => !have.has(c.TargetColumnName.toLowerCase()));
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
        const d = GetDialect(platform);
        const addedIndexes = diff.AddedIndexes ?? [];
        const indexedColSet = new Set(
            addedIndexes.flatMap(idx => idx.Columns.map(c => c.toLowerCase()))
        );
        const statements: string[] = [];

        for (const col of diff.AddedColumns) {
            let colToEmit = col;
            if (indexedColSet.has(col.TargetColumnName.toLowerCase())) {
                const capped = d.CapIndexableType(col.TargetSqlType);
                if (capped !== col.TargetSqlType) {
                    colToEmit = { ...col, TargetSqlType: capped };
                }
            }
            statements.push(this.DDL.GenerateAlterTableAddColumn(schemaName, tableName, colToEmit, platform));
        }

        const droppedIndexNames = new Set<string>();
        for (const mod of diff.ModifiedColumns) {
            let modToEmit = mod;
            if (indexedColSet.has(mod.ColumnName.toLowerCase())) {
                for (const idx of addedIndexes) {
                    if (
                        idx.Columns.some(c => c.toLowerCase() === mod.ColumnName.toLowerCase()) &&
                        !droppedIndexNames.has(idx.IndexName.toLowerCase())
                    ) {
                        droppedIndexNames.add(idx.IndexName.toLowerCase());
                        statements.push(d.DropIndexIfExists(schemaName, tableName, idx.IndexName));
                    }
                }
                const capped = d.CapIndexableType(mod.NewType);
                if (capped !== mod.NewType) {
                    modToEmit = { ...mod, NewType: capped };
                }
            }
            statements.push(this.DDL.GenerateAlterTableAlterColumn(schemaName, tableName, modToEmit, platform));
        }

        for (const idx of addedIndexes) {
            ValidateIdentifier(schemaName, 'schema');
            ValidateIdentifier(tableName, 'table');
            idx.Columns.forEach(c => ValidateIdentifier(c, 'index column'));
            statements.push(
                d.CreateIndexIfAbsent({
                    schema: schemaName,
                    tableName,
                    indexName: idx.IndexName,
                    columns: idx.Columns,
                    unique: false,
                })
            );
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

    private hasColumnChanged(existing: { SqlType: string; IsNullable: boolean }, target: TargetColumnConfig): boolean {
        // Normalize types for comparison (case-insensitive, strip whitespace)
        const normalizedExisting = existing.SqlType.toLowerCase().replace(/\s+/g, '');
        const normalizedTarget = target.TargetSqlType.toLowerCase().replace(/\s+/g, '');

        if (normalizedExisting !== normalizedTarget) return true;
        if (existing.IsNullable !== target.IsNullable) return true;
        return false;
    }

    /**
     * Classify a physical SQL type string into its broad type family so SchemaEvolution can
     * distinguish safe within-family adjustments (e.g. NVARCHAR(100) → NVARCHAR(255) or INT → BIGINT)
     * from cross-family conversions (e.g. NVARCHAR(255) → INT or DECIMAL) that can fail on stored
     * string values or silently round decimal places on existing tables.
     */
    private sqlTypeFamily(sqlType: string): string {
        const base = (sqlType ?? '')
            .toLowerCase()
            .replace(/\(.*\)/, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (base === 'nvarchar' || base === 'varchar' || base === 'nchar' || base === 'char' || base === 'ntext' || base === 'text' || base === 'string') {
            return 'string';
        }
        if (base === 'int' || base === 'integer' || base === 'bigint' || base === 'smallint' || base === 'tinyint') {
            return 'integer';
        }
        if (base === 'decimal' || base === 'numeric' || base === 'money' || base === 'smallmoney') {
            return 'decimal';
        }
        if (base === 'float' || base === 'real' || base === 'double precision' || base === 'double') {
            return 'float';
        }
        if (base === 'bit' || base === 'boolean' || base === 'bool') {
            return 'boolean';
        }
        if (base === 'datetimeoffset' || base === 'datetime2' || base === 'datetime' || base === 'smalldatetime' || base === 'timestamptz' || base === 'timestamp' || base === 'timestamp with time zone' || base === 'timestamp without time zone') {
            return 'datetime';
        }
        if (base === 'date') {
            return 'date';
        }
        if (base === 'time') {
            return 'time';
        }
        if (base === 'uniqueidentifier' || base === 'uuid') {
            return 'uuid';
        }
        return base;
    }
}
