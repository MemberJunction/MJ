/**
 * TypeMapper — converts generic abstract field types to platform-specific SQL types.
 * Works with the SchemaEngine's generic ColumnDefinition (no integration-engine dependency).
 */
import type { ColumnDefinition, DatabasePlatform, SchemaFieldType, TypeMappingEntry } from './interfaces.js';

const TYPE_MAP: TypeMappingEntry[] = [
    { SourceType: 'string',    SqlServerType: 'NVARCHAR',         PostgresType: 'VARCHAR',          MJFieldType: 'nvarchar' },
    { SourceType: 'text',      SqlServerType: 'NVARCHAR(MAX)',    PostgresType: 'TEXT',              MJFieldType: 'nvarchar' },
    { SourceType: 'integer',   SqlServerType: 'INT',              PostgresType: 'INTEGER',           MJFieldType: 'int' },
    { SourceType: 'bigint',    SqlServerType: 'BIGINT',           PostgresType: 'BIGINT',            MJFieldType: 'bigint' },
    { SourceType: 'decimal',   SqlServerType: 'DECIMAL',          PostgresType: 'NUMERIC',           MJFieldType: 'decimal' },
    { SourceType: 'boolean',   SqlServerType: 'BIT',              PostgresType: 'BOOLEAN',           MJFieldType: 'bit' },
    { SourceType: 'datetime',  SqlServerType: 'DATETIMEOFFSET',   PostgresType: 'TIMESTAMPTZ',       MJFieldType: 'datetimeoffset' },
    { SourceType: 'date',      SqlServerType: 'DATE',             PostgresType: 'DATE',              MJFieldType: 'date' },
    { SourceType: 'uuid',      SqlServerType: 'UNIQUEIDENTIFIER', PostgresType: 'UUID',              MJFieldType: 'uniqueidentifier' },
    { SourceType: 'json',      SqlServerType: 'NVARCHAR(MAX)',    PostgresType: 'JSONB',             MJFieldType: 'nvarchar' },
    { SourceType: 'float',     SqlServerType: 'FLOAT',            PostgresType: 'DOUBLE PRECISION',  MJFieldType: 'float' },
    { SourceType: 'time',      SqlServerType: 'TIME',             PostgresType: 'TIME',              MJFieldType: 'time' },
];

/**
 * Maps generic SchemaFieldType values to platform-specific SQL types.
 */
export class TypeMapper {
    /**
     * Map a SchemaFieldType to the platform SQL type string,
     * applying MaxLength / Precision / Scale from the column definition.
     */
    MapType(type: SchemaFieldType, col: ColumnDefinition, platform: DatabasePlatform): string {
        const normalized = type.toLowerCase().trim();
        const entry = TYPE_MAP.find(t => t.SourceType === normalized);

        if (!entry) {
            return platform === 'sqlserver' ? 'NVARCHAR(MAX)' : 'TEXT';
        }

        const base = platform === 'sqlserver' ? entry.SqlServerType : entry.PostgresType;
        return this.applyPrecision(base, normalized, col, platform);
    }

    /**
     * Map a loose string type (from external sources) to the platform SQL type.
     * Useful when consuming data from connectors that return string type names.
     */
    MapSourceType(sourceType: string, col: ColumnDefinition, platform: DatabasePlatform): string {
        return this.MapType(sourceType.toLowerCase().trim() as SchemaFieldType, col, platform);
    }

    /**
     * Get the MJ EntityField.Type value for a SchemaFieldType (informational).
     */
    GetMJFieldType(type: SchemaFieldType | string): string {
        const entry = TYPE_MAP.find(t => t.SourceType === type.toLowerCase().trim());
        return entry ? entry.MJFieldType : 'nvarchar';
    }

    /**
     * Return all supported type mappings (read-only).
     */
    GetAllMappings(): ReadonlyArray<TypeMappingEntry> {
        return TYPE_MAP;
    }

    private applyPrecision(
        base: string,
        type: string,
        col: ColumnDefinition,
        platform: DatabasePlatform
    ): string {
        if (type === 'string') {
            return this.applyStringLength(base, col, platform);
        }
        if (type === 'decimal') {
            const precision = col.Precision ?? 18;
            const scale = col.Scale ?? 2;
            return `${base}(${precision},${scale})`;
        }
        return base;
    }

    private applyStringLength(base: string, col: ColumnDefinition, platform: DatabasePlatform): string {
        if (col.MaxLength != null && col.MaxLength > 0) {
            if (platform === 'sqlserver' && col.MaxLength > 4000) return 'NVARCHAR(MAX)';
            return `${base}(${col.MaxLength})`;
        }
        return `${base}(255)`;
    }
}
