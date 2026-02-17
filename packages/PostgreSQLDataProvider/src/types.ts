import { PGConnectionConfig } from './pgConnectionManager.js';
import { ProviderConfigDataBase } from '@memberjunction/core';

/**
 * Configuration options specific to the PostgreSQL provider.
 */
export interface PostgreSQLProviderConfigOptions {
    /** The PostgreSQL connection configuration */
    ConnectionConfig: PGConnectionConfig;
    /** Interval in seconds for checking metadata refresh (0 = disabled) */
    CheckRefreshIntervalSeconds: number;
}

/**
 * Configuration data for the PostgreSQL data provider.
 * Wraps the PGConnectionConfig and adds MJ-specific options.
 */
export class PostgreSQLProviderConfigData extends ProviderConfigDataBase<PostgreSQLProviderConfigOptions> {
    get ConnectionConfig(): PGConnectionConfig {
        return this.Data.ConnectionConfig;
    }

    get CheckRefreshIntervalSeconds(): number {
        return this.Data.CheckRefreshIntervalSeconds;
    }

    constructor(
        connectionConfig: PGConnectionConfig,
        MJCoreSchemaName?: string,
        checkRefreshIntervalSeconds: number = 0,
        includeSchemas?: string[],
        excludeSchemas?: string[]
    ) {
        super(
            {
                ConnectionConfig: connectionConfig,
                CheckRefreshIntervalSeconds: checkRefreshIntervalSeconds,
            },
            MJCoreSchemaName,
            includeSchemas,
            excludeSchemas
        );
    }
}
