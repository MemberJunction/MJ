import { MJGlobal } from '@memberjunction/global';
import { SQLDialect, DatabasePlatform } from './sqlDialect.js';
import { QueryDialect } from './queryDialect.js';
import type { DialectKey } from './facets/dialectKey.js';
import { SQLServerDialect } from './sqlServerDialect.js';
import { PostgreSQLDialect } from './postgresqlDialect.js';
import { MySQLQueryDialect } from './dialects/mysqlQueryDialect.js';
import { OracleQueryDialect } from './dialects/oracleQueryDialect.js';
import { SnowflakeQueryDialect } from './dialects/snowflakeQueryDialect.js';
import { DatabricksQueryDialect } from './dialects/databricksQueryDialect.js';

/**
 * The dialects of the platforms MJ itself runs on. Built-in dialects are constructed directly and
 * are not registered with the class factory, so neither import order nor a test that stubs
 * `@memberjunction/global` can make one unresolvable.
 */
const PLATFORM_DIALECT_CLASSES = [SQLServerDialect, PostgreSQLDialect] as const;

/** The query-only dialects this package ships, constructed directly for the same reason. */
const QUERY_ONLY_DIALECT_CLASSES = [MySQLQueryDialect, OracleQueryDialect, SnowflakeQueryDialect, DatabricksQueryDialect] as const;

/** The platform keys, in order. */
const PLATFORM_KEYS: readonly DatabasePlatform[] = PLATFORM_DIALECT_CLASSES.map(dialectClass => new dialectClass().PlatformKey);

/** Every built-in dialect, keyed by its exact key, as a factory for a new instance. */
const BUILT_IN_DIALECTS: ReadonlyMap<string, () => QueryDialect> = new Map(
    [...PLATFORM_DIALECT_CLASSES, ...QUERY_ONLY_DIALECT_CLASSES].map(dialectClass => {
        const factory = (): QueryDialect => new dialectClass();
        return [factory().Key, factory] as const;
    }),
);

/**
 * Narrows an arbitrary string to a {@link DatabasePlatform} this build can
 * actually serve. Use this instead of comparing against a hardcoded
 * `'sqlserver' | 'postgresql'` literal union at call sites — the platform
 * dialects are the single source of truth for which platforms exist.
 */
export function IsSupportedPlatform(platform: string | null | undefined): platform is DatabasePlatform {
    return typeof platform === 'string' && PLATFORM_KEYS.some(key => key === platform);
}

/**
 * The platform keys this build has a dialect for. Derived from the same
 * dialects {@link GetDialect} serves, so callers never maintain a parallel list.
 */
export function SupportedPlatforms(): DatabasePlatform[] {
    return [...PLATFORM_KEYS];
}

/**
 * The keys of every dialect that resolves: the built-in ones, then any third-party dialect
 * registered with the class factory under {@link QueryDialect}.
 */
export function RegisteredDialectKeys(): DialectKey[] {
    return [...new Set([...BUILT_IN_DIALECTS.keys(), ...classFactoryDialectKeys()])];
}

/** Keys registered with the class factory under {@link QueryDialect}; empty when the factory is unavailable. */
function classFactoryDialectKeys(): string[] {
    try {
        return MJGlobal.Instance.ClassFactory.GetAllRegistrations(QueryDialect)
            .map(registration => registration.Key)
            .filter((key): key is string => typeof key === 'string');
    } catch {
        return [];
    }
}

/**
 * Creates the dialect under exactly `key` (same case): a built-in one directly, otherwise the
 * class-factory registration for it. Returns `null` when there is none.
 */
function createDialect(key: string): QueryDialect | null {
    const builtIn = BUILT_IN_DIALECTS.get(key);
    return builtIn ? builtIn() : createFromClassFactory(key);
}

/** A consumer-registered dialect for exactly `key` from the class factory, or `null`. */
function createFromClassFactory(key: string): QueryDialect | null {
    try {
        const factory = MJGlobal.Instance.ClassFactory;
        const registration = factory.GetRegistration(QueryDialect, key);
        if (!registration || registration.Key !== key) {
            return null;
        }
        return factory.CreateInstance<QueryDialect>(QueryDialect, key);
    } catch {
        return null;
    }
}

/**
 * Resolves a dialect key to a new instance of its {@link QueryDialect}, such as `'mysql'` or
 * `'snowflake'` for an External Data Source, or `'sqlserver'` / `'postgresql'` (which are full
 * {@link SQLDialect}s). Built-in keys resolve directly; any other key resolves through a
 * class-factory registration under {@link QueryDialect}.
 *
 * @throws Error if no dialect exists under the key
 */
export function GetQueryDialect(key: DialectKey): QueryDialect {
    const dialect = createDialect(key);
    if (!dialect) {
        throw new Error(
            `No QueryDialect registered for "${key}". ` +
            `Registered dialects: ${RegisteredDialectKeys().join(', ')}`
        );
    }
    return dialect;
}

/**
 * Resolves a platform key to its concrete {@link SQLDialect} instance.
 *
 * This is the single factory for platform dialect resolution — all consumers should
 * call this instead of maintaining their own switch/map. It serves the built-in platform
 * dialects and any full {@link SQLDialect} registered with the class factory; a query-only
 * dialect (see {@link GetQueryDialect}) is refused.
 *
 * @param platform - The database platform key (e.g., 'sqlserver', 'postgresql')
 * @returns The concrete SQLDialect instance for the platform
 * @throws Error if no SQLDialect exists under the key
 */
export function GetDialect(platform: DatabasePlatform | DialectKey): SQLDialect {
    const dialect = createDialect(platform);
    if (!(dialect instanceof SQLDialect)) {
        throw new Error(
            `No SQLDialect registered for "${platform}". ` +
            `Supported platforms: ${PLATFORM_KEYS.join(', ')}`
        );
    }
    return dialect;
}

/** The keys of the query-only dialects this package ships. */
export function ShippedQueryOnlyDialectKeys(): DialectKey[] {
    return QUERY_ONLY_DIALECT_CLASSES.map(dialectClass => new dialectClass().Key);
}
