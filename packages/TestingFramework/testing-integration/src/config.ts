/**
 * config.ts — environment / database / client configuration resolution for the
 * integration-test bootstrap. Lifted verbatim from the original live harness
 * (packages/MJServer/integration-test-scripts/lib/harness.ts) so the standalone
 * tsx scripts and the IntegrationTestDriver resolve settings identically.
 *
 * No hardcoded secrets: everything comes from the repo-root .env / mj.config.cjs.
 */
import dotenv from 'dotenv';
import path from 'path';
import { cosmiconfig } from 'cosmiconfig';

/** The database backend the integration run targets. Mirrors the repo-wide DB_PLATFORM convention. */
export type IntegrationDbPlatform = 'sqlserver' | 'postgresql';

/**
 * Resolve the target backend from DB_PLATFORM. Mirrors the canonical
 * resolveDbPlatformFromEnv (@memberjunction/generic-database-provider) but kept inline
 * so the lightweight config layer doesn't pull that package's module-load cost in just
 * to read one env var. Strict: only 'sqlserver' / 'postgresql' (case-insensitive),
 * default 'sqlserver', throws on anything else (legacy aliases are not accepted).
 */
function resolveIntegrationDbPlatform(): IntegrationDbPlatform {
    const raw = process.env.DB_PLATFORM;
    if (raw === undefined || raw.trim() === '') return 'sqlserver';
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'sqlserver' || normalized === 'postgresql') return normalized;
    throw new Error(
        `Invalid DB_PLATFORM value '${raw}'. Must be 'sqlserver' or 'postgresql' (case-insensitive).`
    );
}

/**
 * Minimal shape of the `mj.config.cjs` we read. cosmiconfig returns an untyped
 * config; we narrow it to just the keys this library consumes.
 */
interface MJConfigShape {
    databaseSettings?: {
        host?: string;
        port?: number | string;
        user?: string;
        password?: string;
        database?: string;
        mjCoreSchema?: string;
    };
    mjCoreSchema?: string;
}

/**
 * Loads the repo-root .env into process.env. Must be called from a process whose
 * cwd is the repository root (documented usage for the integration scripts).
 */
export function LoadEnv(): void {
    dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
}

export interface DbConfig {
    Host: string;
    Port: number;
    User: string;
    Password: string;
    Database: string;
    Schema: string;
    /** Which backend to bootstrap. Resolved from DB_PLATFORM (default 'sqlserver'). */
    Platform: IntegrationDbPlatform;
}

/**
 * Resolves database settings from mj.config.cjs (databaseSettings) with .env
 * fallbacks. Throws with a clear message when required settings are missing.
 */
export async function LoadDbConfig(): Promise<DbConfig> {
    const configResult = await cosmiconfig('mj').search();
    const config: MJConfigShape = (configResult?.config ?? {}) as MJConfigShape;
    const dbSettings = config.databaseSettings ?? {};

    const host = dbSettings.host || process.env.DB_HOST;
    const user = dbSettings.user || process.env.DB_USERNAME;
    const password = dbSettings.password || process.env.DB_PASSWORD;
    const database = dbSettings.database || process.env.DB_DATABASE;
    if (!host || !user || !password || !database) {
        throw new Error(
            'Missing DB settings. Provide them via mj.config.cjs databaseSettings or .env ' +
            '(DB_HOST, DB_USERNAME, DB_PASSWORD, DB_DATABASE). Run from the repo root.'
        );
    }
    // DB_PLATFORM ∈ {sqlserver, postgresql}; throws on invalid values.
    const platform: IntegrationDbPlatform = resolveIntegrationDbPlatform();
    const defaultPort = platform === 'postgresql' ? 5432 : 1433;
    return {
        Host: host,
        Port: Number(dbSettings.port ?? process.env.DB_PORT ?? defaultPort),
        User: user,
        Password: password,
        Database: database,
        Schema: config.mjCoreSchema || dbSettings.mjCoreSchema || '__mj',
        Platform: platform
    };
}

export interface ClientConfig {
    Url: string;
    MJAPIKey: string;
}

/**
 * Resolves the MJAPI GraphQL endpoint and system API key from env:
 *  - MJAPI_URL overrides everything; otherwise http://localhost:{GRAPHQL_PORT}{GRAPHQL_ROOT_PATH}
 *  - MJ_API_KEY is the system API key MJServer accepts via the x-mj-api-key header
 */
export function LoadClientConfig(): ClientConfig {
    const apiKey = process.env.MJ_API_KEY;
    if (!apiKey) {
        throw new Error('MJ_API_KEY is not set in the environment — required for client-side tests.');
    }
    const port = process.env.GRAPHQL_PORT ?? '4000';
    const rootPath = process.env.GRAPHQL_ROOT_PATH ?? '/';
    const url = process.env.MJAPI_URL ?? `http://localhost:${port}${rootPath.startsWith('/') ? rootPath : `/${rootPath}`}`;
    return { Url: url, MJAPIKey: apiKey };
}
