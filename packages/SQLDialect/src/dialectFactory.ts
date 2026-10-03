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
/**
 * Narrows an arbitrary string to a {@link DatabasePlatform} this build can
 * actually serve. Use this instead of comparing against a hardcoded
 * `'sqlserver' | 'postgresql'` literal union at call sites — the registry
 * below is the single source of truth for which platforms exist.
 */
export function IsSupportedPlatform(platform: string | null | undefined): platform is DatabasePlatform {
    return typeof platform === 'string' && Object.prototype.hasOwnProperty.call(DIALECT_MAP, platform);
}

/**
 * The platform keys this build has a dialect for. Derived from the same
 * registry {@link GetDialect} uses, so callers never maintain a parallel list.
 */
export function SupportedPlatforms(): DatabasePlatform[] {
    return Object.keys(DIALECT_MAP) as DatabasePlatform[];
}

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
