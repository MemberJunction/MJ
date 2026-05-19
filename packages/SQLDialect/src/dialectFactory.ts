import { SQLDialect, DatabasePlatform } from './sqlDialect.js';
import { SQLServerDialect } from './sqlServerDialect.js';
import { PostgreSQLDialect } from './postgresqlDialect.js';

/**
 * Registry of dialect factories keyed by platform.
 * Add new platforms here when implementing support for MySQL, Oracle, etc.
 */
const DIALECT_MAP: Record<string, () => SQLDialect> = {
    sqlserver: () => new SQLServerDialect(),
    postgresql: () => new PostgreSQLDialect(),
};

/**
 * Resolves a {@link DatabasePlatform} string to its concrete {@link SQLDialect} instance.
 *
 * This is the single factory for dialect resolution — all consumers should
 * call this instead of maintaining their own switch/map.
 *
 * @param platform - The database platform key (e.g., 'sqlserver', 'postgresql')
 * @returns The concrete SQLDialect instance for the platform
 * @throws Error if the platform is not registered
 */
export function GetDialect(platform: DatabasePlatform | string): SQLDialect {
    const factory = DIALECT_MAP[platform];
    if (!factory) {
        throw new Error(
            `No SQLDialect registered for "${platform}". ` +
            `Supported platforms: ${Object.keys(DIALECT_MAP).join(', ')}`
        );
    }
    return factory();
}
