/**
 * MemberJunction Integration Sync Worker
 * ======================================
 * An OPTIONAL, out-of-process host for scheduled integration syncs. It runs the
 * SAME `SchedulingEngine` poll loop that MJAPI runs in-process, but in a dedicated
 * process with no GraphQL/Apollo — so long, memory/CPU-heavy syncs stop competing
 * with request serving.
 *
 * Why this is safe (see SYNC_OUT_OF_PROCESS_NOTE):
 *  - Sync is already decoupled: it only reads external data and writes DB rows via
 *    BaseEntity.Save(), which propagates cross-process through the existing Redis
 *    `remote-invalidate` bus — no new mechanism.
 *  - Jobs are claimed via the DB-atomic lease (spAcquireScheduledJobLock + heartbeat),
 *    so this worker and any MJAPI instance can coexist with no double-dispatch.
 *  - Boot-time `ResumeOrphanedSyncs` picks up syncs a prior crash left in-progress
 *    from durable watermarks/keyset checkpoints.
 *
 * Opt-in / preserving in-process default:
 *  - Deploying this worker IS the opt-in: once running it always polls (there is no
 *    per-worker enable flag — it reads only its documented env vars via config.ts).
 *    To OFFLOAD, set the MJAPI serving process's `scheduledJobs.enabled=false` so only
 *    the worker claims jobs. If the worker is NOT deployed, MJAPI keeps running the
 *    scheduler in-process — behavior unchanged.
 *
 * Not handled here (by design, PR 1 scope):
 *  - On-demand sync (the fire-and-forget GraphQL mutation) stays in-process.
 *  - Post-sync custom-column promotion callback is NOT registered here (a no-callback
 *    host is a supported promotion mode; auto-promote is default-OFF, and MJAPI's
 *    existing RSU-pending path performs any promotion).
 */

// --- Class registrations (drivers + connectors must be registered before the engine runs) ---
import 'mj_generatedentities';
import '@memberjunction/server-bootstrap/mj-class-registrations';

import { LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { SQLServerProviderConfigData, setupSQLServerClient, UserCache } from '@memberjunction/sqlserver-dataprovider';
import { SchedulingEngine } from '@memberjunction/scheduling-engine';
import { IntegrationEngine } from '@memberjunction/integration-engine';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import pool from './db.js';
import {
    autoRefreshInterval,
    leaseTimeoutMs,
    maxConcurrentJobs,
    mjCoreSchema,
    systemUserEmail,
} from './config.js';

let shuttingDown = false;

/** Bootstrap the MJ provider standalone (no Apollo), then start the scheduler poll loop. */
async function bootstrap(): Promise<void> {
    // 1. Provider + metadata + UserCache (the ScheduledActionsServer / AICLI pattern)
    await pool.connect();
    const providerConfig = new SQLServerProviderConfigData(pool, mjCoreSchema, autoRefreshInterval);
    await setupSQLServerClient(providerConfig);
    LogStatus(`[SyncWorker] Provider initialized against ${mjCoreSchema} (metadata refresh every ${autoRefreshInterval}ms)`);

    // 2. Redis so this worker's BaseEntity.Save() writes invalidate MJAPI's caches cross-process
    if (process.env.REDIS_URL) {
        const redis = new RedisLocalStorageProvider({
            url: process.env.REDIS_URL,
            keyPrefix: process.env.REDIS_KEY_PREFIX || 'mj',
            enablePubSub: true,
        });
        (Metadata.Provider as GenericDatabaseProvider).SetLocalStorageProvider(redis); // global-provider-ok: bootstrap (Redis cache wiring for the worker process)
        await redis.StartListening();
        LogStatus(`[SyncWorker] Redis cache invalidation connected: ${process.env.REDIS_URL}`);
    } else {
        LogStatus('[SyncWorker] REDIS_URL not set — cross-process cache invalidation disabled (single-instance only)');
    }

    // 3. Resolve the system user the jobs run as
    const systemUser: UserInfo | undefined = UserCache.Users.find(
        (u) => u.Email?.toLowerCase() === systemUserEmail.toLowerCase(),
    );
    if (!systemUser) {
        throw new Error(`[SyncWorker] System user not found with email: ${systemUserEmail}`);
    }

    // 4. Resume any syncs a prior worker/server crash left in-progress (durable watermark/keyset resume)
    try {
        await IntegrationEngine.Instance.ResumeOrphanedSyncs(systemUser);
    } catch (err) {
        LogError('[SyncWorker] ResumeOrphanedSyncs failed (continuing to start scheduler)', undefined, err);
    }

    // 5. Start the scheduler poll loop — claims due jobs via the DB-atomic lease
    const engine = SchedulingEngine.Instance;
    await engine.Config(false, systemUser);
    engine.MaxConcurrentJobs = maxConcurrentJobs;
    engine.LeaseTimeoutMs = leaseTimeoutMs;
    await engine.StartPolling(systemUser);
    LogStatus(`[SyncWorker] Started — ${engine.ScheduledJobs.length} active scheduled job(s), max ${maxConcurrentJobs} concurrent`);
}

async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    LogStatus(`[SyncWorker] ${signal} received — draining in-flight jobs (max 30s)...`);
    try {
        await SchedulingEngine.Instance.StopPolling({ waitForInflight: true, maxWaitMs: 30_000 });
    } catch (err) {
        LogError('[SyncWorker] Error stopping polling', undefined, err);
    }
    try {
        await pool.close();
    } catch {
        /* best-effort */
    }
    LogStatus('[SyncWorker] Shutdown complete');
    process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

bootstrap().catch((err) => {
    LogError('[SyncWorker] Bootstrap failed', undefined, err);
    process.exit(1);
});
