/**
 * PostgreSQL-specific query parameter processing.
 * Handles type conversion differences between SQL Server and PostgreSQL.
 */
export class PGQueryParameterProcessor {
    /**
     * Processes a parameter value for PostgreSQL.
     * Key differences from SQL Server:
     * - Booleans: true/false instead of 1/0
     * - Dates: ISO 8601 strings work natively
     * - UUIDs: passed as-is (pg driver handles them)
     */
    static ProcessParameterValue(value: unknown): unknown {
        if (value == null) return null;
        if (typeof value === 'boolean') return value; // PG natively supports boolean
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'number') return value;
        if (typeof value === 'string') return value;
        if (Buffer.isBuffer(value)) return value; // BYTEA
        return String(value);
    }

    /**
     * Converts an array of parameters for PostgreSQL execution.
     * PostgreSQL uses $1, $2, ... positional parameters.
     */
    static ProcessParameters(params: unknown[] | undefined): unknown[] {
        if (!params) return [];
        return params.map(p => PGQueryParameterProcessor.ProcessParameterValue(p));
    }

    /**
     * Converts a SQL Server BIT value (1/0) to PostgreSQL BOOLEAN.
     */
    static BitToBoolean(value: unknown): boolean | null {
        if (value == null) return null;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            const lower = value.toLowerCase();
            return lower === 'true' || lower === '1' || lower === 'yes';
        }
        return Boolean(value);
    }
}
