/**
 * Configuration for the Integration Sync Worker, read from environment variables
 * (mirrors the ScheduledActionsServer pattern). The worker deliberately does NOT
 * read mj.config.cjs directly so it can be deployed as an independent process with
 * only the DB + scheduling env it needs.
 */
import env from 'env-var';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// --- Database (same target DB as MJAPI) ---
export const dbHost = env.get('DB_HOST').required().asString();
export const dbPort = env.get('DB_PORT').default('1433').asPortNumber();
export const dbUsername = env.get('DB_USERNAME').required().asString();
export const dbPassword = env.get('DB_PASSWORD').required().asString();
export const dbDatabase = env.get('DB_DATABASE').required().asString();
export const dbTrustServerCertificate = env.get('DB_TRUST_SERVER_CERTIFICATE').default('true').asBool();
export const dbEncrypt = env.get('DB_ENCRYPT').default('true').asBool();

export const mjCoreSchema = env.get('MJ_CORE_SCHEMA').default('__mj').asString();

/**
 * Metadata cache refresh interval (ms). Defaults to 180000 (3 min) — the same
 * cross-server convergence cadence MJAPI uses, so the worker sees schema/metadata
 * changes another process made without a restart.
 */
export const autoRefreshInterval = env.get('METADATA_AUTO_REFRESH_INTERVAL').default('180000').asIntPositive();

// --- Scheduled jobs (the worker's whole job) ---
/** The MJ user the worker runs scheduled jobs as. Must exist in the DB. */
export const systemUserEmail = env.get('SCHEDULED_JOBS_SYSTEM_USER_EMAIL').required().asString();
/** Max concurrently-dispatched scheduled jobs (engine default 5). */
export const maxConcurrentJobs = env.get('SCHEDULED_JOBS_MAX_CONCURRENT').default('5').asIntPositive();
/** Lease timeout (ms) for the DB-atomic job lock (engine default 600000). */
export const leaseTimeoutMs = env.get('SCHEDULED_JOBS_LEASE_TIMEOUT_MS').default('600000').asIntPositive();
