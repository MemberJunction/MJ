/**
 * @fileoverview Main export for Scheduling Engine Base
 * @module @memberjunction/scheduling-engine-base
 */

import { LoadScheduledJobEntityExtended } from './ScheduledJobEntityExtended';

export * from './SchedulingEngineBase';
export * from './ScheduledJobEntityExtended';

/**
 * Loader function to ensure all extended classes are registered
 */
export function LoadBaseSchedulingEngine(): void {
    LoadScheduledJobEntityExtended();
}
