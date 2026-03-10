/**
 * SoftFKConfigEmitter — reads/merges additionalSchemaInfo JSON for soft PKs and FKs.
 * File-emission only — produces updated JSON content, never writes to disk directly.
 */
import type { EmittedFile, SoftFKEntry, SourceSchemaInfo, TargetTableConfig } from './interfaces.js';

/** Shape of one table entry in additionalSchemaInfo. */
interface SchemaInfoTableEntry {
    TableName: string;
    PrimaryKey?: Array<{ FieldName: string; Description?: string }>;
    ForeignKeys?: Array<{
        FieldName: string;
        SchemaName: string;
        RelatedTable: string;
        RelatedField: string;
    }>;
}

/** The top-level additionalSchemaInfo structure: schema name → table entries. */
type AdditionalSchemaInfo = Record<string, SchemaInfoTableEntry[]>;

/**
 * Manages soft PK and FK definitions in the additionalSchemaInfo JSON file.
 */
export class SoftFKConfigEmitter {
    /**
     * Parse existing additionalSchemaInfo JSON content.
     * Returns empty object if content is empty/null.
     */
    ParseExistingConfig(jsonContent: string | null): AdditionalSchemaInfo {
        if (!jsonContent || jsonContent.trim() === '') {
            return {};
        }
        return JSON.parse(jsonContent) as AdditionalSchemaInfo;
    }

    /**
     * Merge new soft FK entries into an existing config.
     * Deduplicates — won't add the same FK twice.
     */
    MergeSchemaConfig(existing: AdditionalSchemaInfo, newEntries: SoftFKEntry[]): AdditionalSchemaInfo {
        const result: AdditionalSchemaInfo = JSON.parse(JSON.stringify(existing));

        for (const entry of newEntries) {
            if (!result[entry.SchemaName]) {
                result[entry.SchemaName] = [];
            }

            const schemaEntries = result[entry.SchemaName];
            let tableEntry = schemaEntries.find(t => t.TableName === entry.TableName);

            if (!tableEntry) {
                tableEntry = { TableName: entry.TableName, ForeignKeys: [] };
                schemaEntries.push(tableEntry);
            }

            if (!tableEntry.ForeignKeys) {
                tableEntry.ForeignKeys = [];
            }

            // Deduplicate: skip if this exact FK already exists
            const exists = tableEntry.ForeignKeys.some(
                fk => fk.FieldName === entry.FieldName &&
                      fk.SchemaName === entry.TargetSchemaName &&
                      fk.RelatedTable === entry.TargetTableName &&
                      fk.RelatedField === entry.TargetFieldName
            );

            if (!exists) {
                tableEntry.ForeignKeys.push({
                    FieldName: entry.FieldName,
                    SchemaName: entry.TargetSchemaName,
                    RelatedTable: entry.TargetTableName,
                    RelatedField: entry.TargetFieldName,
                });
            }
        }

        return result;
    }

    /**
     * Add soft PK entries for integration tables.
     * Uses the natural PK field name(s) from the source system. Supports composite PKs.
     */
    MergeSoftPKs(existing: AdditionalSchemaInfo, targetConfigs: TargetTableConfig[]): AdditionalSchemaInfo {
        const result: AdditionalSchemaInfo = JSON.parse(JSON.stringify(existing));

        for (const config of targetConfigs) {
            if (config.PrimaryKeyFields.length === 0) continue;

            if (!result[config.SchemaName]) {
                result[config.SchemaName] = [];
            }

            const schemaEntries = result[config.SchemaName];
            let tableEntry = schemaEntries.find(t => t.TableName === config.TableName);

            if (!tableEntry) {
                tableEntry = { TableName: config.TableName };
                schemaEntries.push(tableEntry);
            }

            // Set soft PK to the natural PK field(s) from the source system
            tableEntry.PrimaryKey = config.PrimaryKeyFields.map(fieldName => ({
                FieldName: fieldName,
                Description: `Primary key from source system`,
            }));
        }

        return result;
    }

    /**
     * Extract soft FK entries from source schema relationships + target configs.
     * Maps source relationship field names → target column names using the target config.
     * FKs point to the natural PK field on target tables (first PK field for composite keys).
     */
    GenerateConfigEntries(
        sourceSchema: SourceSchemaInfo,
        targetConfigs: TargetTableConfig[]
    ): SoftFKEntry[] {
        const entries: SoftFKEntry[] = [];

        // Also collect entries already defined directly on TargetTableConfig
        for (const config of targetConfigs) {
            if (config.SoftForeignKeys) {
                entries.push(...config.SoftForeignKeys);
            }
        }

        // Build a map of source object name → target config for FK resolution
        const sourceToTarget = new Map<string, TargetTableConfig>();
        for (const config of targetConfigs) {
            sourceToTarget.set(config.SourceObjectName, config);
        }

        // Walk source relationships and map them to target columns
        for (const sourceObj of sourceSchema.Objects) {
            const targetConfig = sourceToTarget.get(sourceObj.ExternalName);
            if (!targetConfig) continue;

            for (const rel of sourceObj.Relationships) {
                const targetOfFK = sourceToTarget.get(rel.TargetObject);
                if (!targetOfFK) continue; // Target object not being imported

                // Find the mapped column name for this FK field
                const columnConfig = targetConfig.Columns.find(c => c.SourceFieldName === rel.FieldName);
                const columnName = columnConfig ? columnConfig.TargetColumnName : rel.FieldName;

                // FK points to the natural PK field on the target table
                const targetPKField = targetOfFK.PrimaryKeyFields[0];
                if (!targetPKField) continue; // Target has no PK — skip FK

                const entry: SoftFKEntry = {
                    SchemaName: targetConfig.SchemaName,
                    TableName: targetConfig.TableName,
                    FieldName: columnName,
                    TargetSchemaName: targetOfFK.SchemaName,
                    TargetTableName: targetOfFK.TableName,
                    TargetFieldName: targetPKField,
                };

                // Deduplicate against already-added entries
                const alreadyAdded = entries.some(
                    e => e.SchemaName === entry.SchemaName &&
                         e.TableName === entry.TableName &&
                         e.FieldName === entry.FieldName
                );
                if (!alreadyAdded) {
                    entries.push(entry);
                }
            }
        }

        return entries;
    }

    /**
     * Produce an EmittedFile with the updated additionalSchemaInfo JSON.
     */
    EmitConfigFile(configPath: string, mergedConfig: AdditionalSchemaInfo): EmittedFile {
        return {
            FilePath: configPath,
            Content: JSON.stringify(mergedConfig, null, 4) + '\n',
            Description: 'Updated additionalSchemaInfo with soft PK and FK definitions for integration tables',
            Category: 'schemaInfo',
        };
    }
}
