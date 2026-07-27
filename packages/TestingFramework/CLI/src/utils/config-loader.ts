/**
 * @fileoverview Configuration loader for CLI
 * @module @memberjunction/testing-cli
 */

import { cosmiconfig } from 'cosmiconfig';
import dotenv from 'dotenv';
import path from 'path';
import { CLIConfig } from '../types';
// Type-only: erased at compile time, so this pulls no runtime module into a file every
// command imports (testing-integration's barrel is server-laden).
import type { IntegrationDbPlatform } from '@memberjunction/testing-integration';

// Load environment variables BEFORE loading config
// This ensures process.env is populated when mj.config.cjs is evaluated
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true, quiet: true });

/**
 * The database backend `mj test` targets.
 *
 * Aliased from testing-integration's union rather than restated, because the two MUST agree:
 * the CLI resolves the platform for provider setup and publishes it on the bootstrap context,
 * and the driver reads it back off that context to decide which bundles can run. A hand-copied
 * union would drift silently the moment a third backend appears. `import type` is erased at
 * compile time, so this adds no runtime import.
 */
export type MJDbPlatform = IntegrationDbPlatform;

/** Well-known default port per backend, used only when neither config nor env supplies one. */
export function defaultPortForPlatform(platform: MJDbPlatform): number {
    return platform === 'postgresql' ? 5432 : 1433;
}

/**
 * Resolve the target backend: an explicit config value wins, else `DB_PLATFORM`, else
 * SQL Server.
 *
 * Strict on purpose — an unrecognized value throws rather than falling back. Silently
 * defaulting a typo like `postgres` to SQL Server would run the entire PostgreSQL parity
 * lane against SQL Server and report a green that proves nothing, which is precisely the
 * class of false confidence this lane exists to remove.
 */
export function resolveDbPlatform(configured?: string): MJDbPlatform {
    const raw = configured ?? process.env.DB_PLATFORM;
    if (raw === undefined || raw.trim() === '') {
        return 'sqlserver';
    }
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'sqlserver' || normalized === 'postgresql') {
        return normalized;
    }
    throw new Error(
        `Invalid database platform '${raw}'. Must be 'sqlserver' or 'postgresql' (case-insensitive). ` +
        `Set it via DB_PLATFORM or the dbPlatform key in mj.config.cjs.`
    );
}

export interface MJConfig {
    // Database settings
    dbHost?: string;
    dbDatabase?: string;
    dbPort?: number | string;
    dbUsername?: string;
    dbPassword?: string;
    coreSchema?: string;
    /**
     * Which backend to connect to. Populated by {@link loadMJConfig} even when the
     * config file omits it, so downstream code can branch on it unconditionally.
     */
    dbPlatform?: MJDbPlatform;

    // Testing CLI specific settings
    testing?: {
        /**
         * Module specifiers side-effect-imported before `mj test` resolves any integration
         * bundle — each import registers its check bundles on the IntegrationCheckRegistry.
         * In this repo: ['@memberjunction/integration-test-suite'] (the private content
         * package the published CLI must not depend on). See utils/check-module-loader.ts.
         */
        checkModules?: string[];
        defaultEnvironment?: string;
        defaultFormat?: 'console' | 'json' | 'markdown';
        failFast?: boolean;
        parallel?: boolean;
        maxParallelTests?: number;
        timeout?: number;
    };

    // Legacy format database config
    database?: {
        host?: string;
        name?: string;
        port?: number;
        username?: string;
        password?: string;
        schema?: string;
    };
}

let cachedConfig: MJConfig | null = null;

/**
 * Load MJ configuration from mj.config.cjs
 *
 * The raw cosmiconfig result is normalized before it is cached: the platform is always
 * resolved (so callers never have to re-derive it), and each database setting falls back to
 * its conventional environment variable. Without that merge a config file that omits a key
 * yields `undefined` even when the environment defines it, which is how `DB_PLATFORM` came
 * to be unreadable on this code path.
 *
 * @returns Full MJ configuration, with the platform resolved and env fallbacks applied
 */
export async function loadMJConfig(): Promise<MJConfig> {
    if (cachedConfig) {
        return cachedConfig;
    }

    // Clear any existing require cache for mj.config.cjs to ensure env vars are re-evaluated.
    // require.cache is only available in CommonJS; in ESM, cosmiconfig's cache:false handles this.
    const configPath = path.resolve(process.cwd(), 'mj.config.cjs');
    if (typeof require !== 'undefined') {
        delete require.cache[configPath];
    }

    // Create a new explorer instance to ensure fresh config load with current env vars
    const explorer = cosmiconfig('mj', {
        cache: false  // Disable caching to ensure fresh load
    });
    const result = await explorer.search();

    if (!result) {
        throw new Error(`No mj.config.cjs configuration found. Ensure you're running from the MJ repository root.`);
    }

    cachedConfig = normalizeMJConfig(result.config as MJConfig);
    return cachedConfig;
}

/**
 * Resolve the platform and layer environment fallbacks under the file's own values, so
 * every consumer sees one fully-populated config rather than each re-implementing the
 * "config value, else env var, else default" chain.
 */
function normalizeMJConfig(raw: MJConfig): MJConfig {
    const dbPlatform = resolveDbPlatform(raw.dbPlatform);
    return {
        ...raw,
        dbPlatform,
        dbHost: raw.dbHost ?? process.env.DB_HOST,
        dbDatabase: raw.dbDatabase ?? process.env.DB_DATABASE,
        dbUsername: raw.dbUsername ?? process.env.DB_USERNAME,
        dbPassword: raw.dbPassword ?? process.env.DB_PASSWORD,
        // NOTE: this repo's own mj.config.cjs always supplies dbPort, so the platform default
        // below is a fallback for configs that omit it — it is NOT what protects the PG lane.
        // The committed config resolves the port itself (platform-aware as of this change) and
        // the PG CI job sets DB_PORT=5432 explicitly.
        dbPort: raw.dbPort ?? process.env.DB_PORT ?? defaultPortForPlatform(dbPlatform),
        coreSchema: raw.coreSchema ?? process.env.MJ_CORE_SCHEMA ?? '__mj',
    };
}

/**
 * Load testing CLI configuration with defaults
 *
 * @returns CLI configuration
 */
export function loadCLIConfig(): CLIConfig {
    // Synchronous version for backward compatibility
    // Uses cached config if available, otherwise returns defaults
    const testingConfig = cachedConfig?.testing || {};

    return {
        defaultEnvironment: testingConfig.defaultEnvironment || process.env.MJ_TEST_ENV || 'dev',
        defaultFormat: testingConfig.defaultFormat || 'console',
        failFast: testingConfig.failFast ?? false,
        parallel: testingConfig.parallel ?? false,
        maxParallelTests: testingConfig.maxParallelTests || 5,
        timeout: testingConfig.timeout || 300000,  // 5 minutes
        database: cachedConfig?.database || {
            host: cachedConfig?.dbHost || 'localhost',
            name: cachedConfig?.dbDatabase,
            port: typeof cachedConfig?.dbPort === 'string' ? parseInt(cachedConfig.dbPort) : cachedConfig?.dbPort,
            username: cachedConfig?.dbUsername,
            password: cachedConfig?.dbPassword,
            schema: cachedConfig?.coreSchema || '__mj'
        }
    };
}
