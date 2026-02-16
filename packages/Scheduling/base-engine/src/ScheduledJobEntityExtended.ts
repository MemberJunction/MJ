/**
 * @fileoverview Extended ScheduledJob entity with helper methods
 * @module @memberjunction/scheduling-engine-base
 */

import { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { SchedulingEngineBase } from './SchedulingEngineBase';

/**
 * Extended ScheduledJob entity with scheduling helper methods
 *
 * Provides utilities for:
 * - Calculating next run times
 * - Determining minimum intervals
 * - Validating cron expressions
 */
@RegisterClass(MJScheduledJobEntity, 'ScheduledJobEntityExtended')
export class ScheduledJobEntityExtended extends MJScheduledJobEntity {
    /**
     * Calculate time in milliseconds until next execution
     * Note: Requires cron-parser, which is not available in base-engine
     * This method is a placeholder for server-side implementation
     */
    public GetTimeUntilNextRun(): number {
        if (this.NextRunAt) {
            return Math.max(0, this.NextRunAt.getTime() - Date.now());
        }
        return 0;
    }

    /**
     * Check if this job is currently locked by an execution
     */
    public get IsLocked(): boolean {
        return this.LockToken != null;
    }

    /**
     * Check if lock is potentially stale
     */
    public get IsLockStale(): boolean {
        if (!this.IsLocked || !this.ExpectedCompletionAt) {
            return false;
        }
        return new Date() > this.ExpectedCompletionAt;
    }

    /**
     * Get the server instance that holds the current lock
     */
    public get CurrentLockHolder(): string | null {
        return this.LockedByInstance;
    }

    /**
     * Check if job allows concurrent runs
     */
    public get AllowsConcurrent(): boolean {
        return this.ConcurrencyMode === 'Concurrent';
    }

    /**
     * Check if job queues overlapping runs
     */
    public get QueuesOverlappingRuns(): boolean {
        return this.ConcurrencyMode === 'Queue';
    }

    /**
     * Check if job skips overlapping runs
     */
    public get SkipsOverlappingRuns(): boolean {
        return this.ConcurrencyMode === 'Skip';
    }

    /**
     * Get success rate as percentage (0-100)
     */
    public get SuccessRate(): number {
        if (this.RunCount === 0) {
            return 0;
        }
        return (this.SuccessCount / this.RunCount) * 100;
    }

    /**
     * Get failure rate as percentage (0-100)
     */
    public get FailureRate(): number {
        if (this.RunCount === 0) {
            return 0;
        }
        return (this.FailureCount / this.RunCount) * 100;
    }

    /**
     * Override Save to update polling interval cache after saving
     */
    public override async Save(options?: any): Promise<boolean> {
        const result = await super.Save(options);

        if (result) {
            // Notify the scheduling engine about the change
            try {
                await this.notifyEngineOfChange();
            } catch (error) {
                // Log but don't fail the save operation
                console.error('Failed to notify engine after save:', error);
            }
        }

        return result;
    }

    /**
     * Override Delete to update polling interval cache after deletion
     */
    public override async Delete(): Promise<boolean> {
        const result = await super.Delete();

        if (result) {
            // Notify the scheduling engine about the change
            try {
                await this.notifyEngineOfChange();
            } catch (error) {
                // Log but don't fail the delete operation
                console.error('Failed to notify engine after delete:', error);
            }
        }

        return result;
    }

    /**
     * Notify the scheduling engine about job changes
     * This method reloads job metadata and restarts polling if needed
     * @private
     */
    private async notifyEngineOfChange(): Promise<void> {
        const engine = SchedulingEngineBase.Instance;

        // Force reload of job metadata
        await engine.Config(true, this.ContextCurrentUser);

        // Recalculate polling interval (will set to null if no jobs)
        engine.UpdatePollingInterval();
    }
}