/**
 * @fileoverview Worker-mode poll loop for durable integration sync runs (PR 1 item 8).
 * @module MJServer/services
 */

import { LogError, LogStatus, LogStatusEx, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { IntegrationEngine } from '@memberjunction/integration-engine';
import { IntegrationSyncWorkerConfig } from '../config.js';

/**
 * Polls `CompanyIntegrationRun` for `Status='Queued'` rows, claims each one atomically,
 * executes it, and releases — the enqueue/execute split that lets a sync outlive the
 * request that asked for it.
 *
 * Multiple workers (in this process or others) may poll the same queue: the claim sproc
 * admits exactly one, and every loser simply moves on to the next candidate. Nothing here
 * assumes it is the only worker.
 */
export class IntegrationSyncWorkerService {
    private config: IntegrationSyncWorkerConfig;
    private systemUser: UserInfo | null = null;
    private timer: NodeJS.Timeout | null = null;
    private isRunning = false;
    private polling = false;
    /** Run IDs currently executing in THIS process — bounds concurrency and prevents self-collision. */
    private inFlight = new Set<string>();

    constructor(config: IntegrationSyncWorkerConfig) {
        this.config = config;
    }

    public get IsEnabled(): boolean {
        return this.config.enabled;
    }

    public get IsRunning(): boolean {
        return this.isRunning;
    }

    /** Number of queued runs this worker is currently executing. */
    public get InFlightCount(): number {
        return this.inFlight.size;
    }

    /** Resolve the system user the worker executes syncs as. */
    public async Initialize(): Promise<void> {
        if (!this.config.enabled) return;

        const email = this.config.systemUserEmail;
        this.systemUser = UserCache.Users.find(u => u.Email?.toLowerCase() === email.toLowerCase()) ?? null;
        if (!this.systemUser) {
            throw new Error(`[IntegrationSyncWorker] System user not found with email: ${email}`);
        }
        await IntegrationEngine.Instance.Config(false, this.systemUser);
    }

    /** Begin polling the queue. */
    public Start(): void {
        if (!this.config.enabled || this.isRunning) return;
        if (!this.systemUser) {
            throw new Error('[IntegrationSyncWorker] Not initialized — call Initialize() first');
        }

        this.isRunning = true;
        this.timer = setInterval(() => void this.pollOnce(), this.config.pollingIntervalMs);
        LogStatusEx({
            message: `🔄 Integration Sync Worker: polling every ${Math.round(this.config.pollingIntervalMs / 1000)}s, up to ${this.config.maxConcurrentRuns} concurrent run(s)`,
            verboseOnly: true,
        });
        // Don't wait a full interval to drain a queue that already has work.
        void this.pollOnce();
    }

    /**
     * Stop polling. In-flight runs are left to finish on their own — their leases are
     * renewed by the engine's heartbeat, so killing them here would only strand rows.
     */
    public Stop(): void {
        if (!this.isRunning) return;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.isRunning = false;
        LogStatus(`[IntegrationSyncWorker] Stopped polling (${this.inFlight.size} run(s) still in flight)`);
    }

    /**
     * One poll pass: fetch claimable candidates up to the free concurrency slots and start
     * each. Overlapping passes are suppressed so a slow query can't stack up timers.
     */
    private async pollOnce(): Promise<void> {
        if (this.polling || !this.isRunning || !this.systemUser) return;

        const slots = this.config.maxConcurrentRuns - this.inFlight.size;
        if (slots <= 0) return;

        this.polling = true;
        try {
            const candidates = await IntegrationEngine.PollQueuedRuns(this.systemUser, slots);
            for (const candidate of candidates) {
                if (this.inFlight.has(candidate.ID)) continue;
                this.startRun(candidate.ID);
            }
        } catch (err) {
            LogError(`[IntegrationSyncWorker] Poll failed`, undefined, err);
        } finally {
            this.polling = false;
        }
    }

    /**
     * Execute one queued run in the background. Losing the claim race is normal — the run
     * is simply someone else's — so it is logged as information, never as an error.
     */
    private startRun(runID: string): void {
        if (!this.systemUser) return;

        this.inFlight.add(runID);
        void IntegrationEngine.Instance
            .ExecuteQueuedRun(runID, this.systemUser)
            .then(result => {
                if (result.Success) {
                    LogStatus(`[IntegrationSyncWorker] Run ${runID} completed: ${result.RecordsProcessed} record(s) processed`);
                } else {
                    LogStatus(`[IntegrationSyncWorker] Run ${runID} did not complete: ${result.ErrorMessage ?? 'unknown reason'}`);
                }
            })
            .catch(err => {
                LogError(`[IntegrationSyncWorker] Run ${runID} threw`, undefined, err);
            })
            .finally(() => {
                this.inFlight.delete(runID);
            });
    }
}
