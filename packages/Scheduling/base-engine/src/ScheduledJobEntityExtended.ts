/**
 * @fileoverview Extended ScheduledJob entity with helper methods
 * @module @memberjunction/scheduling-engine-base
 */

import { ScheduledJobEntity } from '@memberjunction/core-entities';
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
@RegisterClass(ScheduledJobEntity, 'ScheduledJobEntityExtended')
export class ScheduledJobEntityExtended extends ScheduledJobEntity {
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
            // Update the polling interval in the engine singleton
            try {
                SchedulingEngineBase.Instance.UpdatePollingInterval();
            } catch (error) {
                // Log but don't fail the save operation
                console.error('Failed to update polling interval after save:', error);
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
            // Update the polling interval in the engine singleton
            try {
                SchedulingEngineBase.Instance.UpdatePollingInterval();
            } catch (error) {
                // Log but don't fail the delete operation
                console.error('Failed to update polling interval after delete:', error);
            }
        }

        return result;
    }
}

/**
 * Loader function to ensure this class is registered
 * Prevents tree-shaking from removing the class
 */
export function LoadScheduledJobEntityExtended(): void {
    // No-op function, just ensures class is loaded
}
