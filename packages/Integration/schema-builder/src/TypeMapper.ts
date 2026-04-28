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
        // Sources like Salesforce under-report string lengths in their describe
        // output — we've seen real data exceed the declared MaxLength (e.g.
        // EmailTemplate.Name declared 80, actual value 83). Since MJ is a
        // read-mirror and data loss is worse than a slightly larger column,
        // apply a conservative floor and headroom:
        //   - min NVARCHAR(255) for anything declared < 255
        //   - 1.25× headroom on declared lengths 255..1000
        //   - switch to NVARCHAR(MAX) for anything over ~4000 (SQL Server limit)
        const MIN_LENGTH = 255;
        const HEADROOM_THRESHOLD = 1000;
        const SQL_SERVER_MAX_FIXED_LENGTH = 4000;

        const declared = field.MaxLength != null && field.MaxLength > 0 ? field.MaxLength : MIN_LENGTH;

        let effective: number;
        if (declared <= MIN_LENGTH) {
            effective = MIN_LENGTH;
        } else if (declared <= HEADROOM_THRESHOLD) {
            effective = Math.ceil(declared * 1.25);
        } else {
            effective = declared;
        }

        if (platform === 'sqlserver' && effective > SQL_SERVER_MAX_FIXED_LENGTH) {
            return 'NVARCHAR(MAX)';
        }
        return `${baseType}(${effective})`;
    }

    private ApplyDecimalPrecision(baseType: string, field: SourceFieldInfo): string {
        // Defensive bounds: SF's describe output for formula fields and some
        // system columns reports narrow precision (e.g. 5,0) that overflows
        // when real values land. Observed in the wild on Opportunity.Amount:
        //   "Arithmetic overflow error converting int to data type numeric."
        // Also seen on currency/formula fields that report DECIMAL(18,2) but
        // carry values > 10^16 (e.g. aggregated lifetime value across large
        // orgs). Philosophy: this is a read-mirror — we'd rather over-allocate
        // a few bytes per column than drop a sync with an arithmetic overflow.
        //
        // So we floor precision at 28 (allows values up to 10^26, comfortable
        // for any real-world currency or count) and cap at SQL Server's hard
        // limit of 38. Scale is bounded to precision and normalized to >= 0.
        const MIN_PRECISION = 28;
        const MAX_PRECISION = 38;

        let precision = field.Precision ?? MIN_PRECISION;
        let scale = field.Scale ?? 2;

        if (scale < 0) scale = 0;
        if (precision < MIN_PRECISION) precision = MIN_PRECISION;
        if (precision > MAX_PRECISION) precision = MAX_PRECISION;
        if (scale > precision) scale = precision;

        return `${baseType}(${precision},${scale})`;
    }
}
