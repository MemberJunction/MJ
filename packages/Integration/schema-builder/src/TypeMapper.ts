/**
 * TypeMapper — converts generic source types to platform-specific SQL types.
 */
import type { DatabasePlatform, SourceFieldInfo, TypeMappingEntry } from './interfaces.js';

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
 * Maps generic source field types to platform-specific SQL types.
 */
export class TypeMapper {
    /**
     * Convert a source field's type to the appropriate SQL type for the given platform.
     */
    MapSourceType(sourceType: string, platform: DatabasePlatform, field: SourceFieldInfo): string {
        const normalized = sourceType.toLowerCase().trim();
        const entry = TYPE_MAP.find(t => t.SourceType === normalized);

        if (!entry) {
            // Unknown type — fall back to text
            return platform === 'sqlserver' ? 'NVARCHAR(MAX)' : 'TEXT';
        }

        const baseType = platform === 'sqlserver' ? entry.SqlServerType : entry.PostgresType;
        return this.ApplyPrecision(baseType, normalized, field, platform);
    }

    /**
     * Get the MJ EntityField.Type value for a source type (informational only).
     */
    GetMJFieldType(sourceType: string): string {
        const normalized = sourceType.toLowerCase().trim();
        const entry = TYPE_MAP.find(t => t.SourceType === normalized);
        return entry ? entry.MJFieldType : 'nvarchar';
    }

    /**
     * Get all supported type mappings.
     */
    GetAllMappings(): ReadonlyArray<TypeMappingEntry> {
        return TYPE_MAP;
    }

    private ApplyPrecision(baseType: string, sourceType: string, field: SourceFieldInfo, platform: DatabasePlatform): string {
        if (sourceType === 'string') {
            return this.ApplyStringLength(baseType, field, platform);
        }
        if (sourceType === 'decimal') {
            return this.ApplyDecimalPrecision(baseType, field);
        }
        return baseType;
    }

    private ApplyStringLength(baseType: string, field: SourceFieldInfo, platform: DatabasePlatform): string {
        if (field.MaxLength != null && field.MaxLength > 0) {
            // SQL Server NVARCHAR max is 4000 before switching to MAX; PG VARCHAR has no practical limit
            if (platform === 'sqlserver' && field.MaxLength > 4000) {
                return 'NVARCHAR(MAX)';
            }
            return `${baseType}(${field.MaxLength})`;
        }
        // Default string length
        return `${baseType}(255)`;
    }

    private ApplyDecimalPrecision(baseType: string, field: SourceFieldInfo): string {
        const precision = field.Precision ?? 18;
        const scale = field.Scale ?? 2;
        return `${baseType}(${precision},${scale})`;
    }
}
