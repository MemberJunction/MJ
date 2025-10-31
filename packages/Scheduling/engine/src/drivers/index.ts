/**
 * @fileoverview Export all scheduled job drivers
 * @module @memberjunction/scheduling-engine
 */

import { LoadAgentScheduledJobDriver } from './AgentScheduledJobDriver';
import { LoadActionScheduledJobDriver } from './ActionScheduledJobDriver';

export * from './AgentScheduledJobDriver';
export * from './ActionScheduledJobDriver';

/**
 * Loader function to ensure all drivers are registered
 * Call this at application startup to prevent tree-shaking
 */
export function LoadScheduledJobDrivers(): void {
    LoadAgentScheduledJobDriver();
    LoadActionScheduledJobDriver();
}
