/**
 * SoftFKConfigEmitter — reads/merges additionalSchemaInfo JSON for soft PKs and FKs.
 * Works with SchemaEngine's generic TableDefinition types.
 * File-emission only — produces updated JSON content, never writes to disk directly.
 */
import type { TableDefinition, EmittedFile } from './interfaces.js';

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

/** Soft FK entry for direct use by consumers. */
export interface SoftFKEntry {
    SchemaName: string;
    TableName: string;
    FieldName: string;
    TargetSchemaName: string;
    TargetTableName: string;
    TargetFieldName: string;
}

/**
 * Manages soft PK and FK definitions in the additionalSchemaInfo JSON file.
 * Mirrors the integration schema-builder's SoftFKConfigEmitter but works
 * with SchemaEngine's generic TableDefinition types.
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
     * Add soft PK entries for tables.
     * Uses SoftPrimaryKeys from TableDefinition.
     */
    MergeSoftPKs(existing: AdditionalSchemaInfo, tableDefs: TableDefinition[]): AdditionalSchemaInfo {
        const result: AdditionalSchemaInfo = JSON.parse(JSON.stringify(existing));

        for (const table of tableDefs) {
            if (!table.SoftPrimaryKeys || table.SoftPrimaryKeys.length === 0) continue;

            if (!result[table.SchemaName]) {
                result[table.SchemaName] = [];
            }

            const schemaEntries = result[table.SchemaName];
            let tableEntry = schemaEntries.find(t => t.TableName === table.TableName);

            if (!tableEntry) {
                tableEntry = { TableName: table.TableName };
                schemaEntries.push(tableEntry);
            }

            tableEntry.PrimaryKey = table.SoftPrimaryKeys.map(fieldName => ({
                FieldName: fieldName,
                Description: `Primary key from source system`,
            }));
        }

        return result;
    }

    /**
     * Produce an EmittedFile with the updated additionalSchemaInfo JSON.
     */
    EmitConfigFile(configPath: string, mergedConfig: AdditionalSchemaInfo): EmittedFile {
        return {
            FilePath: configPath,
            Content: JSON.stringify(mergedConfig, null, 4) + '\n',
            Description: 'Updated additionalSchemaInfo with soft PK and FK definitions',
        };
    }
}
